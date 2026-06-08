import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PaymentMethod } from '@prisma/client';
import { prisma } from '../config/prisma';
import { authenticate, authorize, requireApproved } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { sendSuccess, sendError } from '../utils/response';
import { matchingQueue } from '../queues';
import { assignDriverForOrder } from '../services/driver.service';
import { sendNotification, notifyAdmins, notify } from '../services/notification.service';
import { broadcastOrderStatus } from '../services/order-events.service';
import { getSettings } from '../services/settings.service';
import { findZoneForPoint, findZonesForPoint } from '../services/zone.service';
import { haversineDistance } from '../utils/geo';
import { creditWallet } from '../services/wallet.service';
import { generateInvoiceForOrder, resolveInvoiceAbsolutePath } from '../services/invoice.service';
import {
  decrementStockForOrder,
  incrementStockForOrder,
  InsufficientStockError,
  statusHadStockDecrement,
} from '../services/inventory.service';
import {
  planSplit,
  createOrderGroup,
} from '../services/order-group.service';

const router = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

// Two ordering modes:
//   1. STORE-DIRECT: customer browsed a store, items[] are storeItem ids
//   2. CATALOG: customer chose catalog items, engine picks the best store(s)
const createOrderSchema = z.object({
  // Mode 1: store-direct order
  storeId: z.string().cuid().optional(),
  items: z
    .array(
      z.object({
        // Either storeItemId (mode 1) OR catalogItemId (mode 2). One required.
        storeItemId: z.string().cuid().optional(),
        catalogItemId: z.string().cuid().optional(),
        qty: z.number().int().positive(),
      }),
    )
    .min(1),
  // Either `deliveryAddressId` (existing address owned by the customer)
  // or `recipientAddress` (inline one-off address for "order for someone
  // else") must be provided. We auto-create the Address row when an
  // inline payload arrives so the order's deliveryAddressId FK stays
  // consistent — see the handler below.
  deliveryAddressId: z.string().cuid().optional(),
  recipientAddress: z
    .object({
      label: z.string().trim().min(1).max(50),
      street: z.string().trim().min(1).max(200),
      city: z.string().trim().min(1).max(80),
      state: z.string().trim().min(1).max(80),
      pincode: z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits'),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
  paymentMethod: z.nativeEnum(PaymentMethod),
  notes: z.string().max(500).optional(),
  promoCode: z.string().optional(),
  // 'Order for someone else' — overrides account holder's contact at
  // dropoff. Driver/store should call recipientPhone when present.
  recipientName: z.string().trim().min(1).max(100).optional(),
  recipientPhone: z
    .string()
    .trim()
    .regex(/^\d{10}$/, 'Recipient phone must be 10 digits')
    .optional(),
});

// Restock order: a store owner buys stock from a wholesaler. Items reference the
// wholesaler's StoreItem ids. No matching engine — the buyer picks the wholesaler.
// Restock order: a store owner buys stock. They submit catalog items; the
// matching engine picks the best in-range wholesaler (same engine as customer
// orders, filtered to wholesalers).
const createRestockSchema = z.object({
  items: z
    .array(
      z.object({
        catalogItemId: z.string().cuid(),
        qty: z.number().int().positive(),
      }),
    )
    .min(1),
  paymentMethod: z.nativeEnum(PaymentMethod),
  notes: z.string().max(500).optional(),
});

// Cart-side preview: "given THIS dropoff lat/lng, can we fulfill THIS
// cart, which store would handle it, and what's the ETA + fees?" Used by
// the customer-web cart screen the moment the recipient address is set,
// so we can warn the user about unavailable items / out-of-zone delivery
// BEFORE the checkout button is hit.
const previewOrderSchema = z.object({
  items: z
    .array(
      z.object({
        // Either storeItemId (mode 1) OR catalogItemId (mode 2). Same shape
        // as createOrderSchema so the cart payload can be reused verbatim.
        storeItemId: z.string().cuid().optional(),
        catalogItemId: z.string().cuid().optional(),
        qty: z.number().int().positive(),
      }),
    )
    .min(1),
  // Recipient pickup point — drives zone lookup, store selection and ETA.
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const rejectOrderSchema = z.object({
  reason: z.string().min(1).max(500),
});

const cancelOrderSchema = z.object({
  reason: z.string().min(1).max(500),
});

const rateOrderSchema = z.object({
  storeRating: z.number().int().min(1).max(5),
  driverRating: z.number().int().min(1).max(5).optional(),
  storeComment: z.string().max(500).optional(),
  driverComment: z.string().max(500).optional(),
});

// ─── POST / ───────────────────────────────────────────────────────────────────

router.post(
  '/',
  authenticate,
  authorize('CUSTOMER'),
  validate(createOrderSchema),
  async (req: Request, res: Response) => {
    try {
      const {
        items,
        deliveryAddressId,
        recipientAddress: recipientAddressPayload,
        paymentMethod,
        notes,
        recipientName,
        recipientPhone,
      } = req.body as z.infer<typeof createOrderSchema>;

      // Exactly one of (deliveryAddressId, recipientAddress) must be set.
      // - deliveryAddressId → existing self/saved address path.
      // - recipientAddress  → "order for someone else" inline path:
      //   we auto-create an Address row owned by the buying customer
      //   (so the Order.deliveryAddressId FK is consistent) labelled
      //   "For <recipientName>" if available. Address is NOT marked
      //   default — the customer's own default stays untouched.
      if (deliveryAddressId && recipientAddressPayload) {
        return sendError(
          res,
          'Provide either deliveryAddressId OR recipientAddress, not both',
          400,
        );
      }
      let address: { id: string; lat: number; lng: number } | null = null;
      if (deliveryAddressId) {
        address = await prisma.address.findFirst({
          where: { id: deliveryAddressId, userId: req.user!.id },
          select: { id: true, lat: true, lng: true },
        });
        if (!address) return sendError(res, 'Delivery address not found', 404);
      } else if (recipientAddressPayload) {
        const recipientLabel = recipientName
          ? `For ${recipientName.slice(0, 40)}`
          : recipientAddressPayload.label;
        const created = await prisma.address.create({
          data: {
            userId: req.user!.id,
            label: recipientLabel,
            street: recipientAddressPayload.street,
            city: recipientAddressPayload.city,
            state: recipientAddressPayload.state,
            pincode: recipientAddressPayload.pincode,
            lat: recipientAddressPayload.lat,
            lng: recipientAddressPayload.lng,
            isDefault: false,
          },
          select: { id: true, lat: true, lng: true },
        });
        address = created;
      } else {
        return sendError(
          res,
          'Provide deliveryAddressId or recipientAddress',
          400,
        );
      }

      // Resolve items to StoreItem records.
      // Mode 1 (store-direct): items have storeItemId — fetch them directly
      // Mode 2 (catalog): items have catalogItemId only — pick a store via catalog match
      const reqStoreItemIds = items
        .map((i) => i.storeItemId)
        .filter((x): x is string => !!x);
      const reqCatalogItemIds = items
        .map((i) => i.catalogItemId)
        .filter((x): x is string => !!x);

      let resolvedItems: Array<{
        storeItem: {
          id: string; storeId: string; price: number; adminMargin: number;
          stockQty: number; isAvailable: boolean;
          // catalogItemId is the FK; we read it directly during the cross-zone
          // re-match (see below) so we can swap to a different store's
          // StoreItem rows for the same catalog item.
          catalogItemId: string;
          catalogItem: { name: string; defaultUnit: string; imageUrl: string | null };
        };
        qty: number;
      }> = [];

      if (reqStoreItemIds.length > 0) {
        // Mode 1: load store-items directly. Constrain the join so only items
        // belonging to an ACTIVE, non-wholesaler store qualify — otherwise a
        // client that guesses (or scrapes) a wholesaler / suspended store's
        // StoreItem id can bypass the matching engine's wholesaler filter and
        // place a customer order against a B2B-only or suspended store.
        const storeItems = await prisma.storeItem.findMany({
          where: {
            id: { in: reqStoreItemIds },
            isAvailable: true,
            store: { status: 'ACTIVE', isWholesaler: false },
          },
          include: { catalogItem: true },
        });
        if (storeItems.length !== reqStoreItemIds.length) {
          return sendError(res, 'One or more items are unavailable or not found', 400);
        }
        resolvedItems = items
          .filter((i) => i.storeItemId)
          .map((i) => ({ storeItem: storeItems.find((si) => si.id === i.storeItemId)!, qty: i.qty }));
      } else if (reqCatalogItemIds.length > 0) {
        // Mode 2: catalog-only. Need a storeId hint OR the matching engine will pick.
        // For simplest flow: if storeId provided, look up StoreItems by (storeId, catalogItemId).
        // Otherwise: pick the closest store carrying ALL items (fallback to first store with any).
        let candidateStoreId = req.body.storeId as string | undefined;

        if (candidateStoreId) {
          // If the caller passed a storeId hint, it MUST refer to an ACTIVE,
          // non-wholesaler store. Without this check a client could route a
          // customer order to a wholesaler (B2B-only) or a suspended store.
          const hinted = await prisma.store.findUnique({
            where: { id: candidateStoreId },
            select: { status: true, isWholesaler: true },
          });
          if (!hinted || hinted.status !== 'ACTIVE' || hinted.isWholesaler) {
            return sendError(res, 'Selected store is not available for orders', 400);
          }
        } else {
          // Find a store that carries all the requested catalog items
          const carryingAll = await prisma.store.findMany({
            where: {
              status: 'ACTIVE',
              isOpen: true,
              isWholesaler: false,
              items: { some: { catalogItemId: { in: reqCatalogItemIds }, isAvailable: true, stockQty: { gt: 0 } } },
            },
            include: {
              items: {
                where: { catalogItemId: { in: reqCatalogItemIds }, isAvailable: true, stockQty: { gt: 0 } },
              },
            },
          });
          // Pick store with the most matching items (majority-first); ties broken by first
          carryingAll.sort((a, b) => b.items.length - a.items.length);
          if (carryingAll.length === 0 || carryingAll[0]!.items.length === 0) {
            return sendError(res, 'No nearby store has these items in stock', 404);
          }
          candidateStoreId = carryingAll[0]!.id;
        }

        const storeItems = await prisma.storeItem.findMany({
          where: {
            storeId: candidateStoreId,
            catalogItemId: { in: reqCatalogItemIds },
            isAvailable: true,
            // Defence-in-depth: even with a validated storeId hint above, keep
            // the wholesaler/status filter on the StoreItem join so the
            // invariant is enforced in one place.
            store: { status: 'ACTIVE', isWholesaler: false },
          },
          include: { catalogItem: true },
        });
        if (storeItems.length !== reqCatalogItemIds.length) {
          return sendError(res, 'Selected store no longer has all requested items', 400);
        }
        resolvedItems = items
          .filter((i) => i.catalogItemId)
          .map((i) => ({
            storeItem: storeItems.find((si) => si.catalogItemId === i.catalogItemId)!,
            qty: i.qty,
          }));
      } else {
        return sendError(res, 'Each item needs storeItemId or catalogItemId', 400);
      }

      // ── Cross-zone gate (added 2026-06-03) ─────────────────────────────
      // Up to this point `resolvedItems[0].storeItem.storeId` is whichever
      // store the customer browsed (mode 1) or the catalog auto-picked
      // (mode 2). For "order for someone else" the dropoff can sit in a
      // different zone than that store — e.g. customer in Sikar checking
      // out for a recipient in Kandela. In that case we MUST re-match the
      // cart to a store in the dropoff's zone, because the original store
      // simply doesn't deliver there.
      //
      // Algorithm:
      //   1. Look up the dropoff address's zone(s).
      //   2. If the chosen store's location is already inside one of those
      //      zones, do nothing — happy path.
      //   3. Otherwise, find ACTIVE stores in the dropoff zone that carry
      //      ALL the cart's catalog items in stock. Pick the closest one to
      //      the recipient and swap `resolvedItems` over to its StoreItem
      //      rows. Pricing (price + adminMargin) re-snapshots from those
      //      new rows further down, which is correct — the recipient zone's
      //      store sets its own retail price.
      //   4. If no such store exists, 422 with a clear message so the UI
      //      can prompt the customer to pick a different recipient address
      //      or trim items.
      //
      // Zone-zero guard (audit gap #10): when the dropoff sits outside
      // every active zone and the platform has any zones configured,
      // we refuse the order with 422 instead of silently falling
      // through. The previous "legacy fallback" path let out-of-zone
      // dropoffs match arbitrary stores. Only skip the guard entirely
      // when there are ZERO zones in the DB (pre-zone-setup dev).
      const dropoffZones = await findZonesForPoint(address.lat, address.lng);
      const anyZonesConfigured =
        (await prisma.zone.count({ where: { isActive: true } })) > 0;
      if (anyZonesConfigured && dropoffZones.length === 0) {
        return sendError(
          res,
          "We don't deliver to this address yet. Please pick a different delivery location.",
          422,
        );
      }

      // Multi-anchor check (audit gap #6): cart may already span
      // multiple stores from earlier resolution. The OLD code only
      // looked at resolvedItems[0] — if ANY anchor store is out of
      // the dropoff zone, we need to trigger the re-match.
      const uniqueAnchorStoreIds = [
        ...new Set(resolvedItems.map((r) => r.storeItem.storeId)),
      ];
      const anchorStores = await prisma.store.findMany({
        where: { id: { in: uniqueAnchorStoreIds } },
        select: { id: true, lat: true, lng: true, name: true, zoneId: true },
      });
      const dropoffZoneIds = new Set(dropoffZones.map((z) => z.zoneId));
      const allAnchorsInDropoffZone =
        dropoffZones.length === 0
          ? true
          : anchorStores.every((s) => {
              // Prefer explicit zoneId match (indexed); fall back to
              // haversine for stores without an assigned zone.
              if (s.zoneId) return dropoffZoneIds.has(s.zoneId);
              return dropoffZones.some(
                (z) =>
                  haversineDistance(s.lat, s.lng, z.centerLat, z.centerLng) <=
                  z.radiusKm,
              );
            });

      if (!allAnchorsInDropoffZone) {
        const cartCatalogIds = resolvedItems
          .map((r) => r.storeItem.catalogItemId)
          .filter((x): x is string => !!x);
        // Bounding box around the union of dropoff zones — a cheap prefilter
        // so we don't `findMany` over every store in the country before the
        // haversine pass below.
        const allLats = dropoffZones.flatMap((z) => [
          z.centerLat - z.radiusKm / 110,
          z.centerLat + z.radiusKm / 110,
        ]);
        const allLngs = dropoffZones.flatMap((z) => [
          z.centerLng - z.radiusKm / 110,
          z.centerLng + z.radiusKm / 110,
        ]);
        const candidates = await prisma.store.findMany({
          where: {
            status: 'ACTIVE',
            isOpen: true,
            isWholesaler: false,
            lat: { gte: Math.min(...allLats), lte: Math.max(...allLats) },
            lng: { gte: Math.min(...allLngs), lte: Math.max(...allLngs) },
            items: {
              some: {
                catalogItemId: { in: cartCatalogIds },
                isAvailable: true,
                stockQty: { gt: 0 },
              },
            },
          },
          include: {
            items: {
              where: {
                catalogItemId: { in: cartCatalogIds },
                isAvailable: true,
                stockQty: { gt: 0 },
              },
              include: { catalogItem: true },
            },
          },
        });
        const inZone = candidates.filter((s) =>
          dropoffZones.some(
            (z) => haversineDistance(s.lat, s.lng, z.centerLat, z.centerLng) <= z.radiusKm,
          ),
        );
        // First try single-store coverage — simpler downstream flow.
        const fullMatches = inZone.filter((s) => {
          const carriedIds = new Set(s.items.map((i) => i.catalogItemId));
          return cartCatalogIds.every((cid) => carriedIds.has(cid));
        });
        if (fullMatches.length === 0) {
          // No single in-zone store covers the cart — try multi-store
          // splitting. The catalog-first cart model says the customer
          // shouldn't care which stores fulfil; the engine groups the
          // legs and assigns one driver to do sequential pickups.
          const split = planSplit(
            cartCatalogIds,
            inZone.map((s) => ({
              id: s.id,
              lat: s.lat,
              lng: s.lng,
              // Pass rating + preferred so planSplit's tiebreak prefers
              // higher-rated and admin-promoted stores when coverage
              // is equal. Casted because the bbox select doesn't
              // declare these but the runtime row carries them as
              // default scalars.
              rating: (s as { rating?: number }).rating ?? 0,
              isPreferred: (s as { isPreferred?: boolean }).isPreferred ?? false,
              items: s.items.map((it) => ({
                id: it.id,
                catalogItemId: it.catalogItemId,
                price: it.price,
                adminMargin: it.adminMargin ?? 0,
                stockQty: it.stockQty,
              })),
            })),
            { lat: address.lat, lng: address.lng },
          );
          if (!split || split.length === 0) {
            return sendError(
              res,
              "No combination of stores in the recipient's delivery zone " +
                'covers these items right now. Try a different recipient ' +
                'address or remove items.',
              422,
            );
          }
          // Single-leg split → keep the single-store fast path (no group).
          if (split.length === 1) {
            const onlyStore = inZone.find((s) => s.id === split[0]!.storeId)!;
            const fakeFullMatches = [onlyStore];
            // Fall through to the swap path below by mutating fullMatches.
            // (We don't actually mutate fullMatches; we just reuse the swap
            // block via an explicit assignment.)
            fullMatches.push(...fakeFullMatches);
          } else {
            // Multi-leg split — build OrderGroup + N child Orders, then
            // return early. The single-store path further down is
            // bypassed entirely.
            const settings = await getSettings();
            // The driver does ONE delivery (after all pickups), so the
            // group's deliveryFee is computed once against the FULL
            // route, not against the naive "first pickup → dropoff"
            // segment. We TSP-optimise pickup order via the existing
            // route-optimizer service and bill per-km on the full
            // path: pickup0 → pickup1 → ... → pickupN → dropoff.
            //
            // Why: the naive first-pickup approximation undercharged
            // multi-store deliveries (the driver actually drives the
            // sum of all segments). Using the optimised route makes
            // the fee track the real driving cost.
            const firstStore = inZone.find((s) => s.id === split[0]!.storeId)!;
            const zone = await findZoneForPoint(firstStore.lat, firstStore.lng);
            const effectiveBaseFee = zone?.baseDeliveryFee ?? settings.baseDeliveryFee;
            const effectivePerKmFee = zone?.perKmFee ?? settings.perKmFee;
            const { optimizePickupOrder } = await import(
              '../services/route-optimizer.service'
            );
            const pickupPoints = split.map((leg) => {
              const s = inZone.find((x) => x.id === leg.storeId)!;
              return { id: leg.storeId, lat: s.lat, lng: s.lng };
            });
            const { totalKm: routeKm } = optimizePickupOrder({
              // We don't have the driver's pre-assignment location at
              // create time, so anchor on the first pickup. Once a
              // driver is assigned the driver's actual location feeds
              // the multi-pickup screen's optimiser independently.
              driverLat: firstStore.lat,
              driverLng: firstStore.lng,
              pickups: pickupPoints.filter((p) => p.id !== firstStore.id),
              dropoffLat: address.lat,
              dropoffLng: address.lng,
            });
            let groupDeliveryFee = parseFloat(
              (effectiveBaseFee + effectivePerKmFee * routeKm).toFixed(2),
            );

            // Resolve each leg's lines + per-leg subtotal/commission.
            const legs = split.map((leg) => {
              const store = inZone.find((s) => s.id === leg.storeId)!;
              const legItems = leg.catalogItemIds.map((cid) => {
                const fresh = store.items.find((i) => i.catalogItemId === cid)!;
                const cartLine = items.find((i) => i.catalogItemId === cid);
                const qty = cartLine?.qty ?? 1;
                const customerUnit = fresh.price + (fresh.adminMargin ?? 0);
                return {
                  fresh,
                  qty,
                  customerUnit,
                  lineSubtotal: customerUnit * qty,
                  lineCommission: (fresh.adminMargin ?? 0) * qty,
                };
              });
              const legSubtotal = parseFloat(
                legItems.reduce((s, l) => s + l.lineSubtotal, 0).toFixed(2),
              );
              const legCommissionMargins = legItems.reduce(
                (s, l) => s + l.lineCommission,
                0,
              );
              const effectiveCommissionFraction =
                zone?.commissionRate ?? settings.commissionPercent / 100;
              const legCommission = parseFloat(
                (legCommissionMargins > 0
                  ? legCommissionMargins
                  : legSubtotal * effectiveCommissionFraction
                ).toFixed(2),
              );
              return { store, items: legItems, legSubtotal, legCommission };
            });
            const totalSubtotal = parseFloat(
              legs.reduce((s, l) => s + l.legSubtotal, 0).toFixed(2),
            );

            // Free-delivery threshold — zone-level, same rules as single
            // orders, evaluated against the GROUP subtotal so adding a
            // cross-store item helps the customer cross the line.
            if (
              zone?.freeDeliveryThreshold &&
              zone.freeDeliveryThreshold > 0 &&
              totalSubtotal >= zone.freeDeliveryThreshold
            ) {
              groupDeliveryFee = 0;
            }
            const groupTotal = parseFloat(
              (totalSubtotal + groupDeliveryFee).toFixed(2),
            );

            // Stock validation BEFORE we open the transaction so a
            // partial-stock failure doesn't leave orphan group rows.
            for (const leg of legs) {
              for (const l of leg.items) {
                if (l.fresh.stockQty < l.qty) {
                  return sendError(
                    res,
                    `Insufficient stock at ${leg.store.name} for one or more items.`,
                    400,
                  );
                }
              }
            }

            // Pre-fetch catalog display fields (name/defaultUnit/imageUrl)
            // for every catalog id in the split BEFORE we open the
            // transaction. Otherwise we'd create OrderItem rows with
            // name='' / unit='' and patch them after the create — which
            // raced with the store-side matching jobs that queue
            // immediately after the transaction commits (B-6 in the
            // 2026-06-04 audit). Doing it up-front means the store's
            // "new order" notification renders with real item names.
            const allCatalogIds = legs.flatMap((leg) =>
              leg.items.map((l) => l.fresh.catalogItemId),
            );
            const catalogRows = await prisma.catalogItem.findMany({
              where: { id: { in: allCatalogIds } },
              select: { id: true, name: true, defaultUnit: true, imageUrl: true },
            });
            const catalogById = new Map(catalogRows.map((c) => [c.id, c]));

            // ONE OTP for the whole group: the driver does a single
            // physical handoff at the customer's door, so the customer
            // shouldn't have to juggle N codes (one per store). Every
            // child Order carries the same dropoffOtp; the deliver-all
            // endpoint validates once and atomically delivers every
            // leg. (B-5 in the 2026-06-04 audit.)
            const groupDropoffOtp = Math.floor(1000 + Math.random() * 9000).toString();

            const createdOrders = await prisma.$transaction(async (tx) => {
              const group = await createOrderGroup(tx, {
                customerId: req.user!.id,
                deliveryAddressId: address.id,
                subtotal: totalSubtotal,
                deliveryFee: groupDeliveryFee,
                total: groupTotal,
                paymentMethod,
                recipientName: recipientName ?? null,
                recipientPhone: recipientPhone ?? null,
              });
              const out: Array<{ id: string; storeId: string }> = [];
              for (const leg of legs) {
                const dropoffOtp = groupDropoffOtp;
                const child = await tx.order.create({
                  data: {
                    customerId: req.user!.id,
                    storeId: leg.store.id,
                    orderGroupId: group.id,
                    status: 'PENDING',
                    subtotal: leg.legSubtotal,
                    // Single delivery fee on the GROUP — children carry 0.
                    deliveryFee: 0,
                    commission: leg.legCommission,
                    // Per-leg total = subtotal (no per-leg delivery).
                    total: leg.legSubtotal,
                    paymentMethod,
                    paymentStatus: 'PENDING',
                    deliveryAddressId: address.id,
                    recipientName: recipientName ?? null,
                    recipientPhone: recipientPhone ?? null,
                    dropoffOtp,
                    items: {
                      create: leg.items.map((l) => {
                        const cat = catalogById.get(l.fresh.catalogItemId);
                        return {
                          itemId: l.fresh.id,
                          name: cat?.name ?? '',
                          price: l.customerUnit,
                          unit: cat?.defaultUnit ?? '',
                          qty: l.qty,
                          imageUrl: cat?.imageUrl ?? null,
                        };
                      }),
                    },
                  },
                  select: { id: true, storeId: true },
                });
                out.push({ id: child.id, storeId: leg.store.id });
              }
              return { group, orders: out };
            });

            // Queue matching for each child independently so each store
            // accepts/rejects on its own deadline.
            for (const o of createdOrders.orders) {
              await matchingQueue.add('match-store', {
                orderId: o.id,
                excludeStoreIds: [],
              });
            }

            // Notify the customer once for the whole group.
            notify('ORDER_PLACED', req.user!.id, {
              orderShort: createdOrders.group.id.slice(-6),
              orderId: createdOrders.orders[0]!.id,
            }).catch((e) => console.error('[Orders] split notify error:', e));

            return sendSuccess(
              res,
              {
                orderGroup: {
                  id: createdOrders.group.id,
                  subtotal: totalSubtotal,
                  deliveryFee: groupDeliveryFee,
                  total: groupTotal,
                  paymentMethod,
                  orders: createdOrders.orders,
                },
                // First child returned at root so back-compat clients can
                // still read .data.id and navigate to the first leg.
                id: createdOrders.orders[0]!.id,
                orderGroupId: createdOrders.group.id,
                status: 'PENDING',
              },
              'Order placed across multiple stores',
              201,
            );
          }
        }
        fullMatches.sort(
          (a, b) =>
            haversineDistance(a.lat, a.lng, address.lat, address.lng) -
            haversineDistance(b.lat, b.lng, address.lat, address.lng),
        );
        const newStore = fullMatches[0]!;
        const byCatalog = new Map(newStore.items.map((it) => [it.catalogItemId, it]));
        // Re-validate stock against the NEW StoreItem rows (the previous
        // stock check is moot since we just swapped stores).
        const swapped: typeof resolvedItems = [];
        for (const r of resolvedItems) {
          const fresh = byCatalog.get(r.storeItem.catalogItemId);
          if (!fresh || fresh.stockQty < r.qty) {
            return sendError(
              res,
              `Insufficient stock at the in-zone store for ${r.storeItem.catalogItem.name}.`,
              400,
            );
          }
          swapped.push({
            storeItem: {
              id: fresh.id,
              storeId: fresh.storeId,
              price: fresh.price,
              adminMargin: fresh.adminMargin ?? 0,
              stockQty: fresh.stockQty,
              isAvailable: fresh.isAvailable,
              catalogItemId: fresh.catalogItemId,
              catalogItem: {
                name: fresh.catalogItem.name,
                defaultUnit: fresh.catalogItem.defaultUnit,
                imageUrl: fresh.catalogItem.imageUrl,
              },
            },
            qty: r.qty,
          });
        }
        resolvedItems = swapped;
      }

      // Verify sufficient stock + all items belong to the same store
      const storeIds = new Set(resolvedItems.map((r) => r.storeItem.storeId));
      if (storeIds.size > 1) {
        return sendError(res, 'Multi-store orders not yet supported (split into separate orders)', 400);
      }
      for (const r of resolvedItems) {
        if (r.storeItem.stockQty < r.qty) {
          return sendError(res, `Insufficient stock for ${r.storeItem.catalogItem.name}`, 400);
        }
      }

      const initialStoreId = resolvedItems[0]!.storeItem.storeId;

      // Calculate totals (price snapshot at order time) using the two-tier
      // pricing model:
      //   line.customerPrice = storeItem.price + storeItem.adminMargin
      //   line.commission    = storeItem.adminMargin × qty
      // The store keeps `price × qty`, admin retains the sum of margins.
      // Falls back to the zone-scoped (or global) commissionPercent when
      // ALL items have adminMargin = 0 (legacy items not yet negotiated)
      // so old pricing keeps working until admin sets per-item margins.
      const settings = await getSettings();
      const perLine = resolvedItems.map((r) => {
        const customerUnit = r.storeItem.price + (r.storeItem.adminMargin ?? 0);
        const lineSubtotal = customerUnit * r.qty;
        const lineCommission = (r.storeItem.adminMargin ?? 0) * r.qty;
        return { ...r, customerUnit, lineSubtotal, lineCommission };
      });
      const subtotal = parseFloat(
        perLine.reduce((s, p) => s + p.lineSubtotal, 0).toFixed(2),
      );

      // Per-zone fees: look up the zone containing the store. If found we
      // use its baseDeliveryFee + perKmFee + commissionRate; otherwise
      // fall back to the global PlatformSetting (legacy behaviour).
      const initialStore = await prisma.store.findUnique({
        where: { id: initialStoreId },
        select: { lat: true, lng: true },
      });
      const zone = initialStore
        ? await findZoneForPoint(initialStore.lat, initialStore.lng)
        : null;
      const effectiveBaseFee = zone?.baseDeliveryFee ?? settings.baseDeliveryFee;
      const effectivePerKmFee = zone?.perKmFee ?? settings.perKmFee;
      // commissionRate stored as a fraction (0.10) on the zone, percent (10)
      // on PlatformSetting — normalise to a fraction here.
      const effectiveCommissionFraction =
        zone?.commissionRate ?? settings.commissionPercent / 100;

      const marginsSum = perLine.reduce((s, p) => s + p.lineCommission, 0);
      const commission = parseFloat(
        (marginsSum > 0
          ? marginsSum
          : subtotal * effectiveCommissionFraction
        ).toFixed(2),
      );

      let distanceKm = 0;
      if (initialStore && address.lat != null && address.lng != null) {
        distanceKm = haversineDistance(
          initialStore.lat,
          initialStore.lng,
          address.lat,
          address.lng,
        );
      }
      let deliveryFee = parseFloat(
        (effectiveBaseFee + effectivePerKmFee * distanceKm).toFixed(2),
      );
      // Free-delivery threshold (per zone). When admin has set
      // freeDeliveryThreshold > 0 on the zone AND the customer's subtotal
      // crosses it, delivery is on the house. Surfaced on the checkout UI
      // as "Add ₹X for free delivery" / "🎉 Free delivery applied".
      if (
        zone?.freeDeliveryThreshold &&
        zone.freeDeliveryThreshold > 0 &&
        subtotal >= zone.freeDeliveryThreshold
      ) {
        deliveryFee = 0;
      }

      // Promo code application (validated server-side; ignore invalid silently for now)
      let promoDiscount = 0;
      let promoCodeApplied: string | null = null;
      const promoCode = (req.body.promoCode as string | undefined)?.trim().toUpperCase();
      if (promoCode) {
        const promo = await prisma.promo.findUnique({ where: { code: promoCode } });
        if (promo && promo.isActive) {
          const now = new Date();
          const validNow = promo.validFrom <= now && (!promo.validUntil || promo.validUntil >= now);
          const minOk = promo.minOrderValue <= subtotal;
          const usageOk = !promo.usageLimit || promo.usedCount < promo.usageLimit;
          let perUserOk = true;
          if (promo.perUserLimit) {
            const used = await prisma.promoRedemption.count({
              where: { promoId: promo.id, userId: req.user!.id },
            });
            perUserOk = used < promo.perUserLimit;
          }
          if (validNow && minOk && usageOk && perUserOk) {
            promoDiscount =
              promo.discountType === 'FLAT'
                ? Math.min(promo.discountValue, subtotal)
                : Math.min(
                    (subtotal * promo.discountValue) / 100,
                    promo.maxDiscount ?? Number.POSITIVE_INFINITY,
                  );
            promoDiscount = Math.round(promoDiscount * 100) / 100;
            promoCodeApplied = promo.code;
          }
        }
      }

      const total = parseFloat((subtotal + deliveryFee - promoDiscount).toFixed(2));

      const dropoffOtp = Math.floor(1000 + Math.random() * 9000).toString();

      const order = await prisma.$transaction(async (tx) => {
        const created = await tx.order.create({
          data: {
            customerId: req.user!.id,
            storeId: initialStoreId,
            status: 'PENDING',
            subtotal,
            deliveryFee,
            commission,
            total,
            paymentMethod,
            paymentStatus: 'PENDING',
            // Either the customer's saved address id, or the freshly-created
            // recipient address id from the "for someone else" inline path.
            deliveryAddressId: address.id,
            notes,
            recipientName: recipientName ?? null,
            recipientPhone: recipientPhone ?? null,
            dropoffOtp,
            promoCode: promoCodeApplied,
            promoDiscount: promoDiscount > 0 ? promoDiscount : null,
            items: {
              create: perLine.map((p) => ({
                itemId: p.storeItem.id,
                name: p.storeItem.catalogItem.name,
                // OrderItem.price stores the CUSTOMER-FACING unit price (the
                // amount the customer paid per unit, = storeItem.price +
                // adminMargin). Bills, invoices, and refunds all multiply
                // this × qty, so they need the post-margin number.
                price: p.customerUnit,
                unit: p.storeItem.catalogItem.defaultUnit,
                qty: p.qty,
                imageUrl: p.storeItem.catalogItem.imageUrl,
              })),
            },
          },
          include: { items: true },
        });

        if (promoCodeApplied && promoDiscount > 0) {
          const promo = await tx.promo.findUnique({ where: { code: promoCodeApplied } });
          if (promo) {
            await tx.promoRedemption.create({
              data: { promoId: promo.id, userId: req.user!.id, orderId: created.id, discount: promoDiscount },
            });
            await tx.promo.update({ where: { id: promo.id }, data: { usedCount: { increment: 1 } } });
          }
        }
        return created;
      });

      await matchingQueue.add('match-store', { orderId: order.id, excludeStoreIds: [] });

      // Best-effort: notify customer + all admins. Don't block the response.
      Promise.all([
        notify('ORDER_PLACED', order.customerId, {
          orderShort: order.id.slice(-6),
          orderId: order.id,
        }),
        (async () => {
          const [customer, address] = await Promise.all([
            prisma.user.findUnique({
              where: { id: req.user!.id },
              select: { name: true },
            }),
            prisma.address.findUnique({
              where: { id: order.deliveryAddressId },
              select: { city: true },
            }),
          ]);
          const itemCount = order.items.reduce((sum, i) => sum + i.qty, 0);
          await notifyAdmins('ADMIN_ORDER_PLACED', {
            orderId: order.id,
            customerName: customer?.name ?? 'A customer',
            itemCount,
            total: order.total,
            city: address?.city ?? 'unknown area',
          });
        })(),
      ]).catch((err) => console.warn('[Orders] post-create notify failed:', err));

      return sendSuccess(res, order, 'Order placed successfully', 201);
    } catch (err) {
      console.error('[Orders] create error:', err);
      return sendError(res, 'Failed to place order', 500);
    }
  },
);

// ─── POST /preview ────────────────────────────────────────────────────────────
// Cart-side "can this be delivered?" check. The customer-web cart hits this
// the moment the recipient address is set (especially for the "order for
// someone else" flow where the recipient lives in a different zone than
// the items the customer browsed). The handler runs the same store-pick
// logic as POST /orders but stops short of mutating anything — purely
// read-only. Returns:
//   { availableAtStoreId, storeName, distanceKm, etaMinutes,
//     deliveryFee, freeDeliveryUnlocked, missing: [catalogItemId] }
// The UI uses `missing` to grey out items + invites the customer to remove
// them; `freeDeliveryUnlocked` drives the "🎉 free delivery!" banner.
// 422 when the recipient is outside every active zone (we don't serve
// there). 200 with `missing.length > 0` when SOME items aren't carried.

router.post(
  '/preview',
  authenticate,
  authorize('CUSTOMER'),
  validate(previewOrderSchema),
  async (req: Request, res: Response) => {
    try {
      const { items, lat, lng } = req.body as z.infer<typeof previewOrderSchema>;

      // Resolve cart's catalog item ids (irrespective of mode 1 or 2).
      const storeItemIds = items
        .map((i) => i.storeItemId)
        .filter((x): x is string => !!x);
      const catalogItemIdsFromStoreItems =
        storeItemIds.length > 0
          ? (await prisma.storeItem.findMany({
              where: { id: { in: storeItemIds } },
              select: { catalogItemId: true },
            })).map((r) => r.catalogItemId)
          : [];
      const catalogItemIdsDirect = items
        .map((i) => i.catalogItemId)
        .filter((x): x is string => !!x);
      const cartCatalogIds = [
        ...new Set([...catalogItemIdsFromStoreItems, ...catalogItemIdsDirect]),
      ];
      if (cartCatalogIds.length === 0) {
        return sendError(res, 'Cart is empty', 400);
      }

      const dropoffZones = await findZonesForPoint(lat, lng);
      if (dropoffZones.length === 0) {
        return sendError(
          res,
          "We don't deliver to this area yet. Try a different recipient address.",
          422,
        );
      }

      // Find in-zone stores carrying any of the items. We then pick the
      // closest store that carries ALL of them; if no such store exists
      // we surface `missing` so the cart UI can guide the customer.
      const allLats = dropoffZones.flatMap((z) => [
        z.centerLat - z.radiusKm / 110,
        z.centerLat + z.radiusKm / 110,
      ]);
      const allLngs = dropoffZones.flatMap((z) => [
        z.centerLng - z.radiusKm / 110,
        z.centerLng + z.radiusKm / 110,
      ]);
      const candidates = await prisma.store.findMany({
        where: {
          status: 'ACTIVE',
          isOpen: true,
          isWholesaler: false,
          lat: { gte: Math.min(...allLats), lte: Math.max(...allLats) },
          lng: { gte: Math.min(...allLngs), lte: Math.max(...allLngs) },
          items: {
            some: {
              catalogItemId: { in: cartCatalogIds },
              isAvailable: true,
              stockQty: { gt: 0 },
            },
          },
        },
        include: {
          items: {
            where: {
              catalogItemId: { in: cartCatalogIds },
              isAvailable: true,
              stockQty: { gt: 0 },
            },
            select: { catalogItemId: true, price: true, adminMargin: true },
          },
        },
      });
      const inZone = candidates.filter((s) =>
        dropoffZones.some(
          (z) => haversineDistance(s.lat, s.lng, z.centerLat, z.centerLng) <= z.radiusKm,
        ),
      );
      // Rank: stores carrying ALL items first (full match), then partial.
      const ranked = inZone
        .map((s) => {
          const carried = new Set(s.items.map((i) => i.catalogItemId));
          const missing = cartCatalogIds.filter((cid) => !carried.has(cid));
          return {
            store: s,
            missing,
            distanceKm: haversineDistance(s.lat, s.lng, lat, lng),
          };
        })
        .sort((a, b) => {
          // Fewer missing items wins; ties broken by distance.
          if (a.missing.length !== b.missing.length) {
            return a.missing.length - b.missing.length;
          }
          return a.distanceKm - b.distanceKm;
        });

      if (ranked.length === 0) {
        return sendSuccess(res, {
          availableAtStoreId: null,
          storeName: null,
          distanceKm: null,
          etaMinutes: null,
          deliveryFee: null,
          freeDeliveryUnlocked: false,
          missing: cartCatalogIds,
        });
      }

      const best = ranked[0]!;
      const settings = await getSettings();
      const zone = await findZoneForPoint(best.store.lat, best.store.lng);
      const effectiveBaseFee = zone?.baseDeliveryFee ?? settings.baseDeliveryFee;
      const effectivePerKmFee = zone?.perKmFee ?? settings.perKmFee;
      let deliveryFee = parseFloat(
        (effectiveBaseFee + effectivePerKmFee * best.distanceKm).toFixed(2),
      );
      // Subtotal at customer-facing prices so the free-delivery threshold
      // compares against what the customer actually pays.
      const subtotal = best.store.items
        .filter((it) => items.some((c) =>
          c.catalogItemId === it.catalogItemId ||
          // mode-1 lookup: match via the storeItemIds we resolved earlier
          storeItemIds.length > 0,
        ))
        .reduce((sum, it) => {
          const qty =
            items.find((c) => c.catalogItemId === it.catalogItemId)?.qty ?? 0;
          return sum + (it.price + (it.adminMargin ?? 0)) * qty;
        }, 0);
      const freeDeliveryUnlocked = !!(
        zone?.freeDeliveryThreshold &&
        zone.freeDeliveryThreshold > 0 &&
        subtotal >= zone.freeDeliveryThreshold
      );
      if (freeDeliveryUnlocked) deliveryFee = 0;

      // ETA estimate — pre-assignment (no driver yet), so use default
      // SCOOTER speed with slack. The customer-web cart shows this as a
      // window via formatEtaWindow().
      const { estimateOrderEta } = await import('@aks/shared');
      const eta = estimateOrderEta({
        deliveryKm: best.distanceKm,
      });

      return sendSuccess(res, {
        availableAtStoreId: best.store.id,
        storeName: best.store.name,
        distanceKm: Number(best.distanceKm.toFixed(2)),
        etaMinutes: eta.totalMinutes,
        deliveryFee,
        freeDeliveryUnlocked,
        freeDeliveryThreshold: zone?.freeDeliveryThreshold ?? 0,
        missing: best.missing,
      });
    } catch (err) {
      console.error('[Orders] preview error:', err);
      return sendError(res, 'Failed to preview order', 500);
    }
  },
);

// ─── POST /restock ────────────────────────────────────────────────────────────
// A store owner places a B2B restock order. They submit catalog items; the
// matching engine picks the best in-range wholesaler (the same engine as
// customer orders, filtered to wholesalers). Once a wholesaler accepts, the
// driver fleet delivers to the buyer's store.

router.post(
  '/restock',
  authenticate,
  authorize('STORE_OWNER'),
  requireApproved,
  validate(createRestockSchema),
  async (req: Request, res: Response) => {
    try {
      const { items, paymentMethod, notes } = req.body as z.infer<typeof createRestockSchema>;
      const buyerId = req.user!.id;

      // The buyer must have a registered store (delivery target for the restock).
      const buyerStore = await prisma.store.findUnique({ where: { ownerId: buyerId } });
      if (!buyerStore) {
        return sendError(res, 'You need a registered store to place restock orders', 400);
      }

      const reqCatalogItemIds = items.map((i) => i.catalogItemId);

      // Seed the order with the wholesaler carrying the most of the requested
      // catalog items. The matching engine re-ranks from here and broadcasts to
      // the best in-range wholesalers.
      const candidates = await prisma.store.findMany({
        where: {
          isWholesaler: true,
          status: 'ACTIVE',
          id: { not: buyerStore.id },
          items: {
            some: { catalogItemId: { in: reqCatalogItemIds }, isAvailable: true, stockQty: { gt: 0 } },
          },
        },
        include: {
          items: { where: { catalogItemId: { in: reqCatalogItemIds }, isAvailable: true, stockQty: { gt: 0 } } },
        },
      });
      candidates.sort((a, b) => b.items.length - a.items.length);
      if (candidates.length === 0) {
        return sendError(res, 'No wholesaler currently stocks these items', 404);
      }
      const wholesaler = candidates[0]!;

      // The seed wholesaler must carry ALL requested items to build the order.
      const storeItems = await prisma.storeItem.findMany({
        where: { storeId: wholesaler.id, catalogItemId: { in: reqCatalogItemIds }, isAvailable: true },
        include: { catalogItem: true },
      });
      if (storeItems.length !== reqCatalogItemIds.length) {
        return sendError(res, 'No single wholesaler currently stocks all of these items', 400);
      }
      const resolved = items.map((i) => ({
        storeItem: storeItems.find((si) => si.catalogItemId === i.catalogItemId)!,
        qty: i.qty,
      }));
      for (const r of resolved) {
        if (r.storeItem.stockQty < r.qty) {
          return sendError(res, `Insufficient stock for ${r.storeItem.catalogItem.name}`, 400);
        }
      }

      // Totals. Restock carries no platform commission (B2B); the buyer still
      // pays the delivery fee that funds the driver. Fees are zone-scoped:
      // we look up the zone containing the wholesaler and use its
      // baseDeliveryFee/perKmFee when set, falling back to the global
      // PlatformSetting otherwise.
      const subtotal = resolved.reduce((s, r) => s + r.storeItem.price * r.qty, 0);
      const settings = await getSettings();
      const restockZone = await findZoneForPoint(wholesaler.lat, wholesaler.lng);
      const distanceKm = haversineDistance(
        wholesaler.lat,
        wholesaler.lng,
        buyerStore.lat,
        buyerStore.lng,
      );
      const deliveryFee = parseFloat(
        (
          (restockZone?.baseDeliveryFee ?? settings.baseDeliveryFee) +
          (restockZone?.perKmFee ?? settings.perKmFee) * distanceKm
        ).toFixed(2),
      );
      const total = parseFloat((subtotal + deliveryFee).toFixed(2));

      // The driver delivers to the buyer's store. Order needs an Address row, so
      // reuse / create one mirroring the buyer store's location.
      let deliveryAddress = await prisma.address.findFirst({
        where: { userId: buyerId, label: buyerStore.name, street: buyerStore.street },
      });
      if (!deliveryAddress) {
        deliveryAddress = await prisma.address.create({
          data: {
            userId: buyerId,
            label: buyerStore.name,
            street: buyerStore.street,
            city: buyerStore.city,
            state: buyerStore.state,
            pincode: buyerStore.pincode,
            lat: buyerStore.lat,
            lng: buyerStore.lng,
          },
        });
      }

      const dropoffOtp = Math.floor(1000 + Math.random() * 9000).toString();

      const order = await prisma.order.create({
        data: {
          customerId: buyerId,
          storeId: wholesaler.id,
          buyerStoreId: buyerStore.id,
          orderType: 'RESTOCK',
          status: 'PENDING',
          subtotal,
          deliveryFee,
          commission: 0,
          total,
          paymentMethod,
          paymentStatus: 'PENDING',
          deliveryAddressId: deliveryAddress.id,
          notes,
          dropoffOtp,
          items: {
            create: resolved.map((r) => ({
              itemId: r.storeItem.id,
              name: r.storeItem.catalogItem.name,
              price: r.storeItem.price,
              unit: r.storeItem.catalogItem.defaultUnit,
              qty: r.qty,
              imageUrl: r.storeItem.catalogItem.imageUrl,
            })),
          },
        },
        include: { items: true },
      });

      // Hand off to the matching engine — it picks the best in-range wholesaler.
      await matchingQueue.add('match-store', { orderId: order.id, excludeStoreIds: [] });

      return sendSuccess(res, order, 'Restock order placed successfully', 201);
    } catch (err) {
      console.error('[Orders] restock create error:', err);
      return sendError(res, 'Failed to place restock order', 500);
    }
  },
);

// ─── GET /restock ─────────────────────────────────────────────────────────────
// Restock orders the current store owner has PLACED (outgoing). Incoming restock
// orders a wholesaler receives show up in the normal GET / list.

router.get('/restock', authenticate, authorize('STORE_OWNER'), async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt((req.query['page'] as string) || '1', 10));
    const limit = Math.min(50, parseInt((req.query['limit'] as string) || '20', 10));
    const skip = (page - 1) * limit;
    const where = { customerId: req.user!.id, orderType: 'RESTOCK' as const };

    const [orders, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        include: {
          items: true,
          store: { select: { name: true, owner: { select: { name: true, phone: true } } } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.count({ where }),
    ]);

    return sendSuccess(res, { orders, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[Orders] restock list error:', err);
    return sendError(res, 'Failed to fetch restock orders', 500);
  }
});

// ─── GET /group/:id — multi-store rollup ──────────────────────────────────
// Returns the OrderGroup row + its child Orders so the customer-web /
// customer-mobile order timeline can render one "card" for a cross-store
// basket. Per-store accept / reject / pickup state lives on each child;
// the group's aggregate status, delivery fee, and recipient sit at the
// parent level.
//
// Access is customer-scoped (group.customerId === requester) or admin.
// Drivers see this via GET /:id on a child order; they don't need the
// rollup yet (the multi-pickup screen is a separate sprint).

router.get('/group/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const group = await prisma.orderGroup.findUnique({
      where: { id: req.params['id'] },
      include: {
        deliveryAddress: true,
        orders: {
          include: {
            items: true,
            store: { select: { id: true, name: true, lat: true, lng: true, street: true, city: true } },
            // Pull the rating row so the rollup UI can show "✓ Rated"
            // per leg without an extra fetch per child. We don't need
            // the full comment text on the rollup — UI shows a star
            // count + "Tap to edit" if it needs the full form.
            rating: {
              select: { id: true, storeRating: true, driverRating: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!group) return sendError(res, 'Order group not found', 404);
    const { id: userId, role } = req.user!;
    if (role !== 'ADMIN' && group.customerId !== userId) {
      return sendError(res, 'Access denied', 403);
    }
    // Partial-delivery flag — the customer rollup needs to distinguish
    // "delivered everything" from "delivered some, others were
    // cancelled". rollUpGroupStatus alone returns DELIVERED in both
    // cases because it only looks at the LIVE (non-cancelled) set.
    // Surfaced here so the UI can read "Delivered (2 of 3 stores —
    // 1 cancelled, refunded)" instead of overclaiming success.
    const allLegs = group.orders;
    const cancelledLegs = allLegs.filter((o) => o.status === 'CANCELLED').length;
    const deliveredLegs = allLegs.filter((o) => o.status === 'DELIVERED').length;
    const partiallyFulfilled =
      group.status === 'DELIVERED' && cancelledLegs > 0;
    return sendSuccess(res, {
      ...group,
      cancelledLegs,
      deliveredLegs,
      totalLegs: allLegs.length,
      partiallyFulfilled,
    });
  } catch (err) {
    console.error('[Orders] group detail error:', err);
    return sendError(res, 'Failed to fetch order group', 500);
  }
});

// ─── GET / ────────────────────────────────────────────────────────────────────

router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { id: userId, role } = req.user!;
    const page = Math.max(1, parseInt((req.query['page'] as string) || '1', 10));
    const limit = Math.min(50, parseInt((req.query['limit'] as string) || '20', 10));
    const skip = (page - 1) * limit;

    let where = {};

    if (role === 'CUSTOMER') {
      where = { customerId: userId };
    } else if (role === 'STORE_OWNER') {
      const store = await prisma.store.findUnique({ where: { ownerId: userId } });
      if (!store) return sendSuccess(res, { orders: [], total: 0, page, limit });
      where = { storeId: store.id };
    } else if (role === 'DRIVER') {
      const driver = await prisma.driver.findUnique({ where: { userId } });
      if (!driver) return sendSuccess(res, { orders: [], total: 0, page, limit });
      where = { driverId: driver.id };
    } else if (role === 'ADMIN') {
      where = {};
    }

    const [orders, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        include: { items: true, store: { select: { name: true } }, customer: { select: { name: true, phone: true } } },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.count({ where }),
    ]);

    return sendSuccess(res, { orders, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[Orders] list error:', err);
    return sendError(res, 'Failed to fetch orders', 500);
  }
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────

router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params['id'] },
      include: {
        items: true,
        store: { select: { id: true, name: true, lat: true, lng: true } },
        customer: { select: { id: true, name: true, phone: true } },
        // vehicleType is needed for the ETA estimate below.
        driver: {
          include: {
            user: { select: { name: true, phone: true } },
          },
        },
        deliveryAddress: true,
        rating: true,
      },
    });

    if (!order) return sendError(res, 'Order not found', 404);

    // ── ETA estimate (single source of truth: shared/src/eta.ts) ─────────
    // Pre-assignment: only the delivery leg is known → pre-assignment
    // window (default SCOOTER + 5min slack).
    // Post-assignment: driver lat/lng + vehicle are known → tight 3-leg
    // total (pickup + prep + delivery, vehicle-aware).
    // DELIVERED orders surface 0 — keeps the UI from showing a stale
    // "≈ 20 min" once the order is on the customer's table.
    const { estimateOrderEta } = await import('@aks/shared');
    let etaMinutes: number | null = null;
    if (order.status !== 'DELIVERED' && order.status !== 'CANCELLED' && order.store) {
      const deliveryKm = order.deliveryAddress
        ? haversineDistance(
            order.store.lat,
            order.store.lng,
            order.deliveryAddress.lat,
            order.deliveryAddress.lng,
          )
        : 0;
      let pickupKm: number | null = null;
      let vehicle: 'BIKE' | 'SCOOTER' | 'CAR' | 'BICYCLE' | 'ON_FOOT' | null = null;
      if (order.driver?.currentLat != null && order.driver?.currentLng != null) {
        pickupKm = haversineDistance(
          order.driver.currentLat,
          order.driver.currentLng,
          order.store.lat,
          order.store.lng,
        );
        vehicle = order.driver.vehicleType as typeof vehicle;
      }
      const eta = estimateOrderEta({
        pickupKm,
        deliveryKm,
        driverVehicle: vehicle,
      });
      etaMinutes = eta.totalMinutes;
    }
    const orderWithEta = { ...order, etaMinutes };

    // Verify access
    const { id: userId, role } = req.user!;
    const hasAccess =
      role === 'ADMIN' ||
      order.customerId === userId ||
      (role === 'STORE_OWNER' &&
        (await prisma.store.findFirst({ where: { id: order.storeId, ownerId: userId } }))) ||
      (role === 'DRIVER' &&
        order.driver &&
        (await prisma.driver.findFirst({ where: { id: order.driverId!, userId } })));

    if (!hasAccess) return sendError(res, 'Access denied', 403);

    // Privacy: drivers must NOT see customer name/phone or driver-side dropoffOtp.
    // They see: pickup store + items + dropoff coords + total + payment method.
    if (role === 'DRIVER') {
      const { customer, dropoffOtp: _hidden, ...rest } = orderWithEta as unknown as Record<string, unknown> & {
        customer?: unknown;
        dropoffOtp?: unknown;
      };
      void customer; void _hidden;
      return sendSuccess(res, {
        ...rest,
        customer: null, // PII hidden
        deliveryAddress: order.deliveryAddress
          ? {
              // Coords + minimal label, no street/name
              lat: order.deliveryAddress.lat,
              lng: order.deliveryAddress.lng,
              label: order.deliveryAddress.label,
              pincode: order.deliveryAddress.pincode,
              city: order.deliveryAddress.city,
            }
          : null,
      });
    }

    // Group context for multi-store baskets — surfaces "you're one of 3
    // legs" on store-portal / store-web without leaking sibling store
    // names. Counts only; the store owner doesn't need to know which
    // competitors are in the same basket. Customer + admin already see
    // the full rollup via /orders/group/:id.
    let groupContext: {
      orderGroupId: string;
      totalLegs: number;
      acceptedLegs: number;
      deliveredLegs: number;
    } | null = null;
    if (order.orderGroupId) {
      const siblings = await prisma.order.findMany({
        where: { orderGroupId: order.orderGroupId },
        select: { status: true },
      });
      groupContext = {
        orderGroupId: order.orderGroupId,
        totalLegs: siblings.length,
        acceptedLegs: siblings.filter((s) =>
          ['STORE_ACCEPTED', 'COOKING', 'DRIVER_ASSIGNED', 'PICKED_UP', 'DELIVERED'].includes(s.status),
        ).length,
        deliveredLegs: siblings.filter((s) => s.status === 'DELIVERED').length,
      };
    }

    return sendSuccess(res, { ...orderWithEta, groupContext });
  } catch (err) {
    console.error('[Orders] get error:', err);
    return sendError(res, 'Failed to fetch order', 500);
  }
});

// ─── PUT /:id/accept ──────────────────────────────────────────────────────────

router.put(
  '/:id/accept',
  authenticate,
  authorize('STORE_OWNER'),
  requireApproved,
  async (req: Request, res: Response) => {
    try {
      const order = await prisma.order.findUnique({ where: { id: req.params['id'] } });
      if (!order) return sendError(res, 'Order not found', 404);

      const store = await prisma.store.findFirst({
        where: { id: order.storeId, ownerId: req.user!.id },
      });
      if (!store) return sendError(res, 'Unauthorized', 403);

      if (order.status !== 'PENDING') {
        return sendError(res, `Cannot accept order with status ${order.status}`, 400);
      }

      // Stock commit happens on accept (not on create). Wrap the decrement
      // + status flip in a transaction so a stock failure aborts the whole
      // accept — the order stays PENDING and the store-portal can show
      // "Update inventory, then try again". InsufficientStockError bubbles
      // out of the transaction so we can map it to a 409.
      let updated;
      try {
        updated = await prisma.$transaction(async (tx) => {
          await decrementStockForOrder(tx, order.id);
          return tx.order.update({
            where: { id: order.id },
            data: { status: 'STORE_ACCEPTED', storeAcceptedAt: new Date() },
          });
        });
      } catch (err) {
        if (err instanceof InsufficientStockError) {
          return sendError(
            res,
            `${err.itemName} is now out of stock. Update your inventory then try again.`,
            409,
          );
        }
        throw err;
      }

      await broadcastOrderStatus(order.id, 'STORE_ACCEPTED');
      await sendNotification(order.customerId, 'Order Accepted', 'Your order has been accepted by the store!', { orderId: order.id });

      // Driver assignment.
      // Single-store orders: trigger immediately as before.
      // Multi-store group: only trigger ONCE all sibling legs in the
      // group have transitioned past PENDING. The driver does sequential
      // pickups for the whole group → assigning per-leg would split the
      // basket across drivers (defeats the point). The first child that
      // crosses the threshold queues a single assignment job using its
      // own orderId as the seed; the matching engine then sets driverId
      // on every sibling via the order-group service.
      if (order.orderGroupId) {
        const siblings = await prisma.order.findMany({
          where: { orderGroupId: order.orderGroupId },
          select: { id: true, status: true },
        });
        const allAccepted = siblings.every(
          (s) =>
            s.status !== 'PENDING' ||
            // The just-accepted row reads as PENDING in this snapshot
            // because the findMany ran in a separate query — match by id.
            s.id === order.id,
        );
        if (allAccepted) {
          assignDriverForOrder(order.id).catch(console.error);
        }
        // Roll up the group's status for the customer rollup.
        const { rollUpGroupStatus } = await import('../services/order-group.service');
        await rollUpGroupStatus(prisma, order.orderGroupId);
      } else {
        assignDriverForOrder(order.id).catch(console.error);
      }

      return sendSuccess(res, updated, 'Order accepted');
    } catch (err) {
      console.error('[Orders] accept error:', err);
      return sendError(res, 'Failed to accept order', 500);
    }
  },
);

// ─── PUT /:id/reject ──────────────────────────────────────────────────────────

router.put(
  '/:id/reject',
  authenticate,
  authorize('STORE_OWNER'),
  requireApproved,
  validate(rejectOrderSchema),
  async (req: Request, res: Response) => {
    try {
      const order = await prisma.order.findUnique({ where: { id: req.params['id'] } });
      if (!order) return sendError(res, 'Order not found', 404);

      const store = await prisma.store.findFirst({
        where: { id: order.storeId, ownerId: req.user!.id },
      });
      if (!store) return sendError(res, 'Unauthorized', 403);

      if (order.status !== 'PENDING') {
        return sendError(res, `Cannot reject order with status ${order.status}`, 400);
      }

      const updated = await prisma.order.update({
        where: { id: order.id },
        data: { status: 'REJECTED', rejectionReason: req.body.reason },
      });

      await broadcastOrderStatus(order.id, 'REJECTED', { reason: req.body.reason });

      // Re-trigger matching for the next best seller. Works for both customer
      // orders (retail stores) and restock orders (wholesalers) — the engine
      // picks the candidate set based on the order's type.
      await matchingQueue.add('match-store', {
        orderId: order.id,
        excludeStoreIds: [order.storeId],
      });

      await sendNotification(
        order.customerId,
        'Order update',
        order.orderType === 'RESTOCK'
          ? 'A wholesaler could not fulfill your restock order. Finding another...'
          : 'The store could not fulfill your order. Finding another store...',
        { orderId: order.id },
      );

      return sendSuccess(res, updated, 'Order rejected');
    } catch (err) {
      console.error('[Orders] reject error:', err);
      return sendError(res, 'Failed to reject order', 500);
    }
  },
);

// ─── PUT /:id/ready ───────────────────────────────────────────────────────────

router.put(
  '/:id/ready',
  authenticate,
  authorize('STORE_OWNER'),
  requireApproved,
  async (req: Request, res: Response) => {
    try {
      const order = await prisma.order.findUnique({ where: { id: req.params['id'] } });
      if (!order) return sendError(res, 'Order not found', 404);

      const store = await prisma.store.findFirst({
        where: { id: order.storeId, ownerId: req.user!.id },
      });
      if (!store) return sendError(res, 'Unauthorized', 403);

      // Allow from STORE_ACCEPTED (non-restaurant), COOKING (restaurant
      // came out of the cooking step), or DRIVER_ASSIGNED (legacy edge).
      if (!['STORE_ACCEPTED', 'COOKING', 'DRIVER_ASSIGNED'].includes(order.status)) {
        return sendError(res, `Cannot mark as ready with status ${order.status}`, 400);
      }

      // Idempotent: if already packed, this is a no-op (also fixes the
      // 'button clickable multiple times' bug — frontend should hide once
      // packedAt is set, but server-side guard prevents duplicate sends).
      if (order.packedAt) {
        return sendError(res, 'Order is already marked as ready', 400);
      }

      // Set the timestamp; if restaurant was in COOKING, drop back to
      // STORE_ACCEPTED so the existing driver-assign flow can proceed.
      await prisma.order.update({
        where: { id: order.id },
        data: {
          packedAt: new Date(),
          ...(order.status === 'COOKING' ? { status: 'STORE_ACCEPTED' as const } : {}),
        },
      });

      await sendNotification(
        order.customerId,
        'Order Ready',
        'Your order is packed and ready for pickup!',
        { orderId: order.id },
      );

      if (order.driverId) {
        const driver = await prisma.driver.findUnique({
          where: { id: order.driverId },
          select: { userId: true },
        });
        if (driver) {
          await sendNotification(
            driver.userId,
            'Order Ready for Pickup',
            'The order is ready. Please head to the store for pickup.',
            { orderId: order.id },
          );
        }
      }

      return sendSuccess(res, { orderId: order.id, packedAt: new Date() }, 'Order marked as ready');
    } catch (err) {
      console.error('[Orders] ready error:', err);
      return sendError(res, 'Failed to mark order as ready', 500);
    }
  },
);

// ─── PUT /:id/cooking ─────────────────────────────────────────────────────────
// Restaurant / cloud-kitchen workflow ONLY. Adds an intermediate COOKING
// state between STORE_ACCEPTED and DRIVER_ASSIGNED so customers can see
// "your food is being prepared." Non-restaurant stores don't get this
// button on store-web; for backward compat the endpoint also rejects
// non-RESTAURANT calls so a buggy client can't accidentally fire it.

router.put(
  '/:id/cooking',
  authenticate,
  authorize('STORE_OWNER'),
  requireApproved,
  async (req: Request, res: Response) => {
    try {
      const order = await prisma.order.findUnique({
        where: { id: req.params['id'] },
        include: { store: { select: { ownerId: true, category: true } } },
      });
      if (!order) return sendError(res, 'Order not found', 404);
      if (order.store.ownerId !== req.user!.id) return sendError(res, 'Unauthorized', 403);
      if (order.store.category !== 'RESTAURANT') {
        return sendError(res, 'Cooking step is only for restaurant orders', 400);
      }
      if (order.status !== 'STORE_ACCEPTED') {
        return sendError(res, `Cannot start cooking with status ${order.status}`, 400);
      }

      const updated = await prisma.order.update({
        where: { id: order.id },
        data: { status: 'COOKING', cookingStartedAt: new Date() },
      });
      await broadcastOrderStatus(order.id, 'COOKING');
      await sendNotification(
        order.customerId,
        'Your order is cooking',
        'The restaurant has started preparing your food.',
        { orderId: order.id },
      );

      return sendSuccess(res, updated, 'Order marked as cooking');
    } catch (err) {
      console.error('[Orders] cooking error:', err);
      return sendError(res, 'Failed to mark order as cooking', 500);
    }
  },
);

// ─── PUT /group/:id/cancel ────────────────────────────────────────────────
// Customer-initiated cancel for a whole multi-store basket. Cancels
// every leg that's still cancellable (PENDING / STORE_ACCEPTED /
// DRIVER_ASSIGNED-but-not-picked-up); legs already PICKED_UP or
// DELIVERED are skipped (they're past the point of no return).
//
// Refund + stock revert rules mirror the per-order handler:
//   * PAID legs get a wallet refund for (subtotal + their share of the
//     group's deliveryFee — split proportional to subtotal).
//   * Legs whose status was past PENDING get their stock incremented
//     back (statusHadStockDecrement check, same as the per-order path).
//   * Customers can't cancel if NO leg is cancellable — 400 in that
//     case so the UI surfaces a clear "too late, contact support".

router.put(
  '/group/:id/cancel',
  authenticate,
  authorize('CUSTOMER'),
  validate(cancelOrderSchema),
  async (req: Request, res: Response) => {
    try {
      const groupId = req.params['id'] as string;
      const reason = (req.body?.reason as string).trim();

      const group = await prisma.orderGroup.findUnique({
        where: { id: groupId },
        include: { orders: true },
      });
      if (!group) return sendError(res, 'Order group not found', 404);
      if (group.customerId !== req.user!.id) {
        return sendError(res, 'Unauthorized', 403);
      }

      // Bucket legs by whether they're cancellable. Same predicate as
      // PUT /:id/cancel: anything before the driver has physically
      // picked it up.
      const cancellable = group.orders.filter(
        (o) =>
          o.status === 'PENDING' ||
          o.status === 'STORE_ACCEPTED' ||
          o.status === 'COOKING' ||
          (o.status === 'DRIVER_ASSIGNED' && o.pickedUpAt === null),
      );
      if (cancellable.length === 0) {
        return sendError(
          res,
          'No legs in this group can be cancelled. Contact support if you need a refund.',
          400,
        );
      }

      // Proportional refund split for the group's single deliveryFee.
      // If only SOME legs are cancellable (others delivered), refund
      // just those legs' share — the delivered ones keep their slice
      // of the delivery fee.
      const cancellableSubtotal = cancellable.reduce((s, o) => s + o.subtotal, 0);
      const groupSubtotal = group.orders.reduce((s, o) => s + o.subtotal, 0);
      const refundDeliveryShare =
        groupSubtotal > 0
          ? Math.round((group.deliveryFee * cancellableSubtotal) / groupSubtotal * 100) / 100
          : 0;
      const shouldRefund = group.paymentStatus === 'PAID';
      const totalRefundPaise = shouldRefund
        ? Math.round(cancellableSubtotal * 100) + Math.round(refundDeliveryShare * 100)
        : 0;

      // Walk legs in a transaction so partial failure leaves nothing
      // half-cancelled.
      const cancelledLegs: string[] = [];
      await prisma.$transaction(async (tx) => {
        for (const leg of cancellable) {
          if (statusHadStockDecrement(leg.status)) {
            await incrementStockForOrder(tx, leg.id);
          }
          await tx.order.update({
            where: { id: leg.id },
            data: {
              status: 'CANCELLED',
              cancelReason: reason,
              paymentStatus: shouldRefund ? 'REFUNDED' : leg.paymentStatus,
            },
          });
          cancelledLegs.push(leg.id);
        }
        const { rollUpGroupStatus } = await import(
          '../services/order-group.service'
        );
        await rollUpGroupStatus(tx, groupId);
      });

      // Refund + notify outside the transaction so a wallet-service
      // hiccup doesn't roll back the cancellation (the orders are
      // already cancelled — the customer just needs the credit).
      if (totalRefundPaise > 0) {
        try {
          await creditWallet({
            userId: group.customerId,
            amount: totalRefundPaise,
            kind: 'REFUND',
            // Reference the FIRST cancelled leg for the wallet txn link.
            orderId: cancelledLegs[0]!,
            note: `Refund for cancelled multi-store order #${groupId.slice(-6)}`,
          });
        } catch (refundErr) {
          console.error('[Orders] group cancel refund error:', refundErr);
        }
      }

      // Broadcast per-leg status so per-store screens update too.
      for (const id of cancelledLegs) {
        await broadcastOrderStatus(id, 'CANCELLED', { reason });
      }

      return sendSuccess(
        res,
        {
          groupId,
          cancelledLegs,
          refundRupees: totalRefundPaise / 100,
        },
        'Group cancelled',
      );
    } catch (err) {
      console.error('[Orders] group cancel error:', err);
      return sendError(res, 'Failed to cancel order group', 500);
    }
  },
);

// ─── PUT /:id/cancel ──────────────────────────────────────────────────────────

router.put(
  '/:id/cancel',
  authenticate,
  authorize('CUSTOMER'),
  validate(cancelOrderSchema),
  async (req: Request, res: Response) => {
    try {
      const order = await prisma.order.findUnique({
        where: { id: req.params['id'] },
        include: { store: { select: { ownerId: true, name: true } } },
      }) as
        | (Awaited<ReturnType<typeof prisma.order.findUnique>> & {
            store: { ownerId: string; name: string } | null;
          })
        | null;
      if (!order) return sendError(res, 'Order not found', 404);

      if (order.customerId !== req.user!.id) return sendError(res, 'Unauthorized', 403);

      // Cancellable when:
      //   - PENDING / STORE_ACCEPTED (no driver yet), OR
      //   - DRIVER_ASSIGNED but driver hasn't picked up yet (pickedUpAt null)
      const cancellable =
        order.status === 'PENDING' ||
        order.status === 'STORE_ACCEPTED' ||
        (order.status === 'DRIVER_ASSIGNED' && order.pickedUpAt === null);
      if (!cancellable) {
        return sendError(res, 'Order can no longer be cancelled', 400);
      }

      const reason = req.body.reason as string;
      const shouldRefund = order.paymentStatus === 'PAID';
      // Refund the customer-paid amount: subtotal + deliveryFee, in paise.
      // (commission is platform revenue, not money paid by the customer.)
      const refundPaiseRaw =
        Math.round(order.subtotal * 100) + Math.round(order.deliveryFee * 100);
      const refundPaise = Math.max(0, refundPaiseRaw);

      // Revert stock if it had been decremented (i.e. order was past PENDING).
      // PENDING → CANCELLED never touched stock, so no revert in that case.
      const shouldRevertStock = statusHadStockDecrement(order.status);
      const updated = await prisma.$transaction(async (tx) => {
        if (shouldRevertStock) {
          await incrementStockForOrder(tx, order.id);
        }
        return tx.order.update({
          where: { id: order.id },
          data: {
            status: 'CANCELLED',
            cancelReason: reason,
            paymentStatus: shouldRefund ? 'REFUNDED' : order.paymentStatus,
          },
        });
      });

      // Credit the wallet AFTER the order state is durable. If this throws
      // we surface the error — the order is already cancelled, the customer
      // can retry refund via admin support.
      if (shouldRefund && refundPaise > 0) {
        try {
          await creditWallet({
            userId: order.customerId,
            amount: refundPaise,
            kind: 'REFUND',
            orderId: order.id,
            note: `Refund for cancelled order #${order.id.slice(-6)}`,
          });
        } catch (refundErr) {
          console.error('[Orders] cancel refund error:', refundErr);
          // Don't fail the cancel — the order is cancelled, admin can issue a manual credit.
        }
      }

      await broadcastOrderStatus(order.id, 'CANCELLED', { reason });

      // Notify the store owner if they had accepted (so they stop preparing)
      if (
        order.store?.ownerId &&
        (order.status === 'STORE_ACCEPTED' || order.status === 'DRIVER_ASSIGNED')
      ) {
        notify('STORE_ORDER_RESCINDED', order.store.ownerId, {
          orderShort: order.id.slice(-6),
          orderId: order.id,
        }).catch((e) => console.error('[Orders] notify store rescind error:', e));
      }

      // Notify the customer about the wallet credit
      if (shouldRefund && refundPaise > 0) {
        const refundRupees = (refundPaise / 100).toFixed(2);
        // Re-read the balance so the push body reflects the post-credit total
        const wallet = await prisma.wallet.findUnique({ where: { userId: order.customerId } });
        const balanceRupees = wallet ? (wallet.balance / 100).toFixed(2) : refundRupees;
        notify('WALLET_CREDIT', order.customerId, {
          amount: refundRupees,
          balance: balanceRupees,
          reason: 'order cancelled',
          orderId: order.id,
        }).catch((e) => console.error('[Orders] notify wallet credit error:', e));
      }

      return sendSuccess(res, updated, 'Order cancelled successfully');
    } catch (err) {
      console.error('[Orders] cancel error:', err);
      return sendError(res, 'Failed to cancel order', 500);
    }
  },
);

// ─── POST /:id/rate ───────────────────────────────────────────────────────────

router.post(
  '/:id/rate',
  authenticate,
  authorize('CUSTOMER'),
  validate(rateOrderSchema),
  async (req: Request, res: Response) => {
    try {
      const order = await prisma.order.findUnique({
        where: { id: req.params['id'] },
        include: { rating: true },
      });

      if (!order) return sendError(res, 'Order not found', 404);
      if (order.customerId !== req.user!.id) return sendError(res, 'Unauthorized', 403);
      if (order.status !== 'DELIVERED') return sendError(res, 'Can only rate delivered orders', 400);
      if (order.rating) return sendError(res, 'Order has already been rated', 409);

      const { storeRating, driverRating, storeComment, driverComment } = req.body as z.infer<
        typeof rateOrderSchema
      >;

      // Multi-store group: the SAME driver carries every leg, so if the
      // customer rates leg #1 with a driverRating and then rates leg #2,
      // applying the driverRating again would double-count the same
      // delivery trip. Detect "driver already got a rating via a sibling
      // in this group" and skip the aggregate update on subsequent legs.
      // Per-leg storeRating remains independent (each store gets its
      // own sample as expected).
      let suppressDriverAggregate = false;
      if (order.orderGroupId && order.driverId && driverRating !== undefined) {
        const siblingRated = await prisma.orderRating.count({
          where: {
            order: {
              orderGroupId: order.orderGroupId,
              id: { not: order.id },
              driverId: order.driverId,
            },
            driverRating: { not: null },
          },
        });
        suppressDriverAggregate = siblingRated > 0;
      }

      const ratingRecord = await prisma.$transaction(async (tx) => {
        const created = await tx.orderRating.create({
          data: {
            orderId: order.id,
            customerId: req.user!.id,
            storeRating,
            driverRating,
            storeComment,
            driverComment,
          },
        });

        // Update store aggregate rating
        const store = await tx.store.findUnique({
          where: { id: order.storeId },
          select: { rating: true, totalRatings: true },
        });
        if (store) {
          const newTotal = store.totalRatings + 1;
          const newRating = (store.rating * store.totalRatings + storeRating) / newTotal;
          await tx.store.update({
            where: { id: order.storeId },
            data: { rating: parseFloat(newRating.toFixed(2)), totalRatings: newTotal },
          });
        }

        // Update driver aggregate rating — skipped for sibling-leg
        // re-ratings (see suppressDriverAggregate above) so one delivery
        // trip contributes one driver rating sample, not N.
        if (
          order.driverId &&
          driverRating !== undefined &&
          !suppressDriverAggregate
        ) {
          const driver = await tx.driver.findUnique({
            where: { id: order.driverId },
            select: { rating: true, totalRatings: true },
          });
          if (driver) {
            const newTotal = driver.totalRatings + 1;
            const newRating = (driver.rating * driver.totalRatings + driverRating) / newTotal;
            await tx.driver.update({
              where: { id: order.driverId },
              data: { rating: parseFloat(newRating.toFixed(2)), totalRatings: newTotal },
            });
          }
        }

        return created;
      });

      return sendSuccess(res, ratingRecord, 'Thank you for your feedback!', 201);
    } catch (err) {
      console.error('[Orders] rate error:', err);
      return sendError(res, 'Failed to submit rating', 500);
    }
  },
);

// ─── GET /:id/invoice — download the GST invoice PDF ────────────────────────
// Auth: order's customer, the assigned driver, the store owner (intra-store),
// or any ADMIN. Streams the PDF; lazy-generates on first call if it wasn't
// yet (so the customer never sees a 404 just because the post-delivery
// background job hasn't run yet).

router.get('/:id/invoice', authenticate, async (req: Request, res: Response) => {
  try {
    const orderId = req.params['id']!;
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { store: { select: { ownerId: true } }, driver: { select: { userId: true } } },
    });
    if (!order) return sendError(res, 'Order not found', 404);

    const me = req.user!;
    const allowed =
      me.role === 'ADMIN' ||
      me.id === order.customerId ||
      me.id === order.store.ownerId ||
      (order.driver && me.id === order.driver.userId);
    if (!allowed) return sendError(res, 'Forbidden', 403);

    if (order.status !== 'DELIVERED') {
      return sendError(res, 'Invoice is generated after delivery', 400);
    }

    // Lazy-generate (also covers the case where the post-delivery background
    // task failed silently — first download attempt retries it).
    let invoicePath = order.invoicePath;
    if (!invoicePath) {
      const result = await generateInvoiceForOrder(orderId);
      if (!result) return sendError(res, 'Failed to generate invoice', 500);
      invoicePath = result.invoicePath;
    }

    const absPath = resolveInvoiceAbsolutePath(invoicePath);
    if (!absPath) {
      // File was deleted off the volume — regenerate.
      const result = await generateInvoiceForOrder(orderId);
      if (!result) return sendError(res, 'Failed to generate invoice', 500);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${(order.invoiceNumber ?? 'invoice').replace(/[^a-zA-Z0-9-]/g, '_')}.pdf"`,
      );
      return res.sendFile(result.absolutePath);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${(order.invoiceNumber ?? 'invoice').replace(/[^a-zA-Z0-9-]/g, '_')}.pdf"`,
    );
    return res.sendFile(absPath);
  } catch (err) {
    console.error('[Orders] invoice download error:', err);
    return sendError(res, 'Failed to fetch invoice', 500);
  }
});

export default router;
