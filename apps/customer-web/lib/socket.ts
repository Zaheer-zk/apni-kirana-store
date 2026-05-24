'use client';

import { io, type Socket } from 'socket.io-client';
import { getToken } from './auth';

/**
 * Mirrors `apps/customer/lib/socket.ts` so the web tracking page receives the
 * same `order:status` + `driver:location` events the mobile customer app
 * uses. Keep the room/event names in sync with `backend/src/socket/index.ts`.
 *
 * We resolve the base URL from `NEXT_PUBLIC_API_URL` (same as the REST
 * client) so the socket talks to the same backend instance the rest of the
 * app does — important on prod where `https://api.example.com` ≠
 * `https://app.example.com`.
 */
function resolveSocketUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  return url ?? 'http://localhost:3000';
}

export function createSocket(token: string): Socket {
  return io(resolveSocketUrl(), {
    auth: { token },
    // Allow polling fallback for environments where websockets are blocked by
    // corporate proxies. Mobile uses websocket-only because Expo's stack is
    // stable, but browsers occasionally fail websocket handshakes.
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 2_000,
  });
}

export interface DriverLocation {
  lat: number;
  lng: number;
}

/**
 * Subscribes to a single order's live events and returns an unsubscribe.
 * Callers should pair this with the socket from `createSocket()`.
 */
export function subscribeToOrder(
  socket: Socket,
  orderId: string,
  onStatus: (status: string, extra?: Record<string, unknown>) => void,
  onLocation: (loc: DriverLocation) => void,
): () => void {
  // Backend joins us to `order:<id>` when this is emitted.
  socket.emit('order:subscribe', orderId);

  const statusHandler = (data: { orderId: string; status: string } & Record<string, unknown>) => {
    if (data.orderId === orderId) onStatus(data.status, data);
  };
  const locationHandler = (data: { orderId?: string; lat: number; lng: number }) => {
    if (!data.orderId || data.orderId === orderId) {
      onLocation({ lat: data.lat, lng: data.lng });
    }
  };

  socket.on('order:status', statusHandler);
  socket.on('driver:location', locationHandler);

  return () => {
    socket.off('order:status', statusHandler);
    socket.off('driver:location', locationHandler);
  };
}

/**
 * Convenience: create + subscribe in one call. Auto-disconnects on cleanup.
 * Returns `null` when there's no auth token (caller should redirect to login
 * but we don't do that here to keep the helper pure).
 */
export function openOrderSocket(
  orderId: string,
  handlers: {
    onStatus: (status: string, extra?: Record<string, unknown>) => void;
    onLocation: (loc: DriverLocation) => void;
  },
): (() => void) | null {
  const token = getToken();
  if (!token) return null;
  const socket = createSocket(token);
  const unsubscribe = subscribeToOrder(socket, orderId, handlers.onStatus, handlers.onLocation);
  return () => {
    unsubscribe();
    socket.disconnect();
  };
}
