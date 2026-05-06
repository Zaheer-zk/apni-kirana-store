import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ItemCategory } from '@prisma/client';
import { prisma } from '../config/prisma';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { sendSuccess, sendError } from '../utils/response';

const router = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createItemSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  category: z.nativeEnum(ItemCategory),
  price: z.number().positive(),
  unit: z.string().min(1).max(50),
  stockQty: z.number().int().min(0).default(0),
  imageUrl: z.string().url().optional(),
});

const updateItemSchema = createItemSchema.partial();

const updateStockSchema = z.object({
  stockQty: z.number().int().min(0),
});

// ─── Helper: verify store ownership ──────────────────────────────────────────

async function getOwnerStore(userId: string) {
  return prisma.store.findUnique({ where: { ownerId: userId } });
}

async function getItemWithStore(itemId: string) {
  return prisma.item.findUnique({
    where: { id: itemId },
    include: { store: { select: { ownerId: true } } },
  });
}

// ─── GET /search ──────────────────────────────────────────────────────────────

router.get('/search', async (req: Request, res: Response) => {
  try {
    const q = req.query['q'] as string | undefined;
    if (!q || q.trim().length === 0) {
      return sendError(res, 'Query parameter "q" is required', 400);
    }

    const category = req.query['category'] as ItemCategory | undefined;

    const items = await prisma.item.findMany({
      where: {
        name: { contains: q.trim(), mode: 'insensitive' },
        isAvailable: true,
        stockQty: { gt: 0 },
        store: { status: 'ACTIVE', isOpen: true },
        ...(category ? { category } : {}),
      },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            lat: true,
            lng: true,
            rating: true,
            category: true,
          },
        },
      },
      take: 50,
      orderBy: { name: 'asc' },
    });

    return sendSuccess(res, items);
  } catch (err) {
    console.error('[Items] search error:', err);
    return sendError(res, 'Failed to search items', 500);
  }
});

// ─── POST / ───────────────────────────────────────────────────────────────────

router.post(
  '/',
  authenticate,
  authorize('STORE_OWNER'),
  validate(createItemSchema),
  async (req: Request, res: Response) => {
    try {
      const store = await getOwnerStore(req.user!.id);
      if (!store) return sendError(res, 'You do not have a registered store', 404);

      const item = await prisma.item.create({
        data: { ...req.body, storeId: store.id },
      });

      return sendSuccess(res, item, 'Item created successfully', 201);
    } catch (err) {
      console.error('[Items] create error:', err);
      return sendError(res, 'Failed to create item', 500);
    }
  },
);

// ─── PUT /:id ─────────────────────────────────────────────────────────────────

router.put(
  '/:id',
  authenticate,
  authorize('STORE_OWNER'),
  validate(updateItemSchema),
  async (req: Request, res: Response) => {
    try {
      const item = await getItemWithStore(req.params['id']!);
      if (!item) return sendError(res, 'Item not found', 404);

      if (item.store.ownerId !== req.user!.id) {
        return sendError(res, 'You can only update items in your own store', 403);
      }

      const updated = await prisma.item.update({
        where: { id: req.params['id'] },
        data: req.body,
      });

      return sendSuccess(res, updated, 'Item updated successfully');
    } catch (err) {
      console.error('[Items] update error:', err);
      return sendError(res, 'Failed to update item', 500);
    }
  },
);

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

router.delete(
  '/:id',
  authenticate,
  authorize('STORE_OWNER'),
  async (req: Request, res: Response) => {
    try {
      const item = await getItemWithStore(req.params['id']!);
      if (!item) return sendError(res, 'Item not found', 404);

      if (item.store.ownerId !== req.user!.id) {
        return sendError(res, 'You can only delete items in your own store', 403);
      }

      await prisma.item.delete({ where: { id: req.params['id'] } });

      return sendSuccess(res, null, 'Item deleted successfully');
    } catch (err) {
      console.error('[Items] delete error:', err);
      return sendError(res, 'Failed to delete item', 500);
    }
  },
);

// ─── PUT /:id/toggle-availability ────────────────────────────────────────────

router.put(
  '/:id/toggle-availability',
  authenticate,
  authorize('STORE_OWNER'),
  async (req: Request, res: Response) => {
    try {
      const item = await getItemWithStore(req.params['id']!);
      if (!item) return sendError(res, 'Item not found', 404);

      if (item.store.ownerId !== req.user!.id) {
        return sendError(res, 'You can only manage items in your own store', 403);
      }

      const updated = await prisma.item.update({
        where: { id: req.params['id'] },
        data: { isAvailable: !item.isAvailable },
      });

      return sendSuccess(
        res,
        { isAvailable: updated.isAvailable },
        `Item is now ${updated.isAvailable ? 'available' : 'unavailable'}`,
      );
    } catch (err) {
      console.error('[Items] toggle-availability error:', err);
      return sendError(res, 'Failed to toggle item availability', 500);
    }
  },
);

// ─── PUT /:id/stock ───────────────────────────────────────────────────────────

router.put(
  '/:id/stock',
  authenticate,
  authorize('STORE_OWNER'),
  validate(updateStockSchema),
  async (req: Request, res: Response) => {
    try {
      const item = await getItemWithStore(req.params['id']!);
      if (!item) return sendError(res, 'Item not found', 404);

      if (item.store.ownerId !== req.user!.id) {
        return sendError(res, 'You can only manage items in your own store', 403);
      }

      const { stockQty } = req.body as { stockQty: number };

      const updated = await prisma.item.update({
        where: { id: req.params['id'] },
        data: { stockQty },
      });

      return sendSuccess(res, { stockQty: updated.stockQty }, 'Stock updated successfully');
    } catch (err) {
      console.error('[Items] update-stock error:', err);
      return sendError(res, 'Failed to update stock', 500);
    }
  },
);

export default router;
