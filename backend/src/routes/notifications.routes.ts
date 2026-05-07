import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { sendSuccess, sendError } from '../utils/response';

const router = Router();

const fcmTokenSchema = z.object({
  token: z.string().min(1, 'FCM token is required'),
});

// All routes require authentication
router.use(authenticate);

// ─── GET / ────────────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt((req.query['page'] as string) || '1', 10));
    const limit = Math.min(50, parseInt((req.query['limit'] as string) || '20', 10));
    const skip = (page - 1) * limit;

    const [notifications, total] = await prisma.$transaction([
      prisma.notification.findMany({
        where: { userId: req.user!.id },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where: { userId: req.user!.id } }),
    ]);

    const unreadCount = await prisma.notification.count({
      where: { userId: req.user!.id, isRead: false },
    });

    return sendSuccess(res, {
      notifications,
      total,
      unreadCount,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('[Notifications] list error:', err);
    return sendError(res, 'Failed to fetch notifications', 500);
  }
});

// ─── PUT /read-all ────────────────────────────────────────────────────────────
// Must be defined before /:id to avoid "read-all" being matched as an id

router.put('/read-all', async (req: Request, res: Response) => {
  try {
    const { count } = await prisma.notification.updateMany({
      where: { userId: req.user!.id, isRead: false },
      data: { isRead: true },
    });

    return sendSuccess(res, { updated: count }, 'All notifications marked as read');
  } catch (err) {
    console.error('[Notifications] read-all error:', err);
    return sendError(res, 'Failed to mark notifications as read', 500);
  }
});

// ─── PUT /:id/read ────────────────────────────────────────────────────────────

router.put('/:id/read', async (req: Request, res: Response) => {
  try {
    const notification = await prisma.notification.findFirst({
      where: { id: req.params['id'], userId: req.user!.id },
    });

    if (!notification) return sendError(res, 'Notification not found', 404);

    const updated = await prisma.notification.update({
      where: { id: req.params['id'] },
      data: { isRead: true },
    });

    return sendSuccess(res, updated, 'Notification marked as read');
  } catch (err) {
    console.error('[Notifications] read error:', err);
    return sendError(res, 'Failed to mark notification as read', 500);
  }
});

// ─── PUT /fcm-token ───────────────────────────────────────────────────────────

router.put('/fcm-token', validate(fcmTokenSchema), async (req: Request, res: Response) => {
  try {
    const { token } = req.body as { token: string; platform?: string };
    const platform = (req.body as { platform?: string }).platform;
    const userId = req.user!.id;

    // Upsert one Device row per token. If this token already exists for
    // someone (e.g. user logged in on this phone before logging in again),
    // re-bind it to the current user. Backfill User.fcmToken with the latest
    // token for backward compat with any code still reading that column.
    await prisma.$transaction([
      prisma.device.upsert({
        where: { token },
        create: { userId, token, platform: platform ?? null },
        update: { userId, platform: platform ?? null },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { fcmToken: token },
      }),
    ]);

    return sendSuccess(res, null, 'Device push token registered');
  } catch (err) {
    console.error('[Notifications] fcm-token error:', err);
    return sendError(res, 'Failed to register push token', 500);
  }
});

// ─── DELETE /fcm-token ────────────────────────────────────────────────────────
// Called on logout. Pass `?token=...` to remove just this device. Without it,
// removes every device the user has registered (defensive — e.g. forced
// logout from admin).

router.delete('/fcm-token', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const token = (req.query['token'] as string | undefined) ?? undefined;

    if (token) {
      await prisma.device.deleteMany({ where: { userId, token } });
    } else {
      await prisma.device.deleteMany({ where: { userId } });
    }
    // Keep User.fcmToken in sync — clear it if no devices remain
    const remaining = await prisma.device.count({ where: { userId } });
    if (remaining === 0) {
      await prisma.user.update({ where: { id: userId }, data: { fcmToken: null } });
    }

    return sendSuccess(res, null, 'Device push token removed');
  } catch (err) {
    console.error('[Notifications] clear fcm-token error:', err);
    return sendError(res, 'Failed to remove push token', 500);
  }
});

// ─── Web Push (admin browser) ────────────────────────────────────────────────
import { getVapidPublicKey } from '../services/web-push.service';

router.get('/web-push/public-key', (_req: Request, res: Response) => {
  return sendSuccess(res, { publicKey: getVapidPublicKey() });
});

router.post('/web-push/subscribe', authenticate, async (req: Request, res: Response) => {
  try {
    const { endpoint, keys } = req.body as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return sendError(res, 'Invalid subscription payload', 400);
    }
    await prisma.webPushSubscription.upsert({
      where: { endpoint },
      create: { userId: req.user!.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      update: { userId: req.user!.id, p256dh: keys.p256dh, auth: keys.auth },
    });
    return sendSuccess(res, null, 'Subscribed');
  } catch (err) {
    console.error('[Notifications] web-push subscribe error:', err);
    return sendError(res, 'Failed to subscribe', 500);
  }
});

router.post('/web-push/unsubscribe', authenticate, async (req: Request, res: Response) => {
  try {
    const endpoint = req.body?.endpoint as string | undefined;
    if (!endpoint) return sendError(res, 'endpoint required', 400);
    await prisma.webPushSubscription.deleteMany({
      where: { endpoint, userId: req.user!.id },
    });
    return sendSuccess(res, null, 'Unsubscribed');
  } catch (err) {
    console.error('[Notifications] web-push unsubscribe error:', err);
    return sendError(res, 'Failed to unsubscribe', 500);
  }
});

export default router;
