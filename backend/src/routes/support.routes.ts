// =====================================================================================
// Support chat — any user (CUSTOMER / STORE_OWNER / DRIVER) can open a help
// thread with the admin team. Independent of order chats.
//
// Layout:
//   • One SupportThread per user (UNIQUE on userId). Re-opens if RESOLVED.
//   • Any admin can reply; senderId on each message records who sent it.
//   • adminUnread / userUnread are denormalized counters so the admin inbox
//     can render a badge without joining ChatMessage.
// =====================================================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { sendSuccess, sendError } from '../utils/response';
import { notify, notifyAdmins } from '../services/notification.service';
import { io } from '../socket';

const router = Router();

const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

// ─── USER SIDE: GET /support/me — fetch (or create) my thread ────────────────

router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const thread = await prisma.supportThread.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    return sendSuccess(res, thread);
  } catch (err) {
    console.error('[Support] me error:', err);
    return sendError(res, 'Failed to load support thread', 500);
  }
});

// ─── USER SIDE: GET /support/me/messages ─────────────────────────────────────

router.get('/me/messages', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const thread = await prisma.supportThread.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    const messages = await prisma.supportMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    // Mark all admin-sent messages as read on the way out
    if (thread.userUnread > 0) {
      await prisma.$transaction([
        prisma.supportMessage.updateMany({
          where: { threadId: thread.id, senderId: { not: userId }, readAt: null },
          data: { readAt: new Date() },
        }),
        prisma.supportThread.update({
          where: { id: thread.id },
          data: { userUnread: 0 },
        }),
      ]);
    }

    return sendSuccess(res, { thread, messages });
  } catch (err) {
    console.error('[Support] list messages error:', err);
    return sendError(res, 'Failed to load messages', 500);
  }
});

// ─── USER SIDE: POST /support/me/messages — user sends a message ─────────────

router.post(
  '/me/messages',
  authenticate,
  validate(sendMessageSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { body } = req.body as { body: string };

      const thread = await prisma.supportThread.upsert({
        where: { userId },
        create: { userId },
        update: { status: 'OPEN' }, // re-open if it was RESOLVED
      });

      const [message] = await prisma.$transaction([
        prisma.supportMessage.create({
          data: { threadId: thread.id, senderId: userId, body },
        }),
        prisma.supportThread.update({
          where: { id: thread.id },
          data: {
            lastMessage: body.slice(0, 200),
            lastSenderId: userId,
            lastAt: new Date(),
            adminUnread: { increment: 1 },
            status: 'OPEN',
          },
        }),
      ]);

      // Real-time: every admin's user-room + the thread room
      io?.to(`support:${thread.id}`).emit('support:message', message);

      // Push: notify all admins
      void (async () => {
        try {
          const sender = await prisma.user.findUnique({
            where: { id: userId },
            select: { name: true, role: true },
          });
          await notifyAdmins('ADMIN_SUPPORT_NEW', {
            senderName: sender?.name ?? 'A user',
            role: sender?.role ?? 'USER',
            preview: body.length > 80 ? body.slice(0, 77) + '…' : body,
            threadId: thread.id,
          });
        } catch (err) {
          console.warn('[Support] notify admins failed:', err);
        }
      })();

      return sendSuccess(res, message, 'Message sent', 201);
    } catch (err) {
      console.error('[Support] user send error:', err);
      return sendError(res, 'Failed to send message', 500);
    }
  },
);

// ─── ADMIN SIDE: list all threads (sorted by last activity) ──────────────────

router.get(
  '/admin/threads',
  authenticate,
  authorize('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const status = req.query['status'] as 'OPEN' | 'RESOLVED' | undefined;
      const page = Math.max(1, parseInt((req.query['page'] as string) || '1', 10));
      const limit = Math.min(100, parseInt((req.query['limit'] as string) || '50', 10));

      const [threads, total, totalUnread] = await Promise.all([
        prisma.supportThread.findMany({
          where: status ? { status } : {},
          orderBy: [{ adminUnread: 'desc' }, { lastAt: 'desc' }, { createdAt: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.supportThread.count({ where: status ? { status } : {} }),
        prisma.supportThread.aggregate({
          _sum: { adminUnread: true },
        }),
      ]);

      // Enrich with user info — pull all userIds in one round-trip
      const userIds = threads.map((t) => t.userId);
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, phone: true, role: true },
      });
      const userMap = new Map(users.map((u) => [u.id, u]));
      const enriched = threads.map((t) => ({
        ...t,
        user: userMap.get(t.userId) ?? null,
      }));

      return sendSuccess(res, {
        threads: enriched,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        totalUnread: totalUnread._sum.adminUnread ?? 0,
      });
    } catch (err) {
      console.error('[Support] list threads error:', err);
      return sendError(res, 'Failed to load support threads', 500);
    }
  },
);

// ─── ADMIN SIDE: read one thread (with messages) ─────────────────────────────

router.get(
  '/admin/threads/:id',
  authenticate,
  authorize('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const thread = await prisma.supportThread.findUnique({
        where: { id: req.params['id'] },
      });
      if (!thread) return sendError(res, 'Thread not found', 404);

      const [user, messages] = await Promise.all([
        prisma.user.findUnique({
          where: { id: thread.userId },
          select: { id: true, name: true, phone: true, role: true },
        }),
        prisma.supportMessage.findMany({
          where: { threadId: thread.id },
          orderBy: { createdAt: 'asc' },
          take: 500,
        }),
      ]);

      // Mark user-sent messages as read by admin (clear adminUnread)
      if (thread.adminUnread > 0) {
        await prisma.$transaction([
          prisma.supportMessage.updateMany({
            where: {
              threadId: thread.id,
              senderId: { not: req.user!.id },
              readAt: null,
            },
            data: { readAt: new Date() },
          }),
          prisma.supportThread.update({
            where: { id: thread.id },
            data: { adminUnread: 0 },
          }),
        ]);
      }

      return sendSuccess(res, { thread, user, messages });
    } catch (err) {
      console.error('[Support] admin thread error:', err);
      return sendError(res, 'Failed to load thread', 500);
    }
  },
);

// ─── ADMIN SIDE: reply to a thread ───────────────────────────────────────────

router.post(
  '/admin/threads/:id/messages',
  authenticate,
  authorize('ADMIN'),
  validate(sendMessageSchema),
  async (req: Request, res: Response) => {
    try {
      const adminId = req.user!.id;
      const { body } = req.body as { body: string };

      const thread = await prisma.supportThread.findUnique({
        where: { id: req.params['id'] },
      });
      if (!thread) return sendError(res, 'Thread not found', 404);

      const [message] = await prisma.$transaction([
        prisma.supportMessage.create({
          data: { threadId: thread.id, senderId: adminId, body },
        }),
        prisma.supportThread.update({
          where: { id: thread.id },
          data: {
            lastMessage: body.slice(0, 200),
            lastSenderId: adminId,
            lastAt: new Date(),
            userUnread: { increment: 1 },
            status: 'OPEN',
          },
        }),
      ]);

      // Real-time: thread room + user's personal room
      io?.to(`support:${thread.id}`).emit('support:message', message);
      io?.to(`user:${thread.userId}`).emit('support:new', {
        threadId: thread.id,
        message,
      });

      // Push to the user
      void (async () => {
        try {
          await notify('SUPPORT_REPLY', thread.userId, {
            preview: body.length > 80 ? body.slice(0, 77) + '…' : body,
            threadId: thread.id,
            event: 'SUPPORT_REPLY',
          });
        } catch (err) {
          console.warn('[Support] push to user failed:', err);
        }
      })();

      return sendSuccess(res, message, 'Reply sent', 201);
    } catch (err) {
      console.error('[Support] admin reply error:', err);
      return sendError(res, 'Failed to send reply', 500);
    }
  },
);

// ─── ADMIN SIDE: mark thread RESOLVED ────────────────────────────────────────

router.put(
  '/admin/threads/:id/resolve',
  authenticate,
  authorize('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const updated = await prisma.supportThread.update({
        where: { id: req.params['id'] },
        data: { status: 'RESOLVED', adminUnread: 0 },
      });
      return sendSuccess(res, updated, 'Thread marked as resolved');
    } catch (err) {
      console.error('[Support] resolve error:', err);
      return sendError(res, 'Failed to resolve thread', 500);
    }
  },
);

export default router;
