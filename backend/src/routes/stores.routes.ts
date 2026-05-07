import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { StoreCategory } from '@prisma/client';
import { prisma } from '../config/prisma';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { sendSuccess, sendError } from '../utils/response';
import { haversineDistance, getBoundingBox } from '../utils/geo';
import { AppError } from '../middleware/error.middleware';

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
  openTime: z.string().regex(/^\d{2}:\d{2}$/),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/),
});

const updateStoreSchema = registerStoreSchema.partial();

// ─── POST /register ───────────────────────────────────────────────────────────

router.post(
  '/register',
  authenticate,
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

      // Promote user role to STORE_OWNER
      await prisma.user.update({
        where: { id: userId },
        data: { role: 'STORE_OWNER' },
      });

      return sendSuccess(res, store, 'Store registered successfully. Awaiting approval.', 201);
    } catch (err) {
      console.error('[Stores] register error:', err);
      return sendError(res, 'Failed to register store', 500);
    }
  },
);

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
        lat: { gte: box.minLat, lte: box.maxLat },
        lng: { gte: box.minLng, lte: box.maxLng },
        ...(category ? { category } : {}),
      },
      include: { _count: { select: { items: true } } },
    });

    // Exact distance + filter + sort
    const results = stores
      .map((store) => ({
        ...store,
        distanceKm: haversineDistance(lat, lng, store.lat, store.lng),
      }))
      .filter((s) => s.distanceKm <= radius)
      .sort((a, b) => a.distanceKm - b.distanceKm);

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

// ─── GET /:id ─────────────────────────────────────────────────────────────────

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

    // Flatten so customers see { id, name, category, price, unit, ... }
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
