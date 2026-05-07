import { Server, Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt';
import { prisma } from '../config/prisma';

interface LocationUpdatePayload {
  lat: number;
  lng: number;
  orderId?: string;
}

/**
 * Authenticates incoming Socket.io connections using a JWT passed via
 * handshake.auth.token. Attaches the decoded user to socket.data.
 */
async function socketAuthMiddleware(
  socket: Socket,
  next: (err?: Error) => void,
): Promise<void> {
  try {
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      return next(new Error('Authentication token is required'));
    }

    const payload = verifyAccessToken(token);
    socket.data.userId = payload.id;
    socket.data.role = payload.role;
    socket.data.phone = payload.phone;
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
}

/**
 * Registers all Socket.io event handlers and middleware.
 */
export function setupSocket(io: Server): void {
  io.use(socketAuthMiddleware);

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string;

    // Each user joins a personal room for targeted notifications
    socket.join(`user:${userId}`);

    console.log(`[Socket] User ${userId} connected (socket ${socket.id})`);

    // ── Subscribe to an order's live updates ────────────────────────────────
    socket.on('order:subscribe', async (orderId: string) => {
      // Verify the requesting user is related to this order
      const order = await prisma.order.findFirst({
        where: {
          id: orderId,
          OR: [
            { customerId: userId },
            { store: { ownerId: userId } },
            { driver: { userId } },
          ],
        },
        select: { id: true },
      });

      if (order) {
        socket.join(`order:${orderId}`);
        console.log(`[Socket] User ${userId} subscribed to order:${orderId}`);
      }
    });

    // ── Subscribe to a chat room (must be a participant) ────────────────────
    socket.on('chat:join', async (chatId: string) => {
      const chat = await prisma.chat.findFirst({
        where: {
          id: chatId,
          OR: [{ userAId: userId }, { userBId: userId }],
        },
        select: { id: true, deletedAt: true },
      });
      if (chat && !chat.deletedAt) {
        socket.join(`chat:${chatId}`);
      }
    });
    socket.on('chat:leave', (chatId: string) => {
      socket.leave(`chat:${chatId}`);
    });

    // ── Driver location updates ──────────────────────────────────────────────
    socket.on('location:update', async (payload: LocationUpdatePayload) => {
      const { lat, lng, orderId } = payload;

      // Update driver location in DB
      await prisma.driver
        .update({
          where: { userId },
          data: { currentLat: lat, currentLng: lng },
        })
        .catch(() => {
          // User may not be a driver — silently ignore
        });

      // Broadcast live location to all subscribers of the order
      if (orderId) {
        socket.to(`order:${orderId}`).emit('driver:location', { lat, lng, orderId });
      }
    });

    // ── Disconnect ───────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`[Socket] User ${userId} disconnected (socket ${socket.id})`);
    });
  });
}

/**
 * Emit an order status change to all subscribers of that order.
 * Call this from route handlers after updating order status in DB.
 */
export function emitOrderStatus(
  io: Server,
  orderId: string,
  status: string,
  extra?: Record<string, unknown>,
): void {
  io.to(`order:${orderId}`).emit('order:status', { orderId, status, ...extra });
}
