// Multi-store order grouping. When a customer's cart spans multiple
// in-zone stores AND no single store can fulfil it (the cross-zone
// re-match in POST /orders gave up with 422), we split the cart into
// one Order per store and link them together with an OrderGroup row.
//
// The customer apps roll up by orderGroupId for the unified timeline;
// the driver gets a multi-pickup sequence (one driver carries every
// leg); admin sees per-store accept/reject and can rescue a stuck leg
// without nuking the basket.
//
// Single-store carts still create a plain Order with orderGroupId
// = null and skip this service entirely — so the splitting path is
// pure opt-in and existing tests / flows aren't affected.

import type { Prisma, PaymentMethod, PrismaClient } from '@prisma/client';
import { haversineDistance } from '../utils/geo';

type Tx = PrismaClient | Prisma.TransactionClient;

interface ResolvedItem {
  catalogItemId: string;
  qty: number;
}

interface ZoneCandidate {
  id: string;
  lat: number;
  lng: number;
  /** Customer-facing average rating, 0..5. Used as a tiebreak in
   *  planSplit so a 4.8★ store is preferred over a 3.2★ store when
   *  they cover the same number of cart items. Defaults to 0. */
  rating?: number;
  /** Admin-flagged "preferred" store — gets a small score bump in
   *  planSplit so promoted stores rank above equivalent stores. */
  isPreferred?: boolean;
  items: Array<{
    id: string;
    catalogItemId: string;
    price: number;
    adminMargin: number;
    stockQty: number;
  }>;
}

export interface SplitPlanLeg {
  storeId: string;
  catalogItemIds: string[];
}

/**
 * Greedy set-cover: for a cart of catalog item ids and a list of
 * candidate in-zone stores (each with the catalog ids it carries in
 * stock), return the smallest list of stores that collectively carry
 * every item, or null if no combination covers the cart.
 *
 * Scoring (all higher = better — applied in tie-breaks AFTER coverage):
 *   1. coverage    — number of currently-uncovered cart items the
 *                    store can fulfil (primary; coverage is everything)
 *   2. preferred   — admin-flagged stores bump 0.15
 *   3. rating      — 0..1 normalised from 0..5
 *   4. proximity   — closer to dropoff wins (final tiebreak)
 *
 * NP-hard in the general case but cart sizes we deal with (a dozen
 * items, ~10 candidate stores) make greedy plenty good.
 */
const PREFERRED_BOOST = 0.15;
const SPLIT_PROXIMITY_KM_NORM = 10; // 1 km closer ≈ 0.1 score

export function planSplit(
  cartCatalogIds: string[],
  candidates: ZoneCandidate[],
  dropoff: { lat: number; lng: number },
): SplitPlanLeg[] | null {
  const remaining = new Set(cartCatalogIds);
  const plan: SplitPlanLeg[] = [];
  // Keep a mutable view of what each store can still contribute so we
  // never re-pick the same store on a later iteration.
  const stillAvailable = candidates.map((c) => ({
    store: c,
    carriedRemaining: new Set(
      c.items.filter((i) => remaining.has(i.catalogItemId)).map((i) => i.catalogItemId),
    ),
  }));
  while (remaining.size > 0) {
    stillAvailable.sort((a, b) => {
      // Coverage is THE primary criterion — a store covering 4 items
      // wins over one covering 1 every time, regardless of rating.
      const dx = b.carriedRemaining.size - a.carriedRemaining.size;
      if (dx !== 0) return dx;
      // Same coverage → score by rating + preferred + proximity.
      // Higher score wins, so we sort B - A.
      const scoreA = scoreSplitCandidate(a.store, dropoff);
      const scoreB = scoreSplitCandidate(b.store, dropoff);
      return scoreB - scoreA;
    });
    const best = stillAvailable[0];
    if (!best || best.carriedRemaining.size === 0) {
      // No remaining store covers any uncovered item — split impossible.
      return null;
    }
    const ids = [...best.carriedRemaining];
    plan.push({ storeId: best.store.id, catalogItemIds: ids });
    for (const id of ids) remaining.delete(id);
    // Strip the picked store + the items it covered out of every other
    // candidate so a later iteration doesn't double-count them.
    for (const c of stillAvailable) {
      for (const id of ids) c.carriedRemaining.delete(id);
    }
    stillAvailable.shift();
  }
  return plan;
}

/** Composite tie-break score for two candidates that cover the same
 *  number of remaining items. Higher = better. */
function scoreSplitCandidate(
  store: ZoneCandidate,
  dropoff: { lat: number; lng: number },
): number {
  const ratingScore = (store.rating ?? 0) / 5;
  const dist = haversineDistance(store.lat, store.lng, dropoff.lat, dropoff.lng);
  const proximityScore = Math.max(0, 1 - dist / SPLIT_PROXIMITY_KM_NORM);
  const preferredBoost = store.isPreferred ? PREFERRED_BOOST : 0;
  return ratingScore * 0.4 + proximityScore * 0.45 + preferredBoost;
}

/**
 * Create the OrderGroup parent row. Per-store Order children are then
 * inserted by the caller via tx.order.create with `orderGroupId` set.
 * Aggregate totals are summed up from the children (the caller owns
 * per-store math; we just persist the rollup).
 */
export async function createOrderGroup(
  tx: Tx,
  input: {
    customerId: string;
    deliveryAddressId: string;
    subtotal: number;
    deliveryFee: number;
    total: number;
    paymentMethod: PaymentMethod;
    recipientName: string | null;
    recipientPhone: string | null;
  },
): Promise<{ id: string }> {
  const group = await tx.orderGroup.create({
    data: {
      customerId: input.customerId,
      deliveryAddressId: input.deliveryAddressId,
      subtotal: input.subtotal,
      deliveryFee: input.deliveryFee,
      total: input.total,
      paymentMethod: input.paymentMethod,
      paymentStatus: 'PENDING',
      recipientName: input.recipientName,
      recipientPhone: input.recipientPhone,
    },
    select: { id: true },
  });
  return group;
}

/**
 * Fan a driver assignment across every leg of a group. Called once a
 * driver has been picked for the group (via cascade or broadcast-accept
 * on the seed order) so every sibling leg gets the same driverId and
 * the customer sees a single driver doing sequential pickups.
 *
 * Updates:
 *   * OrderGroup.driverId
 *   * Order.driverId + Order.driverAssignedAt on every sibling that
 *     isn't already CANCELLED. Status flips to DRIVER_ASSIGNED for
 *     legs still at STORE_ACCEPTED so the driver app's "pending pickup
 *     legs" list shows everything that needs to be picked up.
 *
 * No-op when the seed order isn't part of a group — callers can call
 * this unconditionally.
 */
export async function assignDriverToGroup(
  tx: Tx,
  seedOrderId: string,
  driverId: string,
): Promise<void> {
  const seed = await tx.order.findUnique({
    where: { id: seedOrderId },
    select: { orderGroupId: true },
  });
  if (!seed?.orderGroupId) return;
  await tx.orderGroup.update({
    where: { id: seed.orderGroupId },
    data: { driverId },
  });
  await tx.order.updateMany({
    where: {
      orderGroupId: seed.orderGroupId,
      status: { in: ['STORE_ACCEPTED', 'COOKING'] },
    },
    data: {
      driverId,
      status: 'DRIVER_ASSIGNED',
      driverAssignedAt: new Date(),
    },
  });
}

/**
 * Roll the child Order statuses up into the parent OrderGroup so the
 * customer-facing summary stays consistent. Rules:
 *   * any child PENDING  → group PENDING
 *   * all children STORE_ACCEPTED+ → group STORE_ACCEPTED
 *   * all children DELIVERED → group DELIVERED
 *   * any child CANCELLED  → group stays at the lowest non-cancelled
 *     state (we don't abort the whole group on one rejection — the
 *     remaining children can still deliver)
 * Called after every child status transition.
 */
export async function rollUpGroupStatus(tx: Tx, orderGroupId: string): Promise<void> {
  const children = await tx.order.findMany({
    where: { orderGroupId },
    select: { status: true },
  });
  if (children.length === 0) return;
  const live = children.filter((c) => c.status !== 'CANCELLED');
  let next: 'PENDING' | 'STORE_ACCEPTED' | 'DRIVER_ASSIGNED' | 'PICKED_UP' | 'DELIVERED' | 'CANCELLED';
  if (live.length === 0) {
    next = 'CANCELLED';
  } else if (live.every((c) => c.status === 'DELIVERED')) {
    next = 'DELIVERED';
  } else if (live.every((c) => ['PICKED_UP', 'DELIVERED'].includes(c.status))) {
    next = 'PICKED_UP';
  } else if (live.every((c) => ['DRIVER_ASSIGNED', 'PICKED_UP', 'DELIVERED'].includes(c.status))) {
    next = 'DRIVER_ASSIGNED';
  } else if (live.every((c) =>
    ['STORE_ACCEPTED', 'COOKING', 'DRIVER_ASSIGNED', 'PICKED_UP', 'DELIVERED'].includes(c.status),
  )) {
    next = 'STORE_ACCEPTED';
  } else {
    next = 'PENDING';
  }
  await tx.orderGroup.update({
    where: { id: orderGroupId },
    data: { status: next },
  });
}
