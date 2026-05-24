'use client';

import { io, type Socket } from 'socket.io-client';
import { getToken } from './auth';

/**
 * Socket.io client for driver-web. Mirrors `apps/driver/lib/socket.ts` from
 * the Expo app — same room/event names so the backend can broadcast to all
 * driver surfaces uniformly.
 *
 * The backend authenticates each socket via `handshake.auth.token`
 * (`backend/src/socket/index.ts`). After connect the user is auto-joined to
 * their `user:<id>` room — that's where `order:assigned`, `order:rescinded`
 * and per-order `order:status` events arrive.
 *
 * Web caveats vs mobile:
 *   - We allow polling fallback because corporate networks sometimes block
 *     raw websockets. Mobile uses websocket-only.
 *   - We never call `location:update` — web GPS is best-effort and the
 *     mobile app owns canonical driver location tracking. See
 *     `docs/driver-web.md`.
 */
function resolveSocketUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  return url ?? 'http://localhost:3000';
}

let socket: Socket | null = null;

/**
 * Returns a singleton socket. Lazy-connects on first call and re-uses the
 * existing connection on subsequent calls so multiple components (active
 * delivery + offer modal) don't open separate sockets.
 *
 * Pass `null` for the token at logout time to tear the socket down.
 */
export function getSocket(): Socket | null {
  if (typeof window === 'undefined') return null;
  const token = getToken();
  if (!token) {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    return null;
  }
  if (socket?.connected) return socket;
  if (socket) {
    socket.auth = { token };
    socket.connect();
    return socket;
  }
  socket = io(resolveSocketUrl(), {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 2_000,
    autoConnect: true,
  });
  socket.on('connect_error', (err) => {
    // Non-fatal: most pages have a polling fallback (React Query refetch)
    // so a transient socket failure doesn't break UX.
    console.warn('[driver-web socket] connect_error:', err.message);
  });
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Convenience: subscribe to an order's live status stream. Joins the
 * `order:<id>` room and calls `onStatus` for every `order:status` event.
 * Returns an unsubscribe that also leaves the room (best-effort).
 */
export function subscribeToOrder(
  orderId: string,
  onStatus: (payload: { orderId: string; status: string } & Record<string, unknown>) => void,
): () => void {
  const s = getSocket();
  if (!s) return () => {};
  const join = () => s.emit('order:subscribe', orderId);
  if (s.connected) join();
  else s.once('connect', join);
  const handler = (payload: { orderId: string; status: string } & Record<string, unknown>) => {
    if (payload?.orderId === orderId) onStatus(payload);
  };
  s.on('order:status', handler);
  return () => {
    s.off('order:status', handler);
    // No explicit "leave" event on the backend — the order room cleans up
    // when the socket disconnects. Leaving here is best-effort only.
  };
}

/**
 * Subscribe to per-driver assignment offers (broadcast or single-driver).
 * Returns an unsubscribe.
 */
export function subscribeToOffers(
  onOffer: (payload: { orderId: string; distanceKm?: number; score?: number }) => void,
  onRescinded?: (payload: { orderId: string }) => void,
): () => void {
  const s = getSocket();
  if (!s) return () => {};
  const offerHandler = (payload: { orderId: string; distanceKm?: number; score?: number }) => {
    if (payload?.orderId) onOffer(payload);
  };
  const rescindedHandler = (payload: { orderId: string }) => {
    if (payload?.orderId && onRescinded) onRescinded(payload);
  };
  // Backend emits 'order:assigned' (both broadcast + cascade modes). Some
  // older builds used 'order:offered' — listen to both for safety, same as
  // the Expo client.
  s.on('order:assigned', offerHandler);
  s.on('order:offered', offerHandler);
  s.on('order:rescinded', rescindedHandler);
  return () => {
    s.off('order:assigned', offerHandler);
    s.off('order:offered', offerHandler);
    s.off('order:rescinded', rescindedHandler);
  };
}
