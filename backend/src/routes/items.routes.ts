// Store-items: store owners select catalog items into their inventory and set price/stock.
// Catalog item CRUD lives in catalog.routes.ts (admin-only).
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import Fuse from 'fuse.js';
import { prisma } from '../config/prisma';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { sendSuccess, sendError } from '../utils/response';

const router = Router();

// ─── Public search: returns store-items (price/stock) joined to catalog ───────

// Fuzzy search across in-stock items at active stores. Uses Fuse.js to be typo-tolerant.
router.get('/search', async (req: Request, res: Response) => {
  try {
    const q = ((req.query['q'] as string) || '').trim();
    const category = req.query['category'] as string | undefined;

    // Stage 1: SQL prefilter — narrow to candidates loosely matching the query/category.
    const baseWhere: Record<string, unknown> = {
      isAvailable: true,
      stockQty: { gt: 0 },
      store: { status: 'ACTIVE' },
    };
    if (category) baseWhere['catalogItem'] = { category, isActive: true };

    let candidates = await prisma.storeItem.findMany({
      where: baseWhere,
      include: {
        catalogItem: true,
        store: { select: { id: true, name: true, lat: true, lng: true, isOpen: true } },
      },
      take: 500,
    });

    // Stage 2: Fuse fuzzy ranking when a query is provided.
    if (q) {
      const fuse = new Fuse(candidates, {
        keys: [
          { name: 'catalogItem.name', weight: 0.7 },
          { name: 'catalogItem.description', weight: 0.3 },
        ],
        threshold: 0.4,
        ignoreLocation: true,
        minMatchCharLength: 2,
        includeScore: true,
      });
      candidates = fuse
        .search(q)
        .slice(0, 100)
        .map((r) => r.item);
    } else {
      // No query: alphabetical, capped
      candidates = candidates
        .slice(0, 100)
        .sort((a, b) => a.catalogItem.name.localeCompare(b.catalogItem.name));
    }

    return sendSuccess(res, candidates);
  } catch (err) {
    console.error('[Items] search error:', err);
    return sendError(res, 'Failed to search items', 500);
  }
});

// ─── Store owner: manage their own inventory selections ──────────────────────

const addItemSchema = z.object({
  catalogItemId: z.string().min(1),
  price: z.number().positive(),
  stockQty: z.number().int().min(0),
  isAvailable: z.boolean().optional(),
});

router.post(
  '/',
  authenticate,
  authorize('STORE_OWNER'),
  validate(addItemSchema),
  async (req: Request, res: Response) => {
    try {
      const myStore = await prisma.store.findUnique({ where: { ownerId: req.user!.id } });
      if (!myStore) return sendError(res, 'No store found for this owner', 404);

      const catalogItem = await prisma.catalogItem.findUnique({
        where: { id: req.body.catalogItemId },
      });
      if (!catalogItem) return sendError(res, 'Catalog item not found', 404);

      const created = await prisma.storeItem.create({
        data: {
          storeId: myStore.id,
          catalogItemId: req.body.catalogItemId,
          price: req.body.price,
          stockQty: req.body.stockQty,
          isAvailable: req.body.isAvailable ?? true,
        },
        include: { catalogItem: true },
      });
      return sendSuccess(res, created, 'Item added to your store', 201);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === 'P2002') return sendError(res, 'Your store already carries this item', 409);
      console.error('[Items] create error:', err);
      return sendError(res, 'Failed to add item', 500);
    }
  },
);

router.put(
  '/:id',
  authenticate,
  authorize('STORE_OWNER'),
  validate(addItemSchema.partial().omit({ catalogItemId: true })),
  async (req: Request, res: Response) => {
    try {
      const item = await prisma.storeItem.findUnique({
        where: { id: req.params['id'] }, include: { store: true },
      });
      if (!item) return sendError(res, 'Item not found', 404);
      if (item.store.ownerId !== req.user!.id) return sendError(res, 'Not your item', 403);
      const updated = await prisma.storeItem.update({
        where: { id: req.params['id'] }, data: req.body, include: { catalogItem: true },
      });
      return sendSuccess(res, updated, 'Item updated');
    } catch (err) {
      console.error('[Items] update error:', err);
      return sendError(res, 'Failed to update item', 500);
    }
  },
);

router.delete(
  '/:id',
  authenticate,
  authorize('STORE_OWNER'),
  async (req: Request, res: Response) => {
    try {
      const item = await prisma.storeItem.findUnique({
        where: { id: req.params['id'] }, include: { store: true },
      });
      if (!item) return sendError(res, 'Item not found', 404);
      if (item.store.ownerId !== req.user!.id) return sendError(res, 'Not your item', 403);
      await prisma.storeItem.delete({ where: { id: req.params['id'] } });
      return sendSuccess(res, null, 'Item removed from your store');
    } catch (err) {
      console.error('[Items] delete error:', err);
      return sendError(res, 'Failed to delete item', 500);
    }
  },
);

router.put(
  '/:id/toggle-availability',
  authenticate,
  authorize('STORE_OWNER'),
  async (req: Request, res: Response) => {
    try {
      const item = await prisma.storeItem.findUnique({
        where: { id: req.params['id'] }, include: { store: true },
      });
      if (!item) return sendError(res, 'Item not found', 404);
      if (item.store.ownerId !== req.user!.id) return sendError(res, 'Not your item', 403);
      const updated = await prisma.storeItem.update({
        where: { id: req.params['id'] }, data: { isAvailable: !item.isAvailable },
      });
      return sendSuccess(res, updated, `Item ${updated.isAvailable ? 'enabled' : 'disabled'}`);
    } catch (err) {
      console.error('[Items] toggle error:', err);
      return sendError(res, 'Failed to toggle availability', 500);
    }
  },
);

const stockSchema = z.object({ stockQty: z.number().int().min(0) });
router.put(
  '/:id/stock',
  authenticate,
  authorize('STORE_OWNER'),
  validate(stockSchema),
  async (req: Request, res: Response) => {
    try {
      const item = await prisma.storeItem.findUnique({
        where: { id: req.params['id'] }, include: { store: true },
      });
      if (!item) return sendError(res, 'Item not found', 404);
      if (item.store.ownerId !== req.user!.id) return sendError(res, 'Not your item', 403);
      const updated = await prisma.storeItem.update({
        where: { id: req.params['id'] }, data: { stockQty: req.body.stockQty },
      });
      return sendSuccess(res, updated, 'Stock updated');
    } catch (err) {
      console.error('[Items] stock error:', err);
      return sendError(res, 'Failed to update stock', 500);
    }
  },
);

// ─── Bulk CSV import (store owner) ───────────────────────────────────────────
// Body: { csv: string }
// Headers expected: catalogName,price,stockQty,isAvailable
// catalogName must match an existing CatalogItem.name (admin-managed master).
import { parseCsv } from '../utils/csv';

router.post(
  '/bulk-import',
  authenticate,
  authorize('STORE_OWNER'),
  async (req: Request, res: Response) => {
    try {
      const myStore = await prisma.store.findUnique({ where: { ownerId: req.user!.id } });
      if (!myStore) return sendError(res, 'No store found for this owner', 404);

      const csv = (req.body?.csv as string | undefined) ?? '';
      if (!csv.trim()) return sendError(res, 'csv field required', 400);

      const { rows, errors } = parseCsv<{ catalogName: string; price: number; stockQty: number; isAvailable: boolean }>(
        csv,
        (rec, line) => {
          if (!rec.catalogName) throw new Error(`Line ${line}: catalogName required`);
          const price = parseFloat(rec.price);
          if (!isFinite(price) || price <= 0) throw new Error(`Line ${line}: price must be > 0`);
          const stockQty = parseInt(rec.stockQty, 10);
          if (!isFinite(stockQty) || stockQty < 0) throw new Error(`Line ${line}: stockQty must be >= 0`);
          return {
            catalogName: rec.catalogName.trim(),
            price,
            stockQty,
            isAvailable: rec.isAvailable ? rec.isAvailable.toLowerCase() !== 'false' : true,
          };
        },
      );

      // Resolve catalog names → ids in one query
      const catalogItems = await prisma.catalogItem.findMany({
        where: { name: { in: rows.map((r) => r.catalogName) } },
        select: { id: true, name: true },
      });
      const catalogByName = new Map(catalogItems.map((c) => [c.name, c.id]));

      let upserted = 0;
      const failures: Array<{ row: string; error: string }> = [];

      for (const r of rows) {
        const catalogItemId = catalogByName.get(r.catalogName);
        if (!catalogItemId) {
          failures.push({ row: r.catalogName, error: 'Catalog item not found in master list' });
          continue;
        }
        try {
          await prisma.storeItem.upsert({
            where: { storeId_catalogItemId: { storeId: myStore.id, catalogItemId } },
            create: {
              storeId: myStore.id, catalogItemId,
              price: r.price, stockQty: r.stockQty, isAvailable: r.isAvailable,
            },
            update: {
              price: r.price, stockQty: r.stockQty, isAvailable: r.isAvailable,
            },
          });
          upserted++;
        } catch (err) {
          failures.push({ row: r.catalogName, error: (err as Error).message });
        }
      }

      return sendSuccess(
        res,
        { processed: rows.length, upserted, parseErrors: errors, upsertFailures: failures },
        `${upserted} inventory rows imported`,
      );
    } catch (err) {
      console.error('[Items] bulk-import error:', err);
      return sendError(res, 'Failed to import inventory', 500);
    }
  },
);

export default router;
