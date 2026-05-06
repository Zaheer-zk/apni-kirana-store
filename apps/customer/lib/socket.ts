import { io, Socket } from 'socket.io-client';
import type { LatLng } from '@aks/shared';
import { OrderStatus } from '@aks/shared';

const SOCKET_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

/**
 * Creates and returns an authenticated Socket.io client.
 * The caller is responsible for calling socket.disconnect() when done.
 */
export function createSocket(token: string): Socket {
  const socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.warn('[Socket] Connection error:', err.message);
  });

  return socket;
}

/**
 * Subscribes to real-time events for a specific order.
 *
 * @param socket       Active socket instance from createSocket()
 * @param orderId      The order to track
 * @param onStatusUpdate  Called when the order status changes
 * @param onLocationUpdate Called when the driver's location updates
 * @returns A cleanup function that unsubscribes all listeners
 */
export function subscribeToOrder(
  socket: Socket,
  orderId: string,
  onStatusUpdate: (status: OrderStatus) => void,
  onLocationUpdate: (location: LatLng) => void
): () => void {
  // Backend joins the user to room `order:<id>` when we send 'order:subscribe'
  socket.emit('order:subscribe', orderId);

  const statusHandler = (data: { orderId: string; status: OrderStatus }) => {
    if (data.orderId === orderId) onStatusUpdate(data.status);
  };
  const locationHandler = (data: { orderId?: string; lat: number; lng: number }) => {
    if (!data.orderId || data.orderId === orderId) {
      onLocationUpdate({ lat: data.lat, lng: data.lng });
    }
  };

  socket.on('order:status', statusHandler);
  socket.on('driver:location', locationHandler);

  return () => {
    socket.off('order:status', statusHandler);
    socket.off('driver:location', locationHandler);
  };
}
