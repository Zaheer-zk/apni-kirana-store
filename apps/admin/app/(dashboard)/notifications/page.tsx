'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCheck, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
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

type FilterValue = 'all' | 'unread' | 'read';

function unwrap<T>(payload: unknown): T | null {
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    if (o['data'] && typeof o['data'] === 'object') return o['data'] as T;
    return o as T;
  }
  return null;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
}

function notificationHref(n: AdminNotification): string | null {
  const d = n.data ?? {};
  if (typeof d['orderId'] === 'string') return `/orders/${d['orderId']}`;
  if (typeof d['storeId'] === 'string') return `/stores/${d['storeId']}`;
  if (typeof d['driverId'] === 'string') return `/drivers/${d['driverId']}`;
  if (typeof d['url'] === 'string') return d['url'] as string;
  return null;
}

const PAGE_SIZE = 20;

const FILTER_OPTIONS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
];

export default function NotificationsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<FilterValue>('all');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-notifications', { page, limit: PAGE_SIZE }],
    queryFn: async () => {
      const res = await api.get('/api/v1/notifications', {
        params: { page, limit: PAGE_SIZE },
      });
      return unwrap<NotificationsListResponse>(res.data);
    },
    refetchInterval: 30_000,
  });

  const allRows = data?.notifications ?? [];
  const totalPages = data?.pages ?? 1;
  const unreadCount = data?.unreadCount ?? 0;

  const rows = useMemo(() => {
    if (filter === 'unread') return allRows.filter((n) => !n.isRead);
    if (filter === 'read') return allRows.filter((n) => n.isRead);
    return allRows;
  }, [allRows, filter]);

  const markAllMutation = useMutation({
    mutationFn: async () => {
      await api.put('/api/v1/notifications/read-all');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-notifications'] }),
  });

  const markOneMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.put(`/api/v1/notifications/${id}/read`);
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['admin-notifications'] });
      const key = ['admin-notifications', { page, limit: PAGE_SIZE }] as const;
      const prev = qc.getQueryData<NotificationsListResponse>(key);
      if (prev) {
        qc.setQueryData<NotificationsListResponse>(key, {
          ...prev,
          unreadCount: Math.max(0, prev.unreadCount - 1),
          notifications: prev.notifications.map((n) =>
            n.id === id ? { ...n, isRead: true } : n,
          ),
        });
      }
      return { prev, key };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin-notifications'] }),
  });

  function handleRowNav(n: AdminNotification) {
    if (!n.isRead) markOneMutation.mutate(n.id);
    const href = notificationHref(n);
    if (href) router.push(href);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Bell className="h-6 w-6 text-primary" />
            Notifications
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {unreadCount > 0
              ? `You have ${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}.`
              : 'You are all caught up.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => markAllMutation.mutate()}
          disabled={markAllMutation.isPending || unreadCount === 0}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {markAllMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCheck className="h-4 w-4" />
          )}
          Mark all read
        </button>
      </header>

      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setFilter(opt.value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              filter === opt.value
                ? 'border-primary bg-primary text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : isError ? (
          <div className="px-6 py-10 text-center text-sm text-red-500">
            Failed to load notifications.
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-gray-500">
            {filter === 'unread'
              ? 'No unread notifications.'
              : filter === 'read'
                ? 'No read notifications on this page.'
                : 'No notifications yet.'}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map((n) => {
              const href = notificationHref(n);
              const clickable = !!href;
              return (
                <li
                  key={n.id}
                  className={`group flex items-start gap-3 px-5 py-4 transition-colors ${
                    n.isRead ? '' : 'bg-primary-50/40'
                  } ${clickable ? 'hover:bg-gray-50' : ''}`}
                >
                  <span
                    className={`mt-1.5 inline-block h-2 w-2 flex-shrink-0 rounded-full ${
                      n.isRead ? 'bg-transparent' : 'bg-primary'
                    }`}
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    onClick={() => clickable && handleRowNav(n)}
                    className={`min-w-0 flex-1 text-left ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <p className="text-sm font-semibold text-gray-900">{n.title}</p>
                    <p className="mt-0.5 text-sm text-gray-600">{n.body}</p>
                    <p className="mt-1 text-xs text-gray-400">{formatTime(n.createdAt)}</p>
                  </button>
                  {!n.isRead ? (
                    <button
                      type="button"
                      onClick={() => markOneMutation.mutate(n.id)}
                      disabled={markOneMutation.isPending}
                      className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      aria-label="Mark as read"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Mark read
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <p className="text-gray-500">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
