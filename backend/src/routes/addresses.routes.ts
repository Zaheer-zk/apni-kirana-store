import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { sendSuccess, sendError } from '../utils/response';

const router = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createAddressSchema = z.object({
  label: z.string().min(1).max(50),
  street: z.string().min(1).max(200),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  pincode: z.string().regex(/^\d{6}$/),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  isDefault: z.boolean().optional(),
});

const updateAddressSchema = createAddressSchema.partial();

// ─── GET / ────────────────────────────────────────────────────────────────────

router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const addresses = await prisma.address.findMany({
      where: { userId: req.user!.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return sendSuccess(res, addresses);
  } catch (err) {
    console.error('[Addresses] list error:', err);
    return sendError(res, 'Failed to fetch addresses', 500);
  }
});

// ─── POST / ───────────────────────────────────────────────────────────────────

router.post(
  '/',
  authenticate,
  validate(createAddressSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const data = req.body as z.infer<typeof createAddressSchema>;

      // If user has no addresses yet, force isDefault=true
      const existingCount = await prisma.address.count({ where: { userId } });
      const shouldBeDefault = data.isDefault === true || existingCount === 0;

      const address = await prisma.$transaction(async (tx) => {
        if (shouldBeDefault) {
          await tx.address.updateMany({
            where: { userId, isDefault: true },
            data: { isDefault: false },
          });
        }
        return tx.address.create({
          data: {
            userId,
            label: data.label,
            street: data.street,
            city: data.city,
            state: data.state,
            pincode: data.pincode,
            lat: data.lat,
            lng: data.lng,
            isDefault: shouldBeDefault,
          },
        });
      });

      return sendSuccess(res, address, 'Address created', 201);
    } catch (err) {
      console.error('[Addresses] create error:', err);
      return sendError(res, 'Failed to create address', 500);
    }
  },
);

// ─── PUT /:id ─────────────────────────────────────────────────────────────────

router.put(
  '/:id',
  authenticate,
  validate(updateAddressSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const id = req.params['id']!;
      const data = req.body as z.infer<typeof updateAddressSchema>;

      const existing = await prisma.address.findUnique({ where: { id } });
      if (!existing) return sendError(res, 'Address not found', 404);
      if (existing.userId !== userId) {
        return sendError(res, 'You can only update your own addresses', 403);
      }

      const updated = await prisma.$transaction(async (tx) => {
        if (data.isDefault === true) {
          await tx.address.updateMany({
            where: { userId, isDefault: true, NOT: { id } },
            data: { isDefault: false },
          });
        }
        return tx.address.update({
          where: { id },
          data,
        });
      });

      return sendSuccess(res, updated, 'Address updated');
    } catch (err) {
      console.error('[Addresses] update error:', err);
      return sendError(res, 'Failed to update address', 500);
    }
  },
);

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const id = req.params['id']!;

    const existing = await prisma.address.findUnique({ where: { id } });
    if (!existing) return sendError(res, 'Address not found', 404);
    if (existing.userId !== userId) {
      return sendError(res, 'You can only delete your own addresses', 403);
    }

    await prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id } });
      // If we deleted the default and other addresses remain, promote the most recent
      if (existing.isDefault) {
        const next = await tx.address.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        });
        if (next) {
          await tx.address.update({
            where: { id: next.id },
            data: { isDefault: true },
          });
        }
      }
    });

    return sendSuccess(res, null, 'Address deleted');
  } catch (err) {
    console.error('[Addresses] delete error:', err);
    return sendError(res, 'Failed to delete address', 500);
  }
});

// ─── PUT /:id/default ─────────────────────────────────────────────────────────

router.put('/:id/default', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const id = req.params['id']!;

    const existing = await prisma.address.findUnique({ where: { id } });
    if (!existing) return sendError(res, 'Address not found', 404);
    if (existing.userId !== userId) {
      return sendError(res, 'You can only manage your own addresses', 403);
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.address.updateMany({
        where: { userId, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
      return tx.address.update({
        where: { id },
        data: { isDefault: true },
      });
    });

    return sendSuccess(res, updated, 'Default address updated');
  } catch (err) {
    console.error('[Addresses] set default error:', err);
    return sendError(res, 'Failed to set default address', 500);
  }
});

export default router;
