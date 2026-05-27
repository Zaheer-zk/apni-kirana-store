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
import { closeChatsForOrder, isOrderClosed } from './chat.service';
import { pingLiveOps } from './liveops.service';
import { OrderStatus } from '@prisma/client';

export async function broadcastOrderStatus(
  orderId: string,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  // Close any chat threads for this order once the order ends so participants
  // can no longer send messages (read still works until the retention sweep).
  if (isOrderClosed(status as OrderStatus)) {
    closeChatsForOrder(orderId).catch((err) =>
      console.warn('[order-events] close chats failed:', err),
    );
  }

  if (!io) return;

  // Always broadcast on the order room (subscribers join via 'order:subscribe')
  io.to(`order:${orderId}`).emit('order:status', { orderId, status, ...extra });

  // Also push to each role's personal room so unsubscribed apps see the change,
  // AND ping the admin live-ops dashboards that intersect this order's
  // geographic footprint.
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        customerId: true,
        store: { select: { ownerId: true, lat: true, lng: true } },
        driver: { select: { userId: true, currentLat: true, currentLng: true } },
        deliveryAddress: { select: { lat: true, lng: true } },
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

    // Live-ops dashboards: zone-scoped fan-out. An order touches up to 3
    // points (store, dropoff, driver) — admin sees the change if their
    // selected zone contains any of them.
    await pingLiveOps('order:update', [
      order.store ? { lat: order.store.lat, lng: order.store.lng } : null,
      order.deliveryAddress
        ? { lat: order.deliveryAddress.lat, lng: order.deliveryAddress.lng }
        : null,
      order.driver?.currentLat != null && order.driver?.currentLng != null
        ? { lat: order.driver.currentLat, lng: order.driver.currentLng }
        : null,
    ]);
  } catch (err) {
    console.warn('[order-events] broadcast lookup failed:', err);
  }
}
