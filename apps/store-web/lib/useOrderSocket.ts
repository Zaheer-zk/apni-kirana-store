'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket, subscribeToOrder } from './socket';

/**
 * Wire a single order detail page into Socket.io so any backend status
 * transition (accept → driver assigned → picked up → delivered) refreshes
 * the React Query cache without waiting for the polling interval.
 *
 * Also routes `driver:location` events to a `driverLocation:<orderId>`
 * query so the embedded map can mirror the driver's GPS in real time.
 */
export function useOrderSocket(orderId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!orderId) return;
    const socket = getSocket();
    if (!socket) return;

    const cleanup = subscribeToOrder(orderId);

    const onStatus = (payload: { orderId: string; status: string }) => {
      if (payload.orderId !== orderId) return;
      queryClient.invalidateQueries({ queryKey: ['orderDetail', orderId] });
      queryClient.invalidateQueries({ queryKey: ['storeOrders'] });
      queryClient.invalidateQueries({ queryKey: ['storeActiveOrders'] });
      queryClient.invalidateQueries({ queryKey: ['storeStatsToday'] });
    };

    const onDriverLocation = (payload: { orderId: string; lat: number; lng: number }) => {
      if (payload.orderId !== orderId) return;
      // Stash in a side-channel query so the map can re-render without
      // refetching the order detail.
      queryClient.setQueryData(['driverLocation', orderId], {
        lat: payload.lat,
        lng: payload.lng,
        at: Date.now(),
      });
    };

    socket.on('order:status', onStatus);
    socket.on('driver:location', onDriverLocation);

    return () => {
      socket.off('order:status', onStatus);
      socket.off('driver:location', onDriverLocation);
      cleanup();
    };
  }, [orderId, queryClient]);
}

/**
 * Subscribe to global `order:status` for the store-owner user room — used
 * by the dashboard so new orders pop up the moment the matching engine
 * notifies this store. Returns a callback the caller can use to set the
 * "new pending order" flag (for sound + toast).
 */
export function useStoreOrdersSocket(onNewOrder?: (payload: { orderId: string; status: string }) => void) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onStatus = (payload: { orderId: string; status: string }) => {
      queryClient.invalidateQueries({ queryKey: ['storeOrders'] });
      queryClient.invalidateQueries({ queryKey: ['storeActiveOrders'] });
      queryClient.invalidateQueries({ queryKey: ['storeStatsToday'] });
      if (payload.status === 'PENDING' && onNewOrder) {
        onNewOrder(payload);
      }
    };

    socket.on('order:status', onStatus);
    return () => {
      socket.off('order:status', onStatus);
    };
  }, [queryClient, onNewOrder]);
}
