'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, unwrapList } from './api';

// Mirrors `apps/store-portal/app/notifications/index.tsx` and the analogous
// hook in apps/driver-web/lib/notifications.ts. Same backend endpoints so a
// notification read on mobile shows up as read on web.

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
}

export async function fetchNotifications(): Promise<AppNotification[]> {
  try {
    const res = await api.get('/api/v1/notifications');
    return unwrapList<AppNotification>(res.data, 'notifications');
  } catch {
    return [];
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.put(`/api/v1/notifications/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.put('/api/v1/notifications/read-all');
}

/** Unread count for the header bell badge. Polls every 30s. */
export function useUnreadNotificationsCount(): number {
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotifications,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  return useMemo(
    () => (data ?? []).filter((n) => !n.isRead).length,
    [data],
  );
}

export function notificationCategory(n: AppNotification): {
  icon: 'order' | 'payout' | 'promo' | 'system';
} {
  const event =
    typeof n.data?.event === 'string' ? (n.data.event as string).toLowerCase() : '';
  const title = (n.title ?? '').toLowerCase();
  const hay = `${event} ${title}`;
  if (/promo|coupon|discount|offer/.test(hay)) return { icon: 'promo' };
  if (/payout|earning|paid|wallet/.test(hay)) return { icon: 'payout' };
  if (/order|delivery|pickup|drop/.test(hay)) return { icon: 'order' };
  return { icon: 'system' };
}
