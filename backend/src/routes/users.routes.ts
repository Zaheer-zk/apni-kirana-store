import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { sendSuccess, sendError } from '../utils/response';
import { getWalletWithTxns } from '../services/wallet.service';

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

// ─── Wallet ──────────────────────────────────────────────────────────────────
// Returns the caller's own wallet balance + recent transactions. Lazy-creates
// the wallet row on first read so there's no separate "create wallet" call.

router.get('/me/wallet', authenticate, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query['limit']) || 50));
    const view = await getWalletWithTxns(req.user!.id, limit);
    return sendSuccess(res, view);
  } catch (err) {
    console.error('[Users] get wallet error:', err);
    return sendError(res, 'Failed to fetch wallet', 500);
  }
});

// ─── Notification preferences ────────────────────────────────────────────────

router.get('/me/preferences', authenticate, async (req: Request, res: Response) => {
  try {
    let prefs = await prisma.notificationPreferences.findUnique({
      where: { userId: req.user!.id },
    });
    if (!prefs) {
      // Auto-provision with defaults so the client always gets a row
      prefs = await prisma.notificationPreferences.create({
        data: { userId: req.user!.id },
      });
    }
    return sendSuccess(res, prefs);
  } catch (err) {
    console.error('[Users] get preferences error:', err);
    return sendError(res, 'Failed to fetch preferences', 500);
  }
});

router.put('/me/preferences', authenticate, async (req: Request, res: Response) => {
  try {
    // Whitelist updatable fields — client can't sneak in userId/timestamps
    const allowed = [
      'orderUpdates', 'promotional', 'dailySummary', 'driverUpdates',
      'newOrderAlerts', 'rescindedAlerts', 'earningsSummary',
      'newDeliveryAlerts', 'payoutNotifications',
      'newStoreApprovals', 'newDriverApprovals', 'refundEvents',
    ];
    const data: Record<string, boolean> = {};
    for (const k of allowed) {
      if (typeof req.body?.[k] === 'boolean') data[k] = req.body[k];
    }

    const prefs = await prisma.notificationPreferences.upsert({
      where: { userId: req.user!.id },
      create: { userId: req.user!.id, ...data },
      update: data,
    });
    return sendSuccess(res, prefs, 'Preferences saved');
  } catch (err) {
    console.error('[Users] update preferences error:', err);
    return sendError(res, 'Failed to save preferences', 500);
  }
});

// ─── GET /recipient-lookup ────────────────────────────────────────────────
// Used by the "order for someone else" cart flow: the customer enters the
// recipient's phone, and we tell the UI whether that number already has a
// Quick Easy Mart account so the cart can either offer to deliver to one
// of the recipient's saved addresses (if they're already a user and have
// consented to that — see below), or fall through to collecting a one-off
// address inline.
//
// Privacy guardrails
// ------------------
// We deliberately DO NOT return any saved address rows for the recipient,
// even when they exist. Two reasons:
//   1. The recipient may not want their home address exposed to anyone
//      who knows their phone number — that's a doxxing vector.
//   2. The cart flow works fine without it: the sender can confirm the
//      address with the recipient out-of-band and enter it themselves.
//
// So this endpoint returns ONLY a boolean "exists" + the recipient's name
// (so the UI can show "Sending to Ramesh" instead of just the phone).
// Name is already considered low-sensitivity (it's printed on every
// invoice). If we later add an "address-sharing opt-in" toggle to user
// preferences, we can expand this response — but the default must stay
// closed.

const recipientLookupSchema = z.object({
  phone: z.string().regex(/^\d{10}$/, 'Phone must be a 10-digit number'),
});

router.get('/recipient-lookup', authenticate, async (req: Request, res: Response) => {
  try {
    const parsed = recipientLookupSchema.safeParse({ phone: req.query['phone'] });
    if (!parsed.success) {
      return sendError(res, parsed.error.issues[0]?.message ?? 'Invalid phone', 400);
    }
    const { phone } = parsed.data;
    // Don't allow looking up your own phone — that's just self-checkout,
    // not "for someone else". Saves the UI from a degenerate case.
    if (req.user?.phone === phone) {
      return sendSuccess(res, { exists: false, isSelf: true, name: null });
    }
    const found = await prisma.user.findFirst({
      where: { phone, role: 'CUSTOMER' },
      select: { name: true },
    });
    return sendSuccess(res, {
      exists: !!found,
      isSelf: false,
      // Name is the only PII we expose — see header comment.
      name: found?.name ?? null,
    });
  } catch (err) {
    console.error('[Users] recipient-lookup error:', err);
    return sendError(res, 'Failed to look up recipient', 500);
  }
});

export default router;
