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
    const { token } = req.body as { token: string };

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { fcmToken: token },
    });

    return sendSuccess(res, null, 'FCM token updated successfully');
  } catch (err) {
    console.error('[Notifications] fcm-token error:', err);
    return sendError(res, 'Failed to update FCM token', 500);
  }
});

export default router;
