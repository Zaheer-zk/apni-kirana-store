'use client';

import { io, Socket } from 'socket.io-client';
import { getToken } from './auth';

/**
 * Singleton Socket.io client for the store dashboard. Mirrors the pattern in
 * `apps/driver/lib/socket.ts` so the wire-format is identical:
 *
 *   - Auth via `handshake.auth.token` — the backend's `socketAuthMiddleware`
 *     verifies the JWT and joins each user to their personal `user:<id>` room.
 *   - The server emits `order:status` to that room on every transition (see
 *     `services/order-events.service.ts`) — components subscribe in a hook.
 *   - We also expose `subscribeToOrder(orderId)` so the order detail screen
 *     can join the dedicated `order:<id>` room, which is where driver live
 *     location updates land (`driver:location`).
 *
 * The connection is established lazily on first `getSocket()` call. Reusing
 * the same socket across screens means we don't open + close a connection
 * every time the user navigates between Orders and Dashboard.
 */

let socket: Socket | null = null;

function resolveBaseUrl(): string {
  // Same logic as `lib/api.ts` — Socket.io uses the API origin, not a
  // separate websocket host. NEXT_PUBLIC_API_URL is required in production.
  const url = process.env.NEXT_PUBLIC_API_URL;
  return url ?? 'http://localhost:3000';
}

export function getSocket(): Socket | null {
  if (typeof window === 'undefined') return null;
  const token = getToken();
  if (!token) return null;

  if (socket && socket.connected) {
    return socket;
  }

  // Re-create the socket if the token changed (re-login flow) — io.opts has
  // `auth` as the snapshot from the original call, so a token swap requires
  // a fresh socket.
  if (socket) {
    try {
      const existingAuth = (socket as unknown as { auth?: { token?: string } }).auth;
      if (existingAuth?.token !== token) {
        socket.disconnect();
        socket = null;
      }
    } catch {
      // Ignore — fall through and reuse.
    }
  }

  if (!socket) {
    socket = io(resolveBaseUrl(), {
      auth: { token },
      transports: ['websocket', 'polling'],
      // Auto-reconnect is on by default; bound the back-off so a flaky
      // network doesn't spam reconnects every second.
      reconnectionDelay: 1_500,
      reconnectionDelayMax: 10_000,
    });

    socket.on('connect_error', (err: Error) => {
      // 401 / invalid token surfaces as connect_error — useful while debugging.
      console.warn('[socket] connect_error:', err.message);
    });
  }

  return socket;
}

/** Join the room that receives `order:status` + `driver:location` events for one order. */
export function subscribeToOrder(orderId: string): () => void {
  const s = getSocket();
  if (!s) return () => undefined;
  // Emit immediately, and re-emit on reconnect so a transient drop doesn't
  // silently unsubscribe us. The backend dedupes joins.
  const join = () => s.emit('order:subscribe', orderId);
  join();
  s.on('connect', join);
  return () => {
    s.off('connect', join);
    // We don't `socket.leave` here — the server tears down rooms on disconnect
    // and it's harmless to stay subscribed while still on the dashboard. If
    // we ever need cleanup we can emit `order:unsubscribe`.
  };
}

/** Tear down on logout. */
export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
