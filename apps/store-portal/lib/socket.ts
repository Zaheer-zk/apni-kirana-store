import { io, Socket } from 'socket.io-client';
import { useStorePortalStore } from '@/store/store.store';

// Reuse the same EXPO_PUBLIC_API_URL the rest of the app uses.
// On the phone "localhost" refers to the phone itself, so the LAN IP
// must come from the env var (set by `npx expo start --lan` invocation).
const SOCKET_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

let socket: Socket | null = null;

/**
 * Listener invoked whenever an in-flight order is rescinded by the server
 * (typically because another store accepted it first). UI layers can register
 * a listener via `onOrderRescinded` to display a transient toast.
 */
type RescindListener = (orderId: string) => void;
const rescindListeners = new Set<RescindListener>();

export function onOrderRescinded(listener: RescindListener): () => void {
  rescindListeners.add(listener);
  return () => {
    rescindListeners.delete(listener);
  };
}

/**
 * Initialises the Socket.io connection for the store portal app.
 * Safe to call multiple times — reuses an existing connected socket.
 */
export function initSocket(token: string): Socket {
  if (socket?.connected) return socket;

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionAttempts: 10,
  });

  socket.on('connect', () => {
    console.log('[Socket] Store portal connected');
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.warn('[Socket] Connection error:', err.message);
  });

  // ---------------------------------------------------------------------------
  // Legacy direct-route event — keep for backwards compatibility
  // ---------------------------------------------------------------------------
  socket.on('order:new', (payload: { orderId: string }) => {
    const { setIncomingOrder } = useStorePortalStore.getState();
    setIncomingOrder(payload.orderId);
  });

  // ---------------------------------------------------------------------------
  // Broadcast matching: server offers a new order to all candidate stores
  // ---------------------------------------------------------------------------
  socket.on('order:offered', (payload: { orderId: string }) => {
    const { setIncomingOrder } = useStorePortalStore.getState();
    setIncomingOrder(payload.orderId);
  });

  // ---------------------------------------------------------------------------
  // Broadcast matching: another store accepted the order first
  // ---------------------------------------------------------------------------
  socket.on('order:rescinded', (payload: { orderId: string }) => {
    const { incomingOrderId, setIncomingOrder } = useStorePortalStore.getState();
    if (incomingOrderId === payload.orderId) {
      setIncomingOrder(null);
    }
    rescindListeners.forEach((listener) => {
      try {
        listener(payload.orderId);
      } catch (err) {
        console.warn('[Socket] rescind listener threw', err);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Order was cancelled before the store responded
  // ---------------------------------------------------------------------------
  socket.on('order:cancelled', (payload: { orderId: string }) => {
    const { incomingOrderId, setIncomingOrder } = useStorePortalStore.getState();
    if (incomingOrderId === payload.orderId) {
      setIncomingOrder(null);
    }
  });

  return socket;
}

/**
 * Disconnects the socket. Call on logout.
 */
export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket(): Socket | null {
  return socket;
}
