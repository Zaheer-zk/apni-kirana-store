import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { StoreCategory } from '@prisma/client';
import { prisma } from '../config/prisma';
import { config } from '../config/env';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { sendSuccess, sendError } from '../utils/response';
import { haversineDistance, getBoundingBox } from '../utils/geo';
import { AppError } from '../middleware/error.middleware';
import { sendNewStoreAwaitingApprovalEmail } from '../services/email.service';
import { sendWebPushToUser } from '../services/web-push.service';
import { filterStoresByCustomerZone, findZonesForPoint } from '../services/zone.service';

const router = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const registerStoreSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  category: z.nativeEnum(StoreCategory),
  lat: z.number(),
  lng: z.number(),
  street: z.string().min(2),
  city: z.string().min(2),
  state: z.string().min(2),
  pincode: z.string().regex(/^\d{6}$/),
  // Optional zone the store serves. When set, the matching engine uses
  // an indexed FK lookup instead of haversine — see
  // backend/src/services/zone.service.ts:filterStoresByCustomerZone.
  // Optional for back-compat with older clients that don't show the
  // picker; new registrations from store-portal / admin should always
  // include it.
  zoneId: z.string().cuid().optional(),
  openTime: z.string().regex(/^\d{2}:\d{2}$/),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/),
});

const updateStoreSchema = registerStoreSchema.partial();

// ─── POST /register ───────────────────────────────────────────────────────────

router.post(
  '/register',
  authenticate,
  authorize('STORE_OWNER'),
  validate(registerStoreSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;

      // Check if user already owns a store
      const existing = await prisma.store.findUnique({ where: { ownerId: userId } });
      if (existing) {
        return sendError(res, 'You already have a registered store', 409);
      }

      const store = await prisma.store.create({
        data: { ...req.body, ownerId: userId, status: 'PENDING_APPROVAL' },
      });

      // Notify every admin so they know there's a new store to review.
      // Best-effort — never fail the registration on a notification miss.
      notifyAdminsOfNewStore(store.id, userId).catch((err) =>
        console.warn('[Stores] admin notification failed:', err),
      );

      return sendSuccess(res, store, 'Store registered successfully. Awaiting approval.', 201);
    } catch (err) {
      console.error('[Stores] register error:', err);
      return sendError(res, 'Failed to register store', 500);
    }
  },
);

/**
 * Fans out a "new store pending approval" notification to every active admin:
 *   • Email — only admins with an email on file
 *   • Web push — every admin (no-ops if VAPID isn't configured)
 *
 * Fully best-effort; failures are logged but never bubble.
 */
async function notifyAdminsOfNewStore(storeId: string, ownerId: string): Promise<void> {
  const [store, owner, admins] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } }),
    prisma.user.findUnique({
      where: { id: ownerId },
      select: { name: true, phone: true },
    }),
    prisma.user.findMany({
      where: { role: 'ADMIN', isActive: true },
      select: { id: true, name: true, email: true },
    }),
  ]);
  if (!store) return;

  const adminsWithEmail = admins
    .filter((a): a is typeof a & { email: string } => !!a.email)
    .map((a) => ({ email: a.email, name: a.name }));

  await sendNewStoreAwaitingApprovalEmail({
    toAdmins: adminsWithEmail,
    storeName: store.name,
    storeId: store.id,
    ownerName: owner?.name ?? null,
    ownerPhone: owner?.phone ?? null,
    reviewLinkBase: config.webAppUrl,
  }).catch((err) => console.warn('[Stores] admin email failed:', err));

  await Promise.allSettled(
    admins.map((a) =>
      sendWebPushToUser(a.id, {
        title: 'New store awaiting approval',
        body: `${store.name} just registered.`,
        url: `${config.webAppUrl}/stores/${store.id}`,
      }),
    ),
  );
}

// ─── GET /nearby ──────────────────────────────────────────────────────────────

router.get('/nearby', async (req: Request, res: Response) => {
  try {
    const lat = parseFloat(req.query['lat'] as string);
    const lng = parseFloat(req.query['lng'] as string);
    const radius = parseFloat((req.query['radius'] as string) || '3');
    const category = req.query['category'] as StoreCategory | undefined;

    if (isNaN(lat) || isNaN(lng)) {
      return sendError(res, 'lat and lng query parameters are required', 400);
    }

    const box = getBoundingBox(lat, lng, radius);

    const stores = await prisma.store.findMany({
      where: {
        status: 'ACTIVE',
        isOpen: true,
        // Customer-side discovery excludes wholesalers — they're B2B only
        // and shouldn't surface to retail customers.
        isWholesaler: false,
        lat: { gte: box.minLat, lte: box.maxLat },
        lng: { gte: box.minLng, lte: box.maxLng },
        ...(category ? { category } : {}),
      },
      include: { _count: { select: { items: true } } },
    });

    // Exact distance + filter + sort
    const withDistance = stores
      .map((store) => ({
        ...store,
        distanceKm: haversineDistance(lat, lng, store.lat, store.lng),
      }))
      .filter((s) => s.distanceKm <= radius);

    // Zone-restrict: customer only sees stores that share a zone with their
    // location. If the customer is outside every active zone, we serve no
    // stores (the customer-mobile/web CoverageBanner already explains this
    // to the user). If no zones are configured platform-wide, we fall back
    // to the haversine-only list so early/dev deployments still work.
    const zoneFiltered = await filterStoresByCustomerZone(withDistance, lat, lng);
    const anyZonesConfigured = (await findZonesForPoint(lat, lng)).length > 0 ||
      // Probe one zone-anywhere-in-DB to decide if zones are configured at all
      (await prisma.zone.count({ where: { isActive: true } })) > 0;

    const results = (anyZonesConfigured ? zoneFiltered : withDistance).sort(
      (a, b) => a.distanceKm - b.distanceKm,
    );

    return sendSuccess(res, results);
  } catch (err) {
    console.error('[Stores] nearby error:', err);
    return sendError(res, 'Failed to fetch nearby stores', 500);
  }
});

// ─── GET /me — current store owner's store. MUST be defined before /:id
// otherwise Express treats "me" as an `:id` param value and the wrong
// handler matches first.
router.get(
  '/me',
  authenticate,
  authorize('STORE_OWNER'),
  async (req: Request, res: Response) => {
    try {
      const store = await prisma.store.findUnique({
        where: { ownerId: req.user!.id },
        include: { _count: { select: { items: true } } },
      });
      if (!store) return sendError(res, 'No store found for this owner', 404);
      return sendSuccess(res, store);
    } catch (err) {
      console.error('[Stores] me error:', err);
      return sendError(res, 'Failed to fetch store', 500);
    }
  },
);

// ─── GET /me/items — current store owner's inventory ───────────────────────
// Sugar over GET /:id/items that resolves the storeId from the JWT, so web
// apps don't need to fetch /stores/me first.
router.get(
  '/me/items',
  authenticate,
  authorize('STORE_OWNER'),
  async (req: Request, res: Response) => {
    try {
      const myStore = await prisma.store.findUnique({ where: { ownerId: req.user!.id } });
      if (!myStore) return sendError(res, 'No store found for this owner', 404);

      const { category, search } = req.query;
      const page = Math.max(1, parseInt((req.query['page'] as string) || '1', 10));
      const limit = Math.min(200, parseInt((req.query['limit'] as string) || '100', 10));
      const skip = (page - 1) * limit;

      const catalogWhere: Record<string, unknown> = {};
      if (category) catalogWhere['category'] = category;
      if (search) catalogWhere['name'] = { contains: search as string, mode: 'insensitive' };

      const where = {
        storeId: myStore.id,
        ...(Object.keys(catalogWhere).length ? { catalogItem: catalogWhere } : {}),
      };

      const [items, total] = await prisma.$transaction([
        prisma.storeItem.findMany({
          where,
          include: { catalogItem: true },
          skip,
          take: limit,
          orderBy: { catalogItem: { name: 'asc' } },
        }),
        prisma.storeItem.count({ where }),
      ]);

      const flat = items.map((si) => ({
        id: si.id,
        storeId: si.storeId,
        catalogItemId: si.catalogItemId,
        name: si.catalogItem.name,
        description: si.catalogItem.description,
        category: si.catalogItem.category,
        unit: si.catalogItem.defaultUnit,
        imageUrl: si.catalogItem.imageUrl,
        // `price` = store owner's payout (their input).
        // `adminMargin` = admin's commission per unit (read-only here).
        // `customerPrice` = price + adminMargin (what customer pays).
        price: si.price,
        adminMargin: si.adminMargin ?? 0,
        customerPrice: si.price + (si.adminMargin ?? 0),
        stockQty: si.stockQty,
        isAvailable: si.isAvailable,
      }));

      return sendSuccess(res, { items: flat, total, page, limit, pages: Math.ceil(total / limit) });
    } catch (err) {
      console.error('[Stores] me/items error:', err);
      return sendError(res, 'Failed to fetch your inventory', 500);
    }
  },
);

// ─── GET /stats/today — today's order + revenue snapshot for the dashboard ─
router.get(
  '/stats/today',
  authenticate,
  authorize('STORE_OWNER'),
  async (req: Request, res: Response) => {
    try {
      const myStore = await prisma.store.findUnique({ where: { ownerId: req.user!.id } });
      if (!myStore) return sendError(res, 'No store found for this owner', 404);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const ordersToday = await prisma.order.findMany({
        where: { storeId: myStore.id, createdAt: { gte: today } },
        select: { id: true, status: true, total: true, subtotal: true },
      });

      const ordersReceived = ordersToday.length;
      const ordersCompleted = ordersToday.filter((o) => o.status === 'DELIVERED').length;
      // Revenue = subtotal sum of completed orders (delivery fee goes to
      // driver). Falls back to total if subtotal is somehow null.
      const revenue = ordersToday
        .filter((o) => o.status === 'DELIVERED')
        .reduce((sum, o) => sum + (o.subtotal ?? o.total ?? 0), 0);
      const pending = ordersToday.filter((o) => o.status === 'PENDING').length;

      return sendSuccess(res, {
        ordersReceived,
        ordersCompleted,
        revenue: Math.round(revenue),
        pending,
      });
    } catch (err) {
      console.error('[Stores] stats/today error:', err);
      return sendError(res, 'Failed to fetch stats', 500);
    }
  },
);

// IMPORTANT: specific-path routes ('/orders', '/orders/active') MUST be
// declared BEFORE the parameterized '/:id' route — otherwise Express
// matches the path segment as :id and returns 404. (This bit us in prod:
// `/stores/orders?statuses=PENDING` was being matched as
// store-with-id="orders" → 404 instead of the orders list.)

// ─── GET /orders/active — store owner's active orders (used by dashboard) ───
router.get(
  '/orders/active',
  authenticate,
  authorize('STORE_OWNER'),
  async (req: Request, res: Response) => {
    try {
      const myStore = await prisma.store.findUnique({ where: { ownerId: req.user!.id } });
      if (!myStore) return sendError(res, 'No store found', 404);
      const orders = await prisma.order.findMany({
        where: {
          storeId: myStore.id,
          status: { in: ['PENDING', 'STORE_ACCEPTED', 'DRIVER_ASSIGNED', 'PICKED_UP'] },
        },
        include: { items: true, deliveryAddress: { select: { city: true, pincode: true, label: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return sendSuccess(res, orders);
    } catch (err) {
      console.error('[Stores] active orders error:', err);
      return sendError(res, 'Failed to fetch active orders', 500);
    }
  },
);

// ─── GET /orders — store owner's orders (filterable by ?statuses=A,B,C) ─────
router.get(
  '/orders',
  authenticate,
  authorize('STORE_OWNER'),
  async (req: Request, res: Response) => {
    try {
      const myStore = await prisma.store.findUnique({ where: { ownerId: req.user!.id } });
      if (!myStore) return sendError(res, 'No store found', 404);
      const statusesParam = req.query['statuses'] as string | undefined;
      const statuses = statusesParam ? statusesParam.split(',').map((s) => s.trim()) : undefined;
      const orders = await prisma.order.findMany({
        where: {
          storeId: myStore.id,
          ...(statuses ? { status: { in: statuses as never } } : {}),
        },
        include: { items: true, deliveryAddress: { select: { city: true, pincode: true, label: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return sendSuccess(res, orders);
    } catch (err) {
      console.error('[Stores] orders error:', err);
      return sendError(res, 'Failed to fetch orders', 500);
    }
  },
);

// ─── GET /:id ─────────────────────────────────────────────────────────────────
// Must come AFTER /orders, /orders/active, /me, /stats/today, /nearby etc.
// — Express matches in declaration order and `:id` is greedy.

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const store = await prisma.store.findUnique({
      where: { id: req.params['id'] },
      include: { _count: { select: { items: true } } },
    });
    if (!store) return sendError(res, 'Store not found', 404);
    return sendSuccess(res, store);
  } catch (err) {
    console.error('[Stores] get store error:', err);
    return sendError(res, 'Failed to fetch store', 500);
  }
});

// ─── GET /:id/items ───────────────────────────────────────────────────────────

router.get('/:id/items', async (req: Request, res: Response) => {
  try {
    const { category, search } = req.query;
    const page = Math.max(1, parseInt((req.query['page'] as string) || '1', 10));
    const limit = Math.min(100, parseInt((req.query['limit'] as string) || '50', 10));
    const skip = (page - 1) * limit;

    const catalogWhere: Record<string, unknown> = {};
    if (category) catalogWhere['category'] = category;
    if (search) catalogWhere['name'] = { contains: search as string, mode: 'insensitive' };

    const where = {
      storeId: req.params['id'],
      ...(Object.keys(catalogWhere).length ? { catalogItem: catalogWhere } : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.storeItem.findMany({
        where,
        include: { catalogItem: true },
        skip,
        take: limit,
        orderBy: { catalogItem: { name: 'asc' } },
      }),
      prisma.storeItem.count({ where }),
    ]);

    // Flatten so customers see { id, name, category, price, unit, ... }.
    // We expose adminMargin + customerPrice on every storeItem response so
    // customer surfaces can render the marked-up price and store-side
    // surfaces can render the breakdown without recomputing.
    const flat = items.map((si) => ({
      id: si.id,
      storeId: si.storeId,
      catalogItemId: si.catalogItemId,
      name: si.catalogItem.name,
      description: si.catalogItem.description,
      category: si.catalogItem.category,
      unit: si.catalogItem.defaultUnit,
      imageUrl: si.catalogItem.imageUrl,
      price: si.price,
      adminMargin: si.adminMargin ?? 0,
      customerPrice: si.price + (si.adminMargin ?? 0),
      stockQty: si.stockQty,
      isAvailable: si.isAvailable,
    }));

    return sendSuccess(res, { items: flat, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[Stores] get items error:', err);
    return sendError(res, 'Failed to fetch store items', 500);
  }
});

// ─── PUT /:id ─────────────────────────────────────────────────────────────────

router.put(
  '/:id',
  authenticate,
  authorize('STORE_OWNER', 'ADMIN'),
  validate(updateStoreSchema),
  async (req: Request, res: Response) => {
    try {
      const store = await prisma.store.findUnique({ where: { id: req.params['id'] } });
      if (!store) return sendError(res, 'Store not found', 404);

      // STORE_OWNER can only update their own store
      if (req.user!.role === 'STORE_OWNER' && store.ownerId !== req.user!.id) {
        return sendError(res, 'You can only update your own store', 403);
      }

      const updated = await prisma.store.update({
        where: { id: req.params['id'] },
        data: req.body,
      });

      return sendSuccess(res, updated, 'Store updated successfully');
    } catch (err) {
      console.error('[Stores] update error:', err);
      return sendError(res, 'Failed to update store', 500);
    }
  },
);

// ─── PUT /:id/toggle-open ─────────────────────────────────────────────────────

router.put(
  '/:id/toggle-open',
  authenticate,
  authorize('STORE_OWNER'),
  async (req: Request, res: Response) => {
    try {
      const store = await prisma.store.findUnique({ where: { id: req.params['id'] } });
      if (!store) return sendError(res, 'Store not found', 404);

      if (store.ownerId !== req.user!.id) {
        return sendError(res, 'You can only manage your own store', 403);
      }

      const updated = await prisma.store.update({
        where: { id: req.params['id'] },
        data: { isOpen: !store.isOpen },
      });

      return sendSuccess(
        res,
        { isOpen: updated.isOpen },
        `Store is now ${updated.isOpen ? 'open' : 'closed'}`,
      );
    } catch (err) {
      console.error('[Stores] toggle-open error:', err);
      return sendError(res, 'Failed to toggle store status', 500);
    }
  },
);

export default router;
