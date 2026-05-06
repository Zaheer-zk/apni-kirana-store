import { Router, Request, Response } from 'express';
import { z } from 'zod';
import Fuse from 'fuse.js';
import { prisma } from '../config/prisma';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { sendSuccess, sendError } from '../utils/response';
import { haversineDistance, getBoundingBox } from '../utils/geo';

const router = Router();

// Fuse.js options — typo-tolerant fuzzy search across name + description.
// threshold 0.4 ≈ moderate fuzziness. minMatchCharLength avoids matching everything on short queries.
const FUSE_OPTIONS: Fuse.IFuseOptions<{ id: string; name: string; description: string | null }> = {
  keys: [
    { name: 'name', weight: 0.7 },
    { name: 'description', weight: 0.3 },
  ],
  threshold: 0.4,
  ignoreLocation: true,
  minMatchCharLength: 2,
  includeScore: true,
};

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

// GET /api/v1/catalog/search/q?q=...
// Fuzzy search via Fuse.js — tolerant to typos and partial matches.
// Two-stage strategy:
//   1. SQL prefilter — narrow to candidates whose name OR description contains
//      any 3-char prefix of the query (cheap LIKE). Falls back to all-active for short queries.
//   2. Fuse.js ranking — fuzzy-score the prefilter set; return top 50 by score.
router.get('/search/q', async (req: Request, res: Response) => {
  try {
    const rawQ = ((req.query['q'] as string) || '').trim();
    if (!rawQ) return sendSuccess(res, []);

    // SQL prefilter: collect candidates that loosely match the query so Fuse doesn't
    // need to score the entire catalog. For short queries we just take all active items.
    let candidates: Array<{
      id: string;
      name: string;
      description: string | null;
      category: string;
      defaultUnit: string;
      imageUrl: string | null;
      _count: { storeItems: number };
    }>;

    if (rawQ.length <= 2) {
      candidates = await prisma.catalogItem.findMany({
        where: { isActive: true },
        include: { _count: { select: { storeItems: true } } },
        take: 200,
      });
    } else {
      // Build OR list with the first 3-char and the full query, both name and description.
      const prefix = rawQ.slice(0, 3);
      candidates = await prisma.catalogItem.findMany({
        where: {
          isActive: true,
          OR: [
            { name: { contains: prefix, mode: 'insensitive' } },
            { name: { contains: rawQ, mode: 'insensitive' } },
            { description: { contains: rawQ, mode: 'insensitive' } },
          ],
        },
        include: { _count: { select: { storeItems: true } } },
        take: 200,
      });
      // If prefilter found nothing (uncommon typos), broaden to full active set
      if (candidates.length === 0) {
        candidates = await prisma.catalogItem.findMany({
          where: { isActive: true },
          include: { _count: { select: { storeItems: true } } },
          take: 200,
        });
      }
    }

    const fuse = new Fuse(candidates, FUSE_OPTIONS);
    const ranked = fuse
      .search(rawQ)
      .slice(0, 50)
      .map((r) => ({ ...r.item, _matchScore: r.score ?? 1 }));

    return sendSuccess(res, ranked);
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

// ─── Bulk CSV import (admin) ─────────────────────────────────────────────────
// Body: { csv: string }
// Headers expected: name,description,category,defaultUnit,imageUrl,isActive
import { parseCsv } from '../utils/csv';

router.post(
  '/bulk-import',
  authenticate,
  authorize('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const csv = (req.body?.csv as string | undefined) ?? '';
      if (!csv.trim()) return sendError(res, 'csv field required', 400);

      const validCategories = ['GROCERY', 'MEDICINE', 'HOUSEHOLD', 'SNACKS', 'BEVERAGES', 'OTHER'];
      const { rows, errors } = parseCsv<{
        name: string; description?: string; category: string;
        defaultUnit: string; imageUrl?: string; isActive: boolean;
      }>(csv, (rec, line) => {
        if (!rec.name) throw new Error(`Line ${line}: name required`);
        if (!rec.category || !validCategories.includes(rec.category.toUpperCase())) {
          throw new Error(`Line ${line}: category must be one of ${validCategories.join('|')}`);
        }
        if (!rec.defaultUnit) throw new Error(`Line ${line}: defaultUnit required`);
        return {
          name: rec.name.trim(),
          description: rec.description?.trim() || undefined,
          category: rec.category.toUpperCase(),
          defaultUnit: rec.defaultUnit.trim(),
          imageUrl: rec.imageUrl?.trim() || undefined,
          isActive: rec.isActive ? rec.isActive.toLowerCase() !== 'false' : true,
        };
      });

      let created = 0;
      let updated = 0;
      const failures: Array<{ name: string; error: string }> = [];

      for (const r of rows) {
        try {
          await prisma.catalogItem.upsert({
            where: { name: r.name },
            create: { ...r, category: r.category as never },
            update: {
              description: r.description ?? null,
              category: r.category as never,
              defaultUnit: r.defaultUnit,
              imageUrl: r.imageUrl ?? null,
              isActive: r.isActive,
            },
          });
          // Crude: we don't know if it was insert or update; count as created by default
          created++;
        } catch (err) {
          failures.push({ name: r.name, error: (err as Error).message });
        }
      }

      return sendSuccess(res, {
        processed: rows.length,
        created: created - updated,
        updated,
        parseErrors: errors,
        upsertFailures: failures,
      }, `${created} items imported`);
    } catch (err) {
      console.error('[Catalog] bulk-import error:', err);
      return sendError(res, 'Failed to import catalog', 500);
    }
  },
);

export default router;
