import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { sendSuccess, sendError } from '../utils/response';

const router = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
});

// ─── GET /me ──────────────────────────────────────────────────────────────────

router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        addresses: {
          where: { isDefault: true },
          take: 1,
        },
      },
    });

    if (!user) return sendError(res, 'User not found', 404);

    const { addresses, ...rest } = user;
    const defaultAddress = addresses[0] ?? null;

    return sendSuccess(res, { ...rest, defaultAddress });
  } catch (err) {
    console.error('[Users] get me error:', err);
    return sendError(res, 'Failed to fetch user', 500);
  }
});

// ─── PUT /me ──────────────────────────────────────────────────────────────────

router.put(
  '/me',
  authenticate,
  validate(updateUserSchema),
  async (req: Request, res: Response) => {
    try {
      const data = req.body as z.infer<typeof updateUserSchema>;

      // Email field doesn't exist on User model — silently ignore for now
      const update: { name?: string } = {};
      if (data.name !== undefined) update.name = data.name;

      const user = await prisma.user.update({
        where: { id: req.user!.id },
        data: update,
        select: {
          id: true,
          name: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return sendSuccess(res, user, 'Profile updated');
    } catch (err) {
      console.error('[Users] update me error:', err);
      return sendError(res, 'Failed to update profile', 500);
    }
  },
);

// ─── DELETE /me ───────────────────────────────────────────────────────────────

router.delete('/me', authenticate, async (req: Request, res: Response) => {
  try {
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { isActive: false },
    });
    // Invalidate refresh tokens
    await prisma.refreshToken.deleteMany({ where: { userId: req.user!.id } });

    return sendSuccess(res, null, 'Account deactivated');
  } catch (err) {
    console.error('[Users] delete me error:', err);
    return sendError(res, 'Failed to delete account', 500);
  }
});

export default router;
