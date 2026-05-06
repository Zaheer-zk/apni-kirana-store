import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { sendSuccess, sendError } from '../utils/response';
import { haversineDistance, getBoundingBox } from '../utils/geo';

const router = Router();

// ─── Public catalog browse ────────────────────────────────────────────────────

// GET /api/v1/catalog?category=&q=&page=&limit=
router.get('/', async (req: Request, res: Response) => {
  try {
    const category = req.query['category'] as string | undefined;
    const q = req.query['q'] as string | undefined;
    const page = Math.max(1, parseInt((req.query['page'] as string) || '1', 10));
    const limit = Math.min(200, parseInt((req.query['limit'] as string) || '50', 10));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { isActive: true };
    if (category) where['category'] = category;
    if (q) where['name'] = { contains: q, mode: 'insensitive' };

    const [items, total] = await prisma.$transaction([
      prisma.catalogItem.findMany({
        where,
        include: { _count: { select: { storeItems: true } } },
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      prisma.catalogItem.count({ where }),
    ]);

    return sendSuccess(res, { items, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[Catalog] list error:', err);
    return sendError(res, 'Failed to fetch catalog', 500);
  }
});

// GET /api/v1/catalog/:id — single catalog item with stores carrying it (sorted by distance)
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const lat = parseFloat((req.query['lat'] as string) || '');
    const lng = parseFloat((req.query['lng'] as string) || '');
    const radiusKm = parseFloat((req.query['radius'] as string) || '5');

    const item = await prisma.catalogItem.findUnique({ where: { id } });
    if (!item) return sendError(res, 'Catalog item not found', 404);

    let stores: Array<{
      id: string; name: string; lat: number; lng: number; rating: number; isOpen: boolean;
      storeItem: { id: string; price: number; stockQty: number; isAvailable: boolean };
      distanceKm?: number;
    }> = [];

    if (!isNaN(lat) && !isNaN(lng)) {
      // Find stores within radius that carry this item
      const bb = getBoundingBox(lat, lng, radiusKm);
      const candidates = await prisma.store.findMany({
        where: {
          status: 'ACTIVE',
          lat: { gte: bb.minLat, lte: bb.maxLat },
          lng: { gte: bb.minLng, lte: bb.maxLng },
          items: { some: { catalogItemId: id, isAvailable: true, stockQty: { gt: 0 } } },
        },
        include: { items: { where: { catalogItemId: id }, take: 1 } },
      });
      stores = candidates
        .map((s) => ({
          id: s.id, name: s.name, lat: s.lat, lng: s.lng, rating: s.rating, isOpen: s.isOpen,
          storeItem: {
            id: s.items[0]!.id, price: s.items[0]!.price,
            stockQty: s.items[0]!.stockQty, isAvailable: s.items[0]!.isAvailable,
          },
          distanceKm: haversineDistance(lat, lng, s.lat, s.lng),
        }))
        .filter((s) => s.distanceKm! <= radiusKm)
        .sort((a, b) => a.distanceKm! - b.distanceKm!);
    } else {
      // No location — just list all stores carrying it
      const candidates = await prisma.store.findMany({
        where: {
          status: 'ACTIVE',
          items: { some: { catalogItemId: id, isAvailable: true } },
        },
        include: { items: { where: { catalogItemId: id }, take: 1 } },
      });
      stores = candidates.map((s) => ({
        id: s.id, name: s.name, lat: s.lat, lng: s.lng, rating: s.rating, isOpen: s.isOpen,
        storeItem: {
          id: s.items[0]!.id, price: s.items[0]!.price,
          stockQty: s.items[0]!.stockQty, isAvailable: s.items[0]!.isAvailable,
        },
      }));
    }

    return sendSuccess(res, { item, stores });
  } catch (err) {
    console.error('[Catalog] get error:', err);
    return sendError(res, 'Failed to fetch catalog item', 500);
  }
});

// GET /api/v1/catalog/search?q=...&lat=&lng= — full-text search across catalog with availability
router.get('/search/q', async (req: Request, res: Response) => {
  try {
    const q = (req.query['q'] as string) || '';
    if (!q.trim()) return sendSuccess(res, []);
    const items = await prisma.catalogItem.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      },
      include: { _count: { select: { storeItems: true } } },
      take: 50,
      orderBy: { name: 'asc' },
    });
    return sendSuccess(res, items);
  } catch (err) {
    console.error('[Catalog] search error:', err);
    return sendError(res, 'Failed to search catalog', 500);
  }
});

// ─── Admin-only CRUD ──────────────────────────────────────────────────────────

const catalogSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  category: z.enum(['GROCERY', 'MEDICINE', 'HOUSEHOLD', 'SNACKS', 'BEVERAGES', 'OTHER']),
  defaultUnit: z.string().min(1).max(40),
  imageUrl: z.string().url().optional(),
  isActive: z.boolean().optional(),
});

router.post(
  '/',
  authenticate,
  authorize('ADMIN'),
  validate(catalogSchema),
  async (req: Request, res: Response) => {
    try {
      const created = await prisma.catalogItem.create({ data: req.body });
      return sendSuccess(res, created, 'Catalog item created', 201);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === 'P2002') return sendError(res, 'An item with this name already exists', 409);
      console.error('[Catalog] create error:', err);
      return sendError(res, 'Failed to create catalog item', 500);
    }
  },
);

router.put(
  '/:id',
  authenticate,
  authorize('ADMIN'),
  validate(catalogSchema.partial()),
  async (req: Request, res: Response) => {
    try {
      const updated = await prisma.catalogItem.update({
        where: { id: req.params['id'] },
        data: req.body,
      });
      return sendSuccess(res, updated, 'Catalog item updated');
    } catch (err) {
      console.error('[Catalog] update error:', err);
      return sendError(res, 'Failed to update', 500);
    }
  },
);

router.delete(
  '/:id',
  authenticate,
  authorize('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      await prisma.catalogItem.delete({ where: { id: req.params['id'] } });
      return sendSuccess(res, null, 'Catalog item deleted');
    } catch (err) {
      console.error('[Catalog] delete error:', err);
      return sendError(res, 'Failed to delete', 500);
    }
  },
);

export default router;
