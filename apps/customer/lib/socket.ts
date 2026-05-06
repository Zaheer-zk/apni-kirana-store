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
  const statusEvent = `order:${orderId}:status`;
  const locationEvent = `order:${orderId}:location`;

  // Join the room for this order
  socket.emit('order:join', { orderId });

  socket.on(statusEvent, (data: { status: OrderStatus }) => {
    onStatusUpdate(data.status);
  });

  socket.on(locationEvent, (data: { lat: number; lng: number }) => {
    onLocationUpdate({ lat: data.lat, lng: data.lng });
  });

  // Cleanup function
  return () => {
    socket.off(statusEvent);
    socket.off(locationEvent);
    socket.emit('order:leave', { orderId });
  };
}
