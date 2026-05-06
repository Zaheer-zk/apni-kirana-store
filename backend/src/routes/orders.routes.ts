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

const router = Router();

const DELIVERY_FEE = 30;
const COMMISSION_RATE = 0.05; // 5%

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: z.string().cuid(),
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

      // Validate and load all items
      const itemIds = items.map((i) => i.itemId);
      const dbItems = await prisma.item.findMany({
        where: { id: { in: itemIds }, isAvailable: true },
        include: { store: { select: { id: true } } },
      });

      if (dbItems.length !== itemIds.length) {
        return sendError(res, 'One or more items are unavailable or not found', 400);
      }

      // Verify sufficient stock
      for (const orderItem of items) {
        const dbItem = dbItems.find((i) => i.id === orderItem.itemId)!;
        if (dbItem.stockQty < orderItem.qty) {
          return sendError(res, `Insufficient stock for item: ${dbItem.name}`, 400);
        }
      }

      // Use the first item's store as the initial store (matching engine will reassign)
      const initialStoreId = dbItems[0]!.store.id;

      // Calculate totals
      const subtotal = items.reduce((sum, orderItem) => {
        const dbItem = dbItems.find((i) => i.id === orderItem.itemId)!;
        return sum + dbItem.price * orderItem.qty;
      }, 0);
      const deliveryFee = DELIVERY_FEE;
      const commission = parseFloat((subtotal * COMMISSION_RATE).toFixed(2));
      const total = parseFloat((subtotal + deliveryFee).toFixed(2));

      // Create order in a transaction
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
            items: {
              create: items.map((orderItem) => {
                const dbItem = dbItems.find((i) => i.id === orderItem.itemId)!;
                return {
                  itemId: orderItem.itemId,
                  name: dbItem.name,
                  price: dbItem.price,
                  unit: dbItem.unit,
                  qty: orderItem.qty,
                  imageUrl: dbItem.imageUrl,
                };
              }),
            },
          },
          include: { items: true },
        });

        return created;
      });

      // Trigger store matching asynchronously via queue
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
