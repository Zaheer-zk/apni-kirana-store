'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '@/lib/api';

interface AdminNotification {
  id: string;
  title: string;
  body: string;
  type?: string | null;
  isRead: boolean;
  createdAt: string;
  data?: Record<string, unknown> | null;
}

interface NotificationsListResponse {
  notifications: AdminNotification[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
  pages: number;
}

function unwrap<T>(payload: unknown): T | null {
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    if (o['data'] && typeof o['data'] === 'object') return o['data'] as T;
    return o as T;
  }
  return null;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Math.max(0, Date.now() - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Map a notification to a URL we can navigate to. Uses common keys we expect
 * the backend to embed in `data` (orderId / storeId / driverId), falling back
 * to a plain notifications listing.
 */
function notificationHref(n: AdminNotification): string {
  const d = n.data ?? {};
  if (typeof d['orderId'] === 'string') return `/orders/${d['orderId']}`;
  if (typeof d['storeId'] === 'string') return `/stores/${d['storeId']}`;
  if (typeof d['driverId'] === 'string') return `/drivers/${d['driverId']}`;
  if (typeof d['url'] === 'string') return d['url'] as string;
  return '/notifications';
}

export default function NotificationBell() {
  const qc = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-notifications', { page: 1, limit: 10 }],
    queryFn: async () => {
      const res = await api.get('/api/v1/notifications', {
        params: { page: 1, limit: 10 },
      });
      return unwrap<NotificationsListResponse>(res.data);
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;
  const badge = useMemo(() => {
    if (unreadCount <= 0) return null;
    return unreadCount > 9 ? '9+' : String(unreadCount);
  }, [unreadCount]);

  const markAllMutation = useMutation({
    mutationFn: async () => {
      await api.put('/api/v1/notifications/read-all');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-notifications'] });
    },
  });

  const markOneMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.put(`/api/v1/notifications/${id}/read`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-notifications'] });
    },
  });

  // Close the dropdown on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function handleItemClick(n: AdminNotification) {
    if (!n.isRead) markOneMutation.mutate(n.id);
    setOpen(false);
    router.push(notificationHref(n));
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-md text-gray-700 hover:bg-gray-100"
      >
        <Bell className="h-5 w-5" />
        {badge ? (
          <span className="absolute right-1.5 top-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-[340px] max-w-[92vw] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold text-gray-900">Notifications</p>
            <button
              type="button"
              onClick={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending || unreadCount === 0}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-3 w-2/3 rounded bg-gray-200" />
                    <div className="mt-2 h-2 w-full rounded bg-gray-100" />
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-gray-500">
                You&apos;re all caught up.
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleItemClick(n)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                        n.isRead ? '' : 'bg-primary-50/40'
                      }`}
                    >
                      <span
                        className={`mt-1.5 inline-block h-2 w-2 flex-shrink-0 rounded-full ${
                          n.isRead ? 'bg-transparent' : 'bg-primary'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {n.title}
                        </p>
                        <p className="line-clamp-2 text-xs text-gray-600">{n.body}</p>
                        <p className="mt-1 text-[11px] text-gray-400">
                          {relativeTime(n.createdAt)}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-gray-100 px-4 py-2.5 text-center">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-primary hover:underline"
            >
              View all
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
