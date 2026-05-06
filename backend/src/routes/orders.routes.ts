import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PaymentMethod } from '@prisma/client';
import { prisma } from '../config/prisma';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { sendSuccess, sendError } from '../utils/response';
import { matchingQueue } from '../queues';
import { assignDriverForOrder } from '../services/driver.service';
import { sendNotification } from '../services/notification.service';
import { broadcastOrderStatus } from '../services/order-events.service';

const router = Router();

const DELIVERY_FEE = 30;
const COMMISSION_RATE = 0.05; // 5%

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
  deliveryAddressId: z.string().cuid(),
  paymentMethod: z.nativeEnum(PaymentMethod),
  notes: z.string().max(500).optional(),
  promoCode: z.string().optional(),
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
      const { items, deliveryAddressId, paymentMethod, notes } = req.body as z.infer<
        typeof createOrderSchema
      >;

      // Validate delivery address belongs to user
      const address = await prisma.address.findFirst({
        where: { id: deliveryAddressId, userId: req.user!.id },
      });
      if (!address) return sendError(res, 'Delivery address not found', 404);

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
          id: string; storeId: string; price: number; stockQty: number; isAvailable: boolean;
          catalogItem: { name: string; defaultUnit: string; imageUrl: string | null };
        };
        qty: number;
      }> = [];

      if (reqStoreItemIds.length > 0) {
        // Mode 1: load store-items directly
        const storeItems = await prisma.storeItem.findMany({
          where: { id: { in: reqStoreItemIds }, isAvailable: true },
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

        if (!candidateStoreId) {
          // Find a store that carries all the requested catalog items
          const carryingAll = await prisma.store.findMany({
            where: {
              status: 'ACTIVE',
              isOpen: true,
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

      // Calculate totals (price snapshot at order time)
      const subtotal = resolvedItems.reduce((s, r) => s + r.storeItem.price * r.qty, 0);
      const deliveryFee = DELIVERY_FEE;
      const commission = parseFloat((subtotal * COMMISSION_RATE).toFixed(2));

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
            deliveryAddressId,
            notes,
            dropoffOtp,
            promoCode: promoCodeApplied,
            promoDiscount: promoDiscount > 0 ? promoDiscount : null,
            items: {
              create: resolvedItems.map((r) => ({
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

      return sendSuccess(res, order, 'Order placed successfully', 201);
    } catch (err) {
      console.error('[Orders] create error:', err);
      return sendError(res, 'Failed to place order', 500);
    }
  },
);

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
        driver: { include: { user: { select: { name: true, phone: true } } } },
        deliveryAddress: true,
        rating: true,
      },
    });

    if (!order) return sendError(res, 'Order not found', 404);

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
      const { customer, dropoffOtp: _hidden, ...rest } = order as unknown as Record<string, unknown> & {
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

    return sendSuccess(res, order);
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

      const updated = await prisma.order.update({
        where: { id: order.id },
        data: { status: 'STORE_ACCEPTED', storeAcceptedAt: new Date() },
      });

      await broadcastOrderStatus(order.id, 'STORE_ACCEPTED');
      await sendNotification(order.customerId, 'Order Accepted', 'Your order has been accepted by the store!', { orderId: order.id });

      // Trigger driver assignment
      assignDriverForOrder(order.id).catch(console.error);

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

      // Re-trigger matching for next best store
      await matchingQueue.add('match-store', {
        orderId: order.id,
        excludeStoreIds: [order.storeId],
      });

      await sendNotification(
        order.customerId,
        'Store Update',
        'The store could not fulfill your order. Finding another store...',
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
  async (req: Request, res: Response) => {
    try {
      const order = await prisma.order.findUnique({ where: { id: req.params['id'] } });
      if (!order) return sendError(res, 'Order not found', 404);

      const store = await prisma.store.findFirst({
        where: { id: order.storeId, ownerId: req.user!.id },
      });
      if (!store) return sendError(res, 'Unauthorized', 403);

      if (!['STORE_ACCEPTED', 'DRIVER_ASSIGNED'].includes(order.status)) {
        return sendError(res, `Cannot mark as ready with status ${order.status}`, 400);
      }

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

      return sendSuccess(res, { orderId: order.id }, 'Order marked as ready');
    } catch (err) {
      console.error('[Orders] ready error:', err);
      return sendError(res, 'Failed to mark order as ready', 500);
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
      const order = await prisma.order.findUnique({ where: { id: req.params['id'] } });
      if (!order) return sendError(res, 'Order not found', 404);

      if (order.customerId !== req.user!.id) return sendError(res, 'Unauthorized', 403);

      if (!['PENDING', 'STORE_ACCEPTED'].includes(order.status)) {
        return sendError(res, 'Order can only be cancelled before it is picked up', 400);
      }

      const updated = await prisma.order.update({
        where: { id: order.id },
        data: { status: 'CANCELLED', cancelReason: req.body.reason },
      });

      await broadcastOrderStatus(order.id, 'CANCELLED', { reason: req.body.reason });

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

        // Update driver aggregate rating
        if (order.driverId && driverRating !== undefined) {
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

export default router;
