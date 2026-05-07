// =====================================================================================
// Store Matching Engine — multi-store broadcast, majority-first scoring, first-accept-wins.
//
// HOW IT WORKS
// ────────────
// 1. Order has items (StoreItem ids) → resolve to catalogItemIds
// 2. Find ALL ACTIVE+OPEN stores within radius that carry at least one of those items
// 3. Score each store by:
//    a. Match ratio = (catalog items the store carries with stock) / (total catalog items in order)
//    b. Proximity = inverse distance (closer = better)
//    c. Rating bonus (popular stores get a small boost)
//    d. Final score = matchRatio*0.6 + proximityScore*0.3 + ratingScore*0.1
// 4. Filter out stores below MIN_ITEM_MATCH_PERCENT (default 60%)
// 5. Take TOP_N candidates (default 5) — these are the "broadcast set"
// 6. For mode "BROADCAST" (default): notify ALL of them in parallel; first to accept wins
// 7. For mode "CASCADE":              notify them serially with timeouts (legacy behavior)
//
// FIRST-ACCEPT-WINS
// ─────────────────
// When a store taps Accept (PUT /orders/:id/accept):
// - The order's storeId is set to that store
// - Status moves to STORE_ACCEPTED
// - All other broadcast stores get a "rescinded" notification
// - Driver assignment is then triggered (driver.service.ts)
//
// PARALLEL VS SERIAL
// ──────────────────
// Broadcast mode is faster (parallel) but more notifications. Use it for high-demand items.
// Cascade mode (serial with 3-min timeout per store) is gentler on store owners.
// Toggle via env var STORE_MATCHING_MODE = "BROADCAST" | "CASCADE" (default BROADCAST).
// =====================================================================================

import { prisma } from '../config/prisma';
import { haversineDistance, getBoundingBox } from '../utils/geo';
import { notify } from './notification.service';
import { matchingQueue } from '../queues/queues';
import { io } from '../socket';

const MIN_ITEM_MATCH_PERCENT = 0.6;
const TOP_N_BROADCAST = 5;
const SEARCH_RADIUS_KM = 5;
const STORE_RETRY_DELAY_MS = 3 * 60 * 1000;

const MATCHING_MODE = (process.env.STORE_MATCHING_MODE ?? 'BROADCAST').toUpperCase() as
  | 'BROADCAST'
  | 'CASCADE';

interface ScoredStore {
  storeId: string;
  ownerId: string;
  score: number;
  distanceKm: number;
  matchRatio: number;
  matchedItemCount: number;
  rating: number;
}

/**
 * Score and rank candidate stores. Returns sorted by best-first.
 */
async function rankStores(
  orderId: string,
  excludeStoreIds: string[],
): Promise<{ scored: ScoredStore[]; totalCatalogItems: number; customerId: string; lat: number; lng: number } | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      deliveryAddress: { select: { lat: true, lng: true } },
      customer: { select: { id: true } },
    },
  });
  if (!order || order.status !== 'PENDING') return null;

  const { lat, lng } = order.deliveryAddress;

  // Order items reference StoreItem.id which references catalogItemId.
  // To compare across stores, we need the catalogItemIds for each order item.
  const orderStoreItems = await prisma.storeItem.findMany({
    where: { id: { in: order.items.map((i) => i.itemId).filter((id): id is string => !!id) } },
    select: { catalogItemId: true },
  });
  const orderCatalogItemIds = orderStoreItems.map((si) => si.catalogItemId);
  const totalCatalogItems = new Set(orderCatalogItemIds).size;
  if (totalCatalogItems === 0) return null;

  // Try the nearby radius first
  const box = getBoundingBox(lat, lng, SEARCH_RADIUS_KM);
  let candidateStores = await prisma.store.findMany({
    where: {
      status: 'ACTIVE',
      isOpen: true,
      id: { notIn: excludeStoreIds },
      lat: { gte: box.minLat, lte: box.maxLat },
      lng: { gte: box.minLng, lte: box.maxLng },
      items: {
        some: {
          catalogItemId: { in: orderCatalogItemIds },
          isAvailable: true,
          stockQty: { gt: 0 },
        },
      },
    },
    include: {
      owner: { select: { id: true } },
      items: { where: { catalogItemId: { in: orderCatalogItemIds }, isAvailable: true, stockQty: { gt: 0 } } },
    },
  });

  // Fallback: if no nearby store carries the items, broadcast to ALL active
  // stores carrying any item (regardless of distance). Customer accepts the
  // longer delivery time. This ensures orders aren't auto-cancelled when
  // local supply is thin.
  let isFallback = false;
  if (candidateStores.length === 0) {
    isFallback = true;
    candidateStores = await prisma.store.findMany({
      where: {
        status: 'ACTIVE',
        isOpen: true,
        id: { notIn: excludeStoreIds },
        items: {
          some: {
            catalogItemId: { in: orderCatalogItemIds },
            isAvailable: true,
            stockQty: { gt: 0 },
          },
        },
      },
      include: {
        owner: { select: { id: true } },
        items: { where: { catalogItemId: { in: orderCatalogItemIds }, isAvailable: true, stockQty: { gt: 0 } } },
      },
    });
    if (candidateStores.length > 0) {
      console.log(
        `[Match] No nearby stores in ${SEARCH_RADIUS_KM}km; falling back to ${candidateStores.length} active stores city-wide for order ${orderId}`,
      );
    }
  }

  const scored: ScoredStore[] = [];
  for (const store of candidateStores) {
    const distanceKm = haversineDistance(lat, lng, store.lat, store.lng);
    // In fallback mode we accept any distance; in normal mode skip > radius
    if (!isFallback && distanceKm > SEARCH_RADIUS_KM) continue;

    const matchedItemCount = new Set(store.items.map((si) => si.catalogItemId)).size;
    const matchRatio = matchedItemCount / totalCatalogItems;
    // Fallback mode also relaxes the match threshold so any partial match is offered
    const minMatch = isFallback ? 0.3 : MIN_ITEM_MATCH_PERCENT;
    if (matchRatio < minMatch) continue;

    // Proximity score: bigger when closer. Normalize over a wider scale in fallback
    // so that a 30 km store still has some score above zero.
    const normalizationKm = isFallback ? 50 : SEARCH_RADIUS_KM;
    const proximityScore = Math.max(0, 1 - distanceKm / normalizationKm);
    // Rating score: 0..1 from 0..5 stars
    const ratingScore = (store.rating ?? 0) / 5;
    // Composite: majority of items first, then proximity, then small rating boost
    const score = matchRatio * 0.6 + proximityScore * 0.3 + ratingScore * 0.1;

    scored.push({
      storeId: store.id, ownerId: store.owner.id, score, distanceKm,
      matchRatio, matchedItemCount, rating: store.rating ?? 0,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return { scored, totalCatalogItems, customerId: order.customer.id, lat, lng };
}

/**
 * BROADCAST mode: notify the top N stores in parallel. First store to accept wins.
 */
async function broadcastToStores(orderId: string, scored: ScoredStore[]): Promise<void> {
  const top = scored.slice(0, TOP_N_BROADCAST);
  console.log(
    `[Match] Broadcasting order ${orderId} to ${top.length} stores: ` +
      top.map((s) => `${s.storeId.slice(-6)}(score=${s.score.toFixed(2)})`).join(', '),
  );

  // Persist the candidate set on the order so the accept endpoint can validate
  // (we use rejectionReason as a JSON string field for now; a dedicated column would be cleaner)
  await prisma.order.update({
    where: { id: orderId },
    data: { rejectionReason: `BROADCAST:${top.map((s) => s.storeId).join(',')}` },
  });

  await Promise.all(
    top.map(async (s) => {
      await notify('STORE_ORDER_OFFERED', s.ownerId, {
        orderShort: orderId.slice(-6),
        itemCount: s.matchedItemCount,
        distanceKm: s.distanceKm.toFixed(1),
        orderId,
      });
      // Real-time push so the store portal updates instantly
      io?.to(`user:${s.ownerId}`).emit('order:offered', {
        orderId, score: s.score, distanceKm: s.distanceKm, matchedItemCount: s.matchedItemCount,
      });
    }),
  );

  // Safety net: if no store accepts within 3 minutes, retry with a wider/different set
  await matchingQueue.add(
    'broadcast-timeout',
    { orderId, excludeStoreIds: top.map((s) => s.storeId) },
    { delay: STORE_RETRY_DELAY_MS },
  );
}

/**
 * CASCADE mode: pick the best store, set storeId, wait for accept/reject. On reject/timeout,
 * recursively try the next best store.
 */
async function cascadeToBestStore(orderId: string, scored: ScoredStore[], excludeStoreIds: string[]): Promise<void> {
  const best = scored[0]!;
  await prisma.order.update({ where: { id: orderId }, data: { storeId: best.storeId } });
  // Resolve item count + total for the templated message
  const orderForCount = await prisma.order.findUnique({
    where: { id: orderId },
    select: { totalAmount: true, items: { select: { quantity: true } } },
  });
  const itemCount = orderForCount?.items.reduce((sum, i) => sum + i.quantity, 0) ?? 0;
  await notify('STORE_NEW_ORDER', best.ownerId, {
    orderShort: orderId.slice(-6),
    itemCount,
    total: orderForCount?.totalAmount ?? 0,
    orderId,
  });
  io?.to(`user:${best.ownerId}`).emit('order:offered', { orderId });
  await matchingQueue.add(
    'retry-store-match',
    { orderId, excludeStoreIds: [...excludeStoreIds, best.storeId] },
    { delay: STORE_RETRY_DELAY_MS },
  );
}

/**
 * Main entry point. Called by orders.routes (initial match) and by BullMQ (retry).
 */
export async function matchStoreForOrder(
  orderId: string,
  excludeStoreIds: string[] = [],
): Promise<void> {
  const ranked = await rankStores(orderId, excludeStoreIds);
  if (!ranked) return; // Order already moved past PENDING (accepted, cancelled, etc.)

  const { scored, customerId } = ranked;

  if (scored.length === 0) {
    // No candidate store can fulfill — cancel + notify customer
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'CANCELLED',
        cancelReason: 'No nearby store can fulfill your order at this time',
      },
    });
    await sendNotification(
      customerId,
      'Order cancelled',
      'No nearby store could fulfill your order. Please try again later.',
      { orderId },
    );
    return;
  }

  if (MATCHING_MODE === 'CASCADE') {
    await cascadeToBestStore(orderId, scored, excludeStoreIds);
  } else {
    await broadcastToStores(orderId, scored);
  }
}

/**
 * Called when a store accepts an order in broadcast mode — notifies the other
 * broadcast recipients that the offer was rescinded.
 */
export async function rescindBroadcastOffers(
  orderId: string,
  acceptedByStoreId: string,
): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order?.rejectionReason?.startsWith('BROADCAST:')) return;
  const broadcastIds = order.rejectionReason.replace('BROADCAST:', '').split(',');
  const rescinded = broadcastIds.filter((id) => id && id !== acceptedByStoreId);

  await prisma.order.update({ where: { id: orderId }, data: { rejectionReason: null } });

  if (rescinded.length === 0) return;

  const stores = await prisma.store.findMany({
    where: { id: { in: rescinded } },
    select: { ownerId: true, name: true },
  });
  await Promise.all(
    stores.map((s) =>
      notify('STORE_ORDER_RESCINDED', s.ownerId, {
        orderShort: orderId.slice(-6),
        orderId,
      }).then(() => io?.to(`user:${s.ownerId}`).emit('order:rescinded', { orderId })),
    ),
  );
}
