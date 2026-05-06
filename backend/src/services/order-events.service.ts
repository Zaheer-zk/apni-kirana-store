// Centralised emitter for order status transitions.
// Every route handler that mutates Order.status should call broadcastOrderStatus
// so all three apps (customer, store, driver) receive the change in real-time.
//
// Rooms:
//   order:<id>      — anyone who subscribed (customer tracking, driver active job)
//   user:<custId>   — customer's personal channel (orders tab notification badge)
//   user:<storeOwn> — store owner's channel (so the store dashboard refetches)
//   user:<driverU>  — driver's user channel (drives "delivered" UI flash etc.)
import { io } from '../socket';
import { prisma } from '../config/prisma';

export async function broadcastOrderStatus(
  orderId: string,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  if (!io) return;

  // Always broadcast on the order room (subscribers join via 'order:subscribe')
  io.to(`order:${orderId}`).emit('order:status', { orderId, status, ...extra });

  // Also push to each role's personal room so unsubscribed apps see the change
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        customerId: true,
        store: { select: { ownerId: true } },
        driver: { select: { userId: true } },
      },
    });
    if (!order) return;

    const payload = { orderId, status, ...extra };
    io.to(`user:${order.customerId}`).emit('order:status', payload);
    if (order.store?.ownerId) {
      io.to(`user:${order.store.ownerId}`).emit('order:status', payload);
    }
    if (order.driver?.userId) {
      io.to(`user:${order.driver.userId}`).emit('order:status', payload);
    }
  } catch (err) {
    console.warn('[order-events] broadcast lookup failed:', err);
  }
}
