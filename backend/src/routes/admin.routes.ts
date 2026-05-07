import { Router, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { sendSuccess, sendError } from '../utils/response';
import { broadcastOrderStatus } from '../services/order-events.service';
import { haversineDistance } from '../utils/geo';
import { notify } from '../services/notification.service';

const router = Router();

// All admin routes require ADMIN role
router.use(authenticate, authorize('ADMIN'));

// ─── GET /users ───────────────────────────────────────────────────────────────

router.get('/users', async (req: Request, res: Response) => {
  try {
    const search = req.query['search'] as string | undefined;
    const page = Math.max(1, parseInt((req.query['page'] as string) || '1', 10));
    const limit = Math.min(100, parseInt((req.query['limit'] as string) || '20', 10));
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { phone: { contains: search, mode: 'insensitive' as const } },
            { name: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        select: { id: true, name: true, phone: true, role: true, isActive: true, createdAt: true },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    return sendSuccess(res, { users, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[Admin] get users error:', err);
    return sendError(res, 'Failed to fetch users', 500);
  }
});

// ─── PUT /users/:id/suspend ───────────────────────────────────────────────────

router.put('/users/:id/suspend', async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params['id'] } });
    if (!user) return sendError(res, 'User not found', 404);

    const updated = await prisma.user.update({
      where: { id: req.params['id'] },
      data: { isActive: !user.isActive },
      select: { id: true, isActive: true },
    });

    return sendSuccess(
      res,
      updated,
      `User ${updated.isActive ? 'activated' : 'suspended'} successfully`,
    );
  } catch (err) {
    console.error('[Admin] suspend user error:', err);
    return sendError(res, 'Failed to update user status', 500);
  }
});

// ─── GET /stores ──────────────────────────────────────────────────────────────
// Supports ?status=PENDING_APPROVAL|ACTIVE|SUSPENDED and ?search=name

router.get('/stores', async (req: Request, res: Response) => {
  try {
    const status = req.query['status'] as string | undefined;
    const search = req.query['search'] as string | undefined;
    const page = Math.max(1, parseInt((req.query['page'] as string) || '1', 10));
    const limit = Math.min(100, parseInt((req.query['limit'] as string) || '50', 10));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (status) where['status'] = status;
    if (search) where['name'] = { contains: search, mode: 'insensitive' };

    const [stores, total] = await prisma.$transaction([
      prisma.store.findMany({
        where,
        include: {
          owner: { select: { id: true, name: true, phone: true } },
          _count: { select: { items: true, orders: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.store.count({ where }),
    ]);

    return sendSuccess(res, { stores, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[Admin] get stores error:', err);
    return sendError(res, 'Failed to fetch stores', 500);
  }
});

// ─── GET /stores/pending ──────────────────────────────────────────────────────
// Kept for backwards compatibility

router.get('/stores/pending', async (_req: Request, res: Response) => {
  try {
    const stores = await prisma.store.findMany({
      where: { status: 'PENDING_APPROVAL' },
      include: { owner: { select: { id: true, name: true, phone: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return sendSuccess(res, stores);
  } catch (err) {
    console.error('[Admin] pending stores error:', err);
    return sendError(res, 'Failed to fetch pending stores', 500);
  }
});

// ─── PUT /stores/:id/approve ──────────────────────────────────────────────────

router.put('/stores/:id/approve', async (req: Request, res: Response) => {
  try {
    const store = await prisma.store.findUnique({ where: { id: req.params['id'] } });
    if (!store) return sendError(res, 'Store not found', 404);

    const updated = await prisma.store.update({
      where: { id: req.params['id'] },
      data: { status: 'ACTIVE' },
    });

    return sendSuccess(res, updated, 'Store approved successfully');
  } catch (err) {
    console.error('[Admin] approve store error:', err);
    return sendError(res, 'Failed to approve store', 500);
  }
});

// ─── PUT /stores/:id/suspend ──────────────────────────────────────────────────

router.put('/stores/:id/suspend', async (req: Request, res: Response) => {
  try {
    const store = await prisma.store.findUnique({ where: { id: req.params['id'] } });
    if (!store) return sendError(res, 'Store not found', 404);

    const updated = await prisma.store.update({
      where: { id: req.params['id'] },
      data: { status: 'SUSPENDED', isOpen: false },
    });

    return sendSuccess(res, updated, 'Store suspended successfully');
  } catch (err) {
    console.error('[Admin] suspend store error:', err);
    return sendError(res, 'Failed to suspend store', 500);
  }
});

// ─── GET /drivers ─────────────────────────────────────────────────────────────
// Supports ?status=PENDING_APPROVAL|ACTIVE|ONLINE|OFFLINE|SUSPENDED

router.get('/drivers', async (req: Request, res: Response) => {
  try {
    const status = req.query['status'] as string | undefined;
    const page = Math.max(1, parseInt((req.query['page'] as string) || '1', 10));
    const limit = Math.min(100, parseInt((req.query['limit'] as string) || '50', 10));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (status) where['status'] = status;

    const [drivers, total] = await prisma.$transaction([
      prisma.driver.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, phone: true } },
          _count: { select: { orders: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.driver.count({ where }),
    ]);

    return sendSuccess(res, { drivers, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[Admin] get drivers error:', err);
    return sendError(res, 'Failed to fetch drivers', 500);
  }
});

// ─── GET /drivers/pending ─────────────────────────────────────────────────────
// Kept for backwards compatibility

router.get('/drivers/pending', async (_req: Request, res: Response) => {
  try {
    const drivers = await prisma.driver.findMany({
      where: { status: 'PENDING_APPROVAL' },
      include: { user: { select: { id: true, name: true, phone: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return sendSuccess(res, drivers);
  } catch (err) {
    console.error('[Admin] pending drivers error:', err);
    return sendError(res, 'Failed to fetch pending drivers', 500);
  }
});

// ─── PUT /drivers/:id/suspend ─────────────────────────────────────────────────

router.put('/drivers/:id/suspend', async (req: Request, res: Response) => {
  try {
    const driver = await prisma.driver.findUnique({ where: { id: req.params['id'] } });
    if (!driver) return sendError(res, 'Driver not found', 404);

    const newStatus = driver.status === 'SUSPENDED' ? 'OFFLINE' : 'SUSPENDED';
    const updated = await prisma.driver.update({
      where: { id: req.params['id'] },
      data: { status: newStatus },
    });

    return sendSuccess(res, updated, `Driver ${newStatus === 'SUSPENDED' ? 'suspended' : 'reactivated'}`);
  } catch (err) {
    console.error('[Admin] suspend driver error:', err);
    return sendError(res, 'Failed to update driver status', 500);
  }
});

// ─── PUT /drivers/:id/approve ─────────────────────────────────────────────────

router.put('/drivers/:id/approve', async (req: Request, res: Response) => {
  try {
    const driver = await prisma.driver.findUnique({ where: { id: req.params['id'] } });
    if (!driver) return sendError(res, 'Driver not found', 404);

    const updated = await prisma.driver.update({
      where: { id: req.params['id'] },
      data: { status: 'OFFLINE' }, // Approved but starts as OFFLINE
    });

    return sendSuccess(res, updated, 'Driver approved successfully');
  } catch (err) {
    console.error('[Admin] approve driver error:', err);
    return sendError(res, 'Failed to approve driver', 500);
  }
});

// ─── GET /orders ──────────────────────────────────────────────────────────────

router.get('/orders', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt((req.query['page'] as string) || '1', 10));
    const limit = Math.min(100, parseInt((req.query['limit'] as string) || '20', 10));
    const skip = (page - 1) * limit;
    const status = req.query['status'] as string | undefined;
    const storeId = req.query['storeId'] as string | undefined;

    const where = {
      ...(status ? { status: status as never } : {}),
      ...(storeId ? { storeId } : {}),
    };

    const [orders, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        include: {
          customer: { select: { name: true, phone: true } },
          store: { select: { name: true } },
          driver: { include: { user: { select: { name: true } } } },
          _count: { select: { items: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.count({ where }),
    ]);

    return sendSuccess(res, { orders, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[Admin] get orders error:', err);
    return sendError(res, 'Failed to fetch orders', 500);
  }
});

// ─── GET /orders/:id — full detail (customer, store, driver, items, ratings) ─

router.get('/orders/:id', async (req: Request, res: Response) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params['id'] },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        store: { select: { id: true, name: true, ownerId: true, lat: true, lng: true, street: true, city: true } },
        driver: { include: { user: { select: { id: true, name: true, phone: true } } } },
        items: true,
        deliveryAddress: true,
        rating: true,
      },
    });
    if (!order) return sendError(res, 'Order not found', 404);
    return sendSuccess(res, order);
  } catch (err) {
    console.error('[Admin] get order detail error:', err);
    return sendError(res, 'Failed to fetch order', 500);
  }
});

// ─── GET /orders/:id/eligible-stores ────────────────────────────────────────
// Returns active stores that carry at least one of the items in the order,
// ranked by match% then distance from delivery address. Includes owner
// contact details so the admin can call the store before reassigning.

router.get('/orders/:id/eligible-stores', async (req: Request, res: Response) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params['id'] },
      include: { items: true, deliveryAddress: { select: { lat: true, lng: true } } },
    });
    if (!order) return sendError(res, 'Order not found', 404);

    const orderStoreItems = await prisma.storeItem.findMany({
      where: { id: { in: order.items.map((i) => i.itemId).filter((id): id is string => !!id) } },
      select: { catalogItemId: true },
    });
    const orderCatalogIds = orderStoreItems.map((si) => si.catalogItemId);
    const totalItems = new Set(orderCatalogIds).size;
    if (totalItems === 0) return sendSuccess(res, []);

    const stores = await prisma.store.findMany({
      where: {
        status: 'ACTIVE',
        items: {
          some: {
            catalogItemId: { in: orderCatalogIds },
            isAvailable: true,
            stockQty: { gt: 0 },
          },
        },
      },
      include: {
        owner: { select: { id: true, name: true, phone: true } },
        items: {
          where: { catalogItemId: { in: orderCatalogIds }, isAvailable: true, stockQty: { gt: 0 } },
          select: { catalogItemId: true },
        },
      },
    });

    const { lat, lng } = order.deliveryAddress;
    const ranked = stores
      .map((s) => {
        const matchedItems = new Set(s.items.map((i) => i.catalogItemId)).size;
        return {
          id: s.id,
          name: s.name,
          isOpen: s.isOpen,
          rating: s.rating,
          openTime: s.openTime,
          closeTime: s.closeTime,
          street: s.street,
          city: s.city,
          owner: s.owner,
          distanceKm: Number(haversineDistance(lat, lng, s.lat, s.lng).toFixed(2)),
          matchedItems,
          totalItems,
          matchPercent: Math.round((matchedItems / totalItems) * 100),
        };
      })
      .sort((a, b) => b.matchPercent - a.matchPercent || a.distanceKm - b.distanceKm);

    return sendSuccess(res, ranked);
  } catch (err) {
    console.error('[Admin] eligible-stores error:', err);
    return sendError(res, 'Failed to fetch eligible stores', 500);
  }
});

// ─── GET /orders/:id/chats — all conversations on this order, read-only ─────
// Returns every Chat row for the order (could be 0–3: customer↔store,
// customer↔driver, store↔driver) with full message history and participant
// names. Used by admin for fraud / support investigation.

router.get('/orders/:id/chats', async (req: Request, res: Response) => {
  try {
    const orderId = req.params['id']!;
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { select: { id: true, name: true, phone: true, role: true } },
        store: {
          select: {
            ownerId: true,
            owner: { select: { id: true, name: true, phone: true, role: true } },
          },
        },
        driver: {
          select: { user: { select: { id: true, name: true, phone: true, role: true } } },
        },
      },
    });
    if (!order) return sendError(res, 'Order not found', 404);

    // Build a userId → display info map so each chat can label its participants
    type Participant = { id: string; name: string | null; phone: string; role: string };
    const participants = new Map<string, Participant>();
    if (order.customer) participants.set(order.customer.id, { ...order.customer });
    if (order.store?.owner) participants.set(order.store.owner.id, { ...order.store.owner });
    if (order.driver?.user) participants.set(order.driver.user.id, { ...order.driver.user });

    const chats = await prisma.chat.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });

    const enriched = chats.map((c) => ({
      id: c.id,
      userA: participants.get(c.userAId) ?? { id: c.userAId, name: null, phone: '', role: '?' },
      userB: participants.get(c.userBId) ?? { id: c.userBId, name: null, phone: '', role: '?' },
      closedAt: c.closedAt,
      deletedAt: c.deletedAt,
      createdAt: c.createdAt,
      messageCount: c.messages.length,
      messages: c.messages,
    }));

    return sendSuccess(res, enriched);
  } catch (err) {
    console.error('[Admin] order chats error:', err);
    return sendError(res, 'Failed to fetch chats', 500);
  }
});

// ─── GET /orders/:id/eligible-drivers ───────────────────────────────────────
// Returns active drivers ranked by distance from the assigned store (or
// delivery address if no store yet). Includes user contact details.

router.get('/orders/:id/eligible-drivers', async (req: Request, res: Response) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params['id'] },
      include: {
        store: { select: { lat: true, lng: true } },
        deliveryAddress: { select: { lat: true, lng: true } },
      },
    });
    if (!order) return sendError(res, 'Order not found', 404);

    const origin = order.store ?? order.deliveryAddress;
    const drivers = await prisma.driver.findMany({
      where: {
        status: 'ONLINE',
        currentLat: { not: null },
        currentLng: { not: null },
      },
      include: { user: { select: { id: true, name: true, phone: true } } },
    });

    const ranked = drivers
      .map((d) => ({
        id: d.id,
        vehicleType: d.vehicleType,
        vehicleNumber: d.vehicleNumber,
        rating: d.rating,
        totalRatings: d.totalRatings,
        currentLat: d.currentLat,
        currentLng: d.currentLng,
        user: d.user,
        distanceKm:
          d.currentLat != null && d.currentLng != null
            ? Number(haversineDistance(origin.lat, origin.lng, d.currentLat, d.currentLng).toFixed(2))
            : null,
      }))
      .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));

    return sendSuccess(res, ranked);
  } catch (err) {
    console.error('[Admin] eligible-drivers error:', err);
    return sendError(res, 'Failed to fetch eligible drivers', 500);
  }
});

// ─── PUT /orders/:id/assign-store — admin manually assigns/changes the store ─

router.put('/orders/:id/assign-store', async (req: Request, res: Response) => {
  try {
    const orderId = req.params['id']!;
    const storeId = req.body?.storeId as string | undefined;
    if (!storeId) return sendError(res, 'storeId required', 400);

    const [order, store] = await Promise.all([
      prisma.order.findUnique({ where: { id: orderId } }),
      prisma.store.findUnique({ where: { id: storeId } }),
    ]);
    if (!order) return sendError(res, 'Order not found', 404);
    if (!store) return sendError(res, 'Store not found', 404);
    if (['DELIVERED', 'CANCELLED'].includes(order.status)) {
      return sendError(res, `Cannot reassign a ${order.status} order`, 400);
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { storeId, status: 'STORE_ACCEPTED', storeAcceptedAt: new Date() },
      include: { store: { select: { name: true, ownerId: true } } },
    });

    await broadcastOrderStatus(orderId, 'STORE_ACCEPTED', { byAdmin: true });

    // Notify store owner via templated push (honors prefs)
    const orderForCount = await prisma.order.findUnique({
      where: { id: orderId },
      select: { totalAmount: true, items: { select: { quantity: true } } },
    });
    const itemCount = orderForCount?.items.reduce((sum, i) => sum + i.quantity, 0) ?? 0;
    await notify('STORE_NEW_ORDER', store.ownerId, {
      orderShort: orderId.slice(-6),
      itemCount,
      total: orderForCount?.totalAmount ?? 0,
      orderId,
    });
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'ORDER_ASSIGN_STORE',
        targetType: 'Order',
        targetId: orderId,
        before: { storeId: order.storeId, status: order.status },
        after: { storeId, status: updated.status },
        reason: req.body?.reason ?? null,
      },
    });
    return sendSuccess(res, updated, 'Store assigned');
  } catch (err) {
    console.error('[Admin] assign-store error:', err);
    return sendError(res, 'Failed to assign store', 500);
  }
});

// ─── PUT /orders/:id/assign-driver — admin manually assigns/changes the driver ─

router.put('/orders/:id/assign-driver', async (req: Request, res: Response) => {
  try {
    const orderId = req.params['id']!;
    const driverId = req.body?.driverId as string | undefined;
    if (!driverId) return sendError(res, 'driverId required', 400);

    const [order, driver] = await Promise.all([
      prisma.order.findUnique({ where: { id: orderId } }),
      prisma.driver.findUnique({ where: { id: driverId }, include: { user: true } }),
    ]);
    if (!order) return sendError(res, 'Order not found', 404);
    if (!driver) return sendError(res, 'Driver not found', 404);
    if (['DELIVERED', 'CANCELLED'].includes(order.status)) {
      return sendError(res, `Cannot reassign a ${order.status} order`, 400);
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { driverId, status: 'DRIVER_ASSIGNED', driverAssignedAt: new Date() },
    });

    await broadcastOrderStatus(orderId, 'DRIVER_ASSIGNED', { byAdmin: true, driverId });

    // Compute pickup distance for the driver template
    const orderForDistance = await prisma.order.findUnique({
      where: { id: orderId },
      include: { store: { select: { lat: true, lng: true } } },
    });
    const pickupDistance =
      orderForDistance?.store && driver.currentLat != null && driver.currentLng != null
        ? haversineDistance(
            orderForDistance.store.lat,
            orderForDistance.store.lng,
            driver.currentLat,
            driver.currentLng,
          ).toFixed(1)
        : '?';
    await notify('DRIVER_NEW_DELIVERY', driver.user.id, {
      orderShort: orderId.slice(-6),
      distanceKm: pickupDistance,
      earning: 50, // TODO: wire actual estimated earnings
      orderId,
    });
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'ORDER_ASSIGN_DRIVER',
        targetType: 'Order',
        targetId: orderId,
        before: { driverId: order.driverId, status: order.status },
        after: { driverId, status: updated.status },
        reason: req.body?.reason ?? null,
      },
    });
    return sendSuccess(res, updated, 'Driver assigned');
  } catch (err) {
    console.error('[Admin] assign-driver error:', err);
    return sendError(res, 'Failed to assign driver', 500);
  }
});

// ─── GET /analytics ───────────────────────────────────────────────────────────

// ─── GET /settings — global platform config ───────────────────────────────────
router.get('/settings', async (_req: Request, res: Response) => {
  try {
    // For now: settings are derived from env / defaults. A dedicated Settings
    // table can replace this when admin needs per-deployment overrides.
    return sendSuccess(res, {
      deliveryRadiusKm: 5,
      baseDeliveryFee: 30,
      perKmFee: 0,
      commissionRate: 0.10,
      storeAcceptTimeoutMinutes: 3,
      driverAcceptTimeoutSeconds: 60,
      matchingMode: process.env.STORE_MATCHING_MODE ?? 'BROADCAST',
      driverMatchingMode: process.env.DRIVER_MATCHING_MODE ?? 'BROADCAST',
    });
  } catch (err) {
    console.error('[Admin] settings error:', err);
    return sendError(res, 'Failed to fetch settings', 500);
  }
});

router.get('/analytics', async (_req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalOrdersToday,
      gmvResult,
      activeDrivers,
      activeStores,
      totalOrders,
      totalUsers,
    ] = await Promise.all([
      prisma.order.count({
        where: { createdAt: { gte: today }, status: { not: 'CANCELLED' } },
      }),
      prisma.order.aggregate({
        _sum: { total: true },
        where: { createdAt: { gte: today }, status: { not: 'CANCELLED' } },
      }),
      prisma.driver.count({ where: { status: 'ONLINE' } }),
      prisma.store.count({ where: { status: 'ACTIVE', isOpen: true } }),
      prisma.order.count(),
      prisma.user.count(),
    ]);

    return sendSuccess(res, {
      today: {
        orders: totalOrdersToday,
        gmv: gmvResult._sum.total ?? 0,
      },
      activeDrivers,
      activeStores,
      allTime: {
        orders: totalOrders,
        users: totalUsers,
      },
    });
  } catch (err) {
    console.error('[Admin] analytics error:', err);
    return sendError(res, 'Failed to fetch analytics', 500);
  }
});

// ─── Audit log ────────────────────────────────────────────────────────────────

router.get('/audit-logs', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt((req.query['page'] as string) || '1', 10));
    const limit = Math.min(100, parseInt((req.query['limit'] as string) || '50', 10));
    const skip = (page - 1) * limit;
    const action = req.query['action'] as string | undefined;
    const targetType = req.query['targetType'] as string | undefined;

    const where: Record<string, unknown> = {};
    if (action) where['action'] = action;
    if (targetType) where['targetType'] = targetType;

    const [logs, total] = await prisma.$transaction([
      prisma.auditLog.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.auditLog.count({ where }),
    ]);
    return sendSuccess(res, { logs, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[Admin] audit log error:', err);
    return sendError(res, 'Failed to fetch audit logs', 500);
  }
});

// ─── Disputes / Refunds ───────────────────────────────────────────────────────

router.put('/orders/:id/refund', async (req: Request, res: Response) => {
  try {
    const orderId = req.params['id']!;
    const reason = (req.body?.reason as string | undefined) ?? 'Refund issued by admin';
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return sendError(res, 'Order not found', 404);
    if (order.paymentStatus === 'REFUNDED') {
      return sendError(res, 'Order already refunded', 400);
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: 'REFUNDED',
        cancelReason: reason,
        ...(order.status !== 'DELIVERED' ? { status: 'CANCELLED' as const } : {}),
      },
    });

    await broadcastOrderStatus(orderId, updated.status, { paymentStatus: 'REFUNDED', reason });

    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'ORDER_REFUND',
        targetType: 'Order',
        targetId: orderId,
        before: { paymentStatus: order.paymentStatus, status: order.status },
        after: { paymentStatus: updated.paymentStatus, status: updated.status },
        reason,
      },
    });

    await prisma.notification.create({
      data: {
        userId: order.customerId,
        title: 'Refund issued',
        body: `Your refund for order #${orderId.slice(-6)} has been initiated.`,
      },
    });

    return sendSuccess(res, updated, 'Refund issued');
  } catch (err) {
    console.error('[Admin] refund error:', err);
    return sendError(res, 'Failed to issue refund', 500);
  }
});

// ─── Zones (delivery configuration) ───────────────────────────────────────────

router.get('/zones', async (req: Request, res: Response) => {
  try {
    const zones = await prisma.zone.findMany({ orderBy: { createdAt: 'desc' } });
    return sendSuccess(res, zones);
  } catch (err) {
    console.error('[Admin] zones list error:', err);
    return sendError(res, 'Failed to fetch zones', 500);
  }
});

router.post('/zones', async (req: Request, res: Response) => {
  try {
    const created = await prisma.zone.create({ data: req.body });
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'ZONE_CREATE',
        targetType: 'Zone',
        targetId: created.id,
        after: created as never,
      },
    });
    return sendSuccess(res, created, 'Zone created', 201);
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === 'P2002') return sendError(res, 'Zone name already exists', 409);
    console.error('[Admin] create zone error:', err);
    return sendError(res, 'Failed to create zone', 500);
  }
});

router.put('/zones/:id', async (req: Request, res: Response) => {
  try {
    const before = await prisma.zone.findUnique({ where: { id: req.params['id'] } });
    if (!before) return sendError(res, 'Zone not found', 404);
    const updated = await prisma.zone.update({ where: { id: req.params['id'] }, data: req.body });
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id, action: 'ZONE_UPDATE',
        targetType: 'Zone', targetId: updated.id,
        before: before as never, after: updated as never,
      },
    });
    return sendSuccess(res, updated, 'Zone updated');
  } catch (err) {
    console.error('[Admin] update zone error:', err);
    return sendError(res, 'Failed to update zone', 500);
  }
});

router.delete('/zones/:id', async (req: Request, res: Response) => {
  try {
    const before = await prisma.zone.findUnique({ where: { id: req.params['id'] } });
    if (!before) return sendError(res, 'Zone not found', 404);
    await prisma.zone.delete({ where: { id: req.params['id'] } });
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id, action: 'ZONE_DELETE',
        targetType: 'Zone', targetId: req.params['id'],
        before: before as never,
      },
    });
    return sendSuccess(res, null, 'Zone deleted');
  } catch (err) {
    console.error('[Admin] delete zone error:', err);
    return sendError(res, 'Failed to delete zone', 500);
  }
});

export default router;
