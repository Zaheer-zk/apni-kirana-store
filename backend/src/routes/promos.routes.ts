// Promo codes — admin creates them, customers redeem at checkout.
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { sendSuccess, sendError } from '../utils/response';

const router = Router();

const promoSchema = z.object({
  code: z.string().min(2).max(40).transform((s) => s.toUpperCase().trim()),
  description: z.string().max(200).optional(),
  discountType: z.enum(['FLAT', 'PERCENT']),
  discountValue: z.number().positive(),
  maxDiscount: z.number().positive().optional(),
  minOrderValue: z.number().min(0).optional(),
  usageLimit: z.number().int().positive().optional(),
  perUserLimit: z.number().int().positive().optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
});

// ─── Customer: validate a code (returns the discount that would apply) ───────

router.post('/validate', authenticate, async (req: Request, res: Response) => {
  try {
    const code = String(req.body?.code ?? '').trim().toUpperCase();
    const subtotal = Number(req.body?.subtotal ?? 0);
    if (!code) return sendError(res, 'Code required', 400);

    const promo = await prisma.promo.findUnique({ where: { code } });
    if (!promo || !promo.isActive) return sendError(res, 'Promo code is invalid', 404);

    const now = new Date();
    if (promo.validFrom > now) return sendError(res, 'Promo not yet active', 400);
    if (promo.validUntil && promo.validUntil < now) return sendError(res, 'Promo has expired', 400);
    if (promo.minOrderValue > subtotal) {
      return sendError(res, `Minimum order value ₹${promo.minOrderValue}`, 400);
    }
    if (promo.usageLimit && promo.usedCount >= promo.usageLimit) {
      return sendError(res, 'Promo usage limit reached', 400);
    }
    if (promo.perUserLimit) {
      const perUser = await prisma.promoRedemption.count({
        where: { promoId: promo.id, userId: req.user!.id },
      });
      if (perUser >= promo.perUserLimit) return sendError(res, 'You have already used this code', 400);
    }

    const discount =
      promo.discountType === 'FLAT'
        ? Math.min(promo.discountValue, subtotal)
        : Math.min(
            (subtotal * promo.discountValue) / 100,
            promo.maxDiscount ?? Number.POSITIVE_INFINITY,
          );

    return sendSuccess(res, {
      code: promo.code,
      description: promo.description,
      discount: Math.round(discount * 100) / 100,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
    });
  } catch (err) {
    console.error('[Promos] validate error:', err);
    return sendError(res, 'Failed to validate promo', 500);
  }
});

// ─── Admin CRUD ──────────────────────────────────────────────────────────────

router.use(authenticate); // all routes below require auth

router.get('/', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const isActive = req.query['isActive'];
    const where: Record<string, unknown> = {};
    if (isActive === 'true') where['isActive'] = true;
    if (isActive === 'false') where['isActive'] = false;

    const promos = await prisma.promo.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return sendSuccess(res, promos);
  } catch (err) {
    console.error('[Promos] list error:', err);
    return sendError(res, 'Failed to fetch promos', 500);
  }
});

router.post(
  '/',
  authorize('ADMIN'),
  validate(promoSchema),
  async (req: Request, res: Response) => {
    try {
      const data = {
        ...req.body,
        validFrom: req.body.validFrom ? new Date(req.body.validFrom) : new Date(),
        validUntil: req.body.validUntil ? new Date(req.body.validUntil) : null,
      };
      const created = await prisma.promo.create({ data });
      return sendSuccess(res, created, 'Promo created', 201);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === 'P2002') return sendError(res, 'Code already exists', 409);
      console.error('[Promos] create error:', err);
      return sendError(res, 'Failed to create promo', 500);
    }
  },
);

router.put(
  '/:id',
  authorize('ADMIN'),
  validate(promoSchema.partial()),
  async (req: Request, res: Response) => {
    try {
      const data: Record<string, unknown> = { ...req.body };
      if (req.body.validFrom) data['validFrom'] = new Date(req.body.validFrom);
      if (req.body.validUntil) data['validUntil'] = new Date(req.body.validUntil);
      const updated = await prisma.promo.update({
        where: { id: req.params['id'] },
        data,
      });
      return sendSuccess(res, updated, 'Promo updated');
    } catch (err) {
      console.error('[Promos] update error:', err);
      return sendError(res, 'Failed to update promo', 500);
    }
  },
);

router.delete('/:id', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    await prisma.promo.delete({ where: { id: req.params['id'] } });
    return sendSuccess(res, null, 'Promo deleted');
  } catch (err) {
    console.error('[Promos] delete error:', err);
    return sendError(res, 'Failed to delete promo', 500);
  }
});

router.put('/:id/toggle', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const promo = await prisma.promo.findUnique({ where: { id: req.params['id'] } });
    if (!promo) return sendError(res, 'Not found', 404);
    const updated = await prisma.promo.update({
      where: { id: promo.id },
      data: { isActive: !promo.isActive },
    });
    return sendSuccess(res, updated);
  } catch (err) {
    console.error('[Promos] toggle error:', err);
    return sendError(res, 'Failed to toggle', 500);
  }
});

export default router;
