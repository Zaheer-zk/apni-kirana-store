import { io, Socket } from 'socket.io-client';
import Constants from 'expo-constants';
import { useDriverStore } from '@/store/driver.store';

const SOCKET_URL =
  (Constants.expoConfig?.extra?.socketUrl as string | undefined) ??
  'http://localhost:3000';

let socket: Socket | null = null;

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
  // Incoming delivery request
  // ---------------------------------------------------------------------------
  socket.on('order:assigned', (payload: { orderId: string }) => {
    const { setIncomingOrder } = useDriverStore.getState();
    setIncomingOrder(payload.orderId);
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
