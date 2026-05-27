// Admin socket.io client — used so the live-ops dashboard can hear the
// `liveops:invalidate` pings from the backend and refetch immediately
// instead of waiting for the next 30s poll tick. Singleton so multiple
// components share one connection.

import { io as createClient, type Socket } from 'socket.io-client';
import { getToken } from './auth';

let socket: Socket | null = null;

function resolveBaseUrl(): string {
  const url = process.env['NEXT_PUBLIC_API_URL'];
  if (!url) {
    // Same guard as lib/api.ts — fail loud if missing in prod.
    if (process.env.NODE_ENV === 'production') {
      throw new Error('NEXT_PUBLIC_API_URL is required (admin socket).');
    }
    return 'http://localhost:3000';
  }
  return url;
}

export function getSocket(): Socket {
  if (socket && socket.connected) return socket;
  if (socket) {
    socket.connect();
    return socket;
  }
  const token = getToken();
  socket = createClient(resolveBaseUrl(), {
    auth: token ? { token } : undefined,
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
  });
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
