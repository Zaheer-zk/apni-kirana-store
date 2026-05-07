import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { sendSuccess, sendError } from '../utils/response';
import { getOrCreateChat, isOrderLive, resolveChatPair } from '../services/chat.service';
import { io } from '../socket';

const router = Router();

router.use(authenticate);

const sendMessageSchema = z.object({
  body: z.string().trim().min(1, 'Message body is required').max(2000),
});

// ─── GET /chats/order/:orderId ────────────────────────────────────────────────
// Resolve the chat between the current user and the order's other party.
// Optional `?with=<userId>` to disambiguate when 3 parties are present.

router.get('/order/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params as { orderId: string };
    const withUserId = (req.query['with'] as string | undefined) ?? undefined;
    const userId = req.user!.id;

    const pair = await resolveChatPair(orderId, userId, withUserId);
    if (!pair) {
      return sendError(res, 'No chat available for this order/user', 404);
    }

    const chat = await getOrCreateChat(orderId, userId, pair.otherUserId);
    if (chat && (chat as any).deletedAt) {
      return sendError(res, 'This chat has been archived', 410);
    }

    return sendSuccess(res, {
      id: chat.id,
      orderId,
      otherUserId: pair.otherUserId,
      orderStatus: pair.orderStatus,
      canSend: isOrderLive(pair.orderStatus) && !chat.closedAt,
    });
  } catch (err) {
    console.error('[Chats] resolve error:', err);
    return sendError(res, 'Failed to load chat', 500);
  }
});

// ─── GET /chats/:id/messages ─────────────────────────────────────────────────
// Returns up to 100 most-recent messages, oldest-first. Use `?before=<iso>`
// to page back further.

router.get('/:id/messages', async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const userId = req.user!.id;
    const before = req.query['before'] ? new Date(req.query['before'] as string) : undefined;

    const chat = await prisma.chat.findUnique({ where: { id } });
    if (!chat || (chat.userAId !== userId && chat.userBId !== userId)) {
      return sendError(res, 'Chat not found', 404);
    }
    if (chat.deletedAt) return sendError(res, 'This chat has been archived', 410);

    const messages = await prisma.chatMessage.findMany({
      where: {
        chatId: id,
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Mark unread messages from the other side as read
    await prisma.chatMessage.updateMany({
      where: { chatId: id, senderId: { not: userId }, readAt: null },
      data: { readAt: new Date() },
    });

    return sendSuccess(res, messages.reverse());
  } catch (err) {
    console.error('[Chats] list messages error:', err);
    return sendError(res, 'Failed to load messages', 500);
  }
});

// ─── POST /chats/:id/messages ─────────────────────────────────────────────────

router.post(
  '/:id/messages',
  validate(sendMessageSchema),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params as { id: string };
      const userId = req.user!.id;
      const { body } = req.body as { body: string };

      const chat = await prisma.chat.findUnique({
        where: { id },
        include: { messages: false },
      });
      if (!chat || (chat.userAId !== userId && chat.userBId !== userId)) {
        return sendError(res, 'Chat not found', 404);
      }
      if (chat.deletedAt) return sendError(res, 'This chat has been archived', 410);

      const order = await prisma.order.findUnique({
        where: { id: chat.orderId },
        select: { status: true },
      });
      if (!order) return sendError(res, 'Order not found', 404);
      if (!isOrderLive(order.status) || chat.closedAt) {
        return sendError(
          res,
          'Chat is read-only for this order — it is no longer in progress.',
          400,
        );
      }

      const message = await prisma.chatMessage.create({
        data: { chatId: id, senderId: userId, body },
      });

      // Real-time fan-out — both participants are listening on chat:<id>
      io?.to(`chat:${id}`).emit('chat:message', message);
      // Wake up the recipient even if they don't have the chat screen open
      const recipientId = chat.userAId === userId ? chat.userBId : chat.userAId;
      io?.to(`user:${recipientId}`).emit('chat:new', { chatId: id, orderId: chat.orderId, message });

      return sendSuccess(res, message, 'Message sent', 201);
    } catch (err) {
      console.error('[Chats] send message error:', err);
      return sendError(res, 'Failed to send message', 500);
    }
  },
);

export default router;
