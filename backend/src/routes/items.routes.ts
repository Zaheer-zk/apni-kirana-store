// Store-items: store owners select catalog items into their inventory and set price/stock.
// Catalog item CRUD lives in catalog.routes.ts (admin-only).
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { sendSuccess, sendError } from '../utils/response';

const router = Router();

// ─── Public search: returns store-items (price/stock) joined to catalog ───────

router.get('/search', async (req: Request, res: Response) => {
  try {
    const q = (req.query['q'] as string) || '';
    const category = req.query['category'] as string | undefined;

    const where: Record<string, unknown> = {
      isAvailable: true,
      stockQty: { gt: 0 },
      store: { status: 'ACTIVE' },
    };
    if (q || category) {
      const catalogWhere: Record<string, unknown> = { isActive: true };
      if (q) catalogWhere['name'] = { contains: q, mode: 'insensitive' };
      if (category) catalogWhere['category'] = category;
      where['catalogItem'] = catalogWhere;
    }

    const items = await prisma.storeItem.findMany({
      where,
      include: {
        catalogItem: true,
        store: { select: { id: true, name: true, lat: true, lng: true, isOpen: true } },
      },
      take: 100,
      orderBy: { catalogItem: { name: 'asc' } },
    });

    return sendSuccess(res, items);
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

export default router;
