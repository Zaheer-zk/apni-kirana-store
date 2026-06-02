'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  CheckCheck,
  IndianRupee,
  Loader2,
  Package,
  Tag,
} from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Card, CardContent } from '@aks/ui/components/card';
import { Skeleton } from '@aks/ui/components/skeleton';
import { toast } from '@aks/ui/components/sonner';
import { cn } from '@aks/ui/lib/utils';
import { AppHeader } from '@/components/AppHeader';
import { RequireAuth } from '@/components/RequireAuth';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationCategory,
  type AppNotification,
} from '@/lib/notifications';

// Mirrors the mobile driver app's notifications inbox
// (apps/driver/app/notifications/index.tsx). Same backend endpoints, same
// data shape — keeps both surfaces in lockstep so a driver who reads a
// notification on web sees it as read on mobile and vice versa.
export default function NotificationsPage() {
  return (
    <RequireAuth>
      <div className="flex min-h-screen flex-col bg-gray-50">
        <AppHeader />
        <main className="page-shell flex-1 py-6">
          <Inner />
        </main>
      </div>
    </RequireAuth>
  );
}

function Inner() {
  const queryClient = useQueryClient();
  const query = useQuery<AppNotification[]>({
    queryKey: ['notifications'],
    queryFn: fetchNotifications,
    refetchInterval: 30_000,
  });

  const notifications = query.data ?? [];
  const unread = notifications.filter((n) => !n.isRead).length;

  const markOne = useMutation({
    mutationFn: markNotificationRead,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });
      const prev = queryClient.getQueryData<AppNotification[]>(['notifications']);
      queryClient.setQueryData<AppNotification[]>(['notifications'], (old) =>
        (old ?? []).map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['notifications'], ctx.prev);
    },
  });

  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('All caught up');
    },
    onError: (err: Error) => toast.error(err.message || 'Could not mark all read'),
  });

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Bell className="h-6 w-6 text-primary" />
            Notifications
          </h1>
          <p className="text-sm text-gray-500">
            {unread === 0
              ? 'You are all caught up.'
              : `${unread} unread message${unread === 1 ? '' : 's'}.`}
          </p>
        </div>
        {unread > 0 ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending}
          >
            {markAll.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4" />
            )}
            Mark all read
          </Button>
        ) : null}
      </header>

      {query.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
              <Bell className="h-7 w-7 text-gray-400" />
            </div>
            <p className="text-sm font-bold text-gray-900">No notifications yet</p>
            <p className="max-w-sm text-xs text-gray-500">
              Offers, payouts, and account updates show up here. Push notifications
              fire on your mobile app and inside this browser tab.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <NotificationRow
              key={n.id}
              n={n}
              onClick={() => {
                if (!n.isRead) markOne.mutate(n.id);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function NotificationRow({
  n,
  onClick,
}: {
  n: AppNotification;
  onClick: () => void;
}) {
  const { icon } = notificationCategory(n);
  const Icon =
    icon === 'order' ? Package : icon === 'payout' ? IndianRupee : icon === 'promo' ? Tag : Bell;
  const tint =
    icon === 'order'
      ? 'bg-primary-50 text-primary'
      : icon === 'payout'
        ? 'bg-emerald-50 text-emerald-700'
        : icon === 'promo'
          ? 'bg-amber-50 text-amber-700'
          : 'bg-gray-100 text-gray-600';

  // Notifications can carry a `data.url` (relative path) the row links to.
  const url =
    typeof n.data?.url === 'string' && n.data.url.startsWith('/')
      ? (n.data.url as string)
      : null;

  const inner = (
    <Card
      className={cn(
        'transition hover:border-gray-300',
        !n.isRead && 'border-primary/30 bg-primary/[0.02]',
      )}
    >
      <CardContent className="flex items-start gap-3 p-4">
        <div className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full', tint)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{n.title}</p>
          {n.body ? <p className="mt-0.5 text-sm text-gray-600">{n.body}</p> : null}
          <p className="mt-1 text-xs text-gray-400">{relativeTime(n.createdAt)}</p>
        </div>
        {!n.isRead ? (
          <span className="mt-1 inline-block h-2 w-2 flex-shrink-0 rounded-full bg-primary" aria-label="Unread" />
        ) : null}
      </CardContent>
    </Card>
  );

  if (url) {
    return (
      <li>
        <Link href={url as never} onClick={onClick}>
          {inner}
        </Link>
      </li>
    );
  }
  return (
    <li>
      <button type="button" onClick={onClick} className="w-full text-left">
        {inner}
      </button>
    </li>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 30) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  try {
    return new Date(iso).toLocaleDateString('en-IN');
  } catch {
    return '';
  }
}
