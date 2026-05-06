import { io, Socket } from 'socket.io-client';
import Constants from 'expo-constants';
import { useDriverStore } from '@/store/driver.store';

const SOCKET_URL =
  (Constants.expoConfig?.extra?.socketUrl as string | undefined) ??
  'http://localhost:3000';

let socket: Socket | null = null;

// ---------------------------------------------------------------------------
// Tiny event-emitter for "order:rescinded" subscribers (e.g. IncomingOrderModal)
// ---------------------------------------------------------------------------
type RescindCallback = (orderId: string) => void;
const rescindSubscribers = new Set<RescindCallback>();

export function onOrderRescinded(cb: RescindCallback): () => void {
  rescindSubscribers.add(cb);
  return () => {
    rescindSubscribers.delete(cb);
  };
}

function emitRescinded(orderId: string): void {
  rescindSubscribers.forEach((cb) => {
    try {
      cb(orderId);
    } catch (err) {
      console.warn('[Socket] rescind subscriber threw:', err);
    }
  });
}

/**
 * Initialises the Socket.io connection for the driver app.
 * Safe to call multiple times — will reuse an existing connected socket.
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
    console.log('[Socket] Connected — driver namespace');
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.warn('[Socket] Connection error:', err.message);
  });

  // ---------------------------------------------------------------------------
  // Incoming delivery offer — broadcast (top-3) or single-driver assignment.
  // Backend may emit either "order:assigned" or "order:offered"; treat the
  // same on the client.
  // ---------------------------------------------------------------------------
  const handleOffer = (payload: { orderId: string }) => {
    if (!payload?.orderId) return;
    const { setIncomingOrder } = useDriverStore.getState();
    setIncomingOrder(payload.orderId);
  };

  socket.on('order:assigned', handleOffer);
  socket.on('order:offered', handleOffer);

  // ---------------------------------------------------------------------------
  // Offer rescinded — another driver accepted first.
  // ---------------------------------------------------------------------------
  socket.on('order:rescinded', (payload: { orderId: string }) => {
    if (!payload?.orderId) return;
    const { incomingOrderId, clearIncomingOrder } = useDriverStore.getState();
    if (incomingOrderId === payload.orderId) {
      clearIncomingOrder();
    }
    emitRescinded(payload.orderId);
  });

  // ---------------------------------------------------------------------------
  // Order accepted / rejected by another device (e.g., duplicate session)
  // ---------------------------------------------------------------------------
  socket.on('order:cancelled', () => {
    const { setIncomingOrder, setActiveOrder } = useDriverStore.getState();
    setIncomingOrder(null);
    setActiveOrder(null);
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
