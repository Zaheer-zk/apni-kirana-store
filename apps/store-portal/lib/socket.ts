import { io, Socket } from 'socket.io-client';
import Constants from 'expo-constants';
import { useStorePortalStore } from '@/store/store.store';

const SOCKET_URL =
  (Constants.expoConfig?.extra?.socketUrl as string | undefined) ??
  'http://localhost:3000';

let socket: Socket | null = null;

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
  // New order arrives for this store
  // ---------------------------------------------------------------------------
  socket.on('order:new', (payload: { orderId: string }) => {
    const { setIncomingOrder } = useStorePortalStore.getState();
    setIncomingOrder(payload.orderId);
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
