'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  Clock3,
  IndianRupee,
  Inbox,
  Package,
  Plus,
  Timer,
  Truck,
  XCircle,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@aks/ui/components/card';
import { Skeleton } from '@aks/ui/components/skeleton';
import { Badge } from '@aks/ui/components/badge';
import { toast } from '@aks/ui/components/sonner';
import type { StoreOrder, StoreDashboardStats } from '@aks/shared';
import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { EmptyPanel, ErrorPanel } from '@/components/StatePanels';
import { api } from '@/lib/api';
import { getStoredStore } from '@/lib/auth';
import { rupees, shortOrderId, timeAgo } from '@/lib/format';
import { useStoreOrdersSocket } from '@/lib/useOrderSocket';
import { playNewOrderChime } from '@/lib/sound';

const SOUND_PREF_KEY = 'aks_store_sound_alerts';

/**
 * Dashboard — the landing page after login. Hosts:
 *
 *   - Stat tiles (pending, today's orders, completed, revenue, avg fulfilment)
 *   - "New orders" section with inline accept/reject so the operator never
 *     has to click into the detail view for the happy path.
 *   - "In progress" section with anything mid-fulfilment.
 *   - Operating hours / store status card.
 *
 * Socket.io subscription fires a toast + audible chime when a new PENDING
 * order arrives so the operator can react even with the page in the
 * background tab.
 */
export default function DashboardPage() {
  return (
    <AuthGuard>
      <AppShell>
        <DashboardInner />
      </AppShell>
    </AuthGuard>
  );
}

function DashboardInner() {
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  // Track which order IDs we've already announced so socket replays don't
  // double-chime. Lives in a ref because we don't need re-renders for it.
  const announcedRef = useRef<Set<string>>(new Set());

  // Restore the sound preference from localStorage on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(SOUND_PREF_KEY);
    setSoundEnabled(stored === '1');
  }, []);

  function toggleSound() {
    setSoundEnabled((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(SOUND_PREF_KEY, next ? '1' : '0');
      }
      // Play once on enable so the operator confirms the chime works (and
      // satisfies the browser's user-gesture requirement for AudioContext).
      if (next) playNewOrderChime();
      return next;
    });
  }

  // Pop a toast + (optionally) a chime when the socket reports a new PENDING
  // order. We dedupe via the announcedRef set so multiple subscribers don't
  // multi-fire.
  useStoreOrdersSocket((payload) => {
    if (announcedRef.current.has(payload.orderId)) return;
    announcedRef.current.add(payload.orderId);
    if (soundEnabled) playNewOrderChime();
    toast('New order received', {
      description: `${shortOrderId(payload.orderId)} is awaiting your acceptance.`,
      action: {
        label: 'View',
        onClick: () => {
          window.location.href = `/orders/${payload.orderId}`;
        },
      },
    });
  });

  return (
    <div className="page-shell space-y-6">
      <Header soundEnabled={soundEnabled} onToggleSound={toggleSound} />
      <StatTiles />
      <NewOrdersSection />
      <InProgressSection />
      <OperatingHoursCard />
      <QuickLinks />
    </div>
  );
}

function Header({
  soundEnabled,
  onToggleSound,
}: {
  soundEnabled: boolean;
  onToggleSound: () => void;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <span className="section-eyebrow">Today's snapshot</span>
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Dashboard</h1>
        <p className="text-sm text-gray-500">
          Live view of incoming orders, today's earnings and store status.
        </p>
      </div>
      <Button
        type="button"
        variant={soundEnabled ? 'default' : 'outline'}
        size="sm"
        onClick={onToggleSound}
        className="gap-2"
        aria-pressed={soundEnabled}
      >
        {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        Sound alerts {soundEnabled ? 'on' : 'off'}
      </Button>
    </header>
  );
}

interface DashboardStatsExtra extends StoreDashboardStats {
  avgFulfillmentMinutes?: number;
}

function StatTiles() {
  const { data, isLoading, isError, refetch } = useQuery<DashboardStatsExtra>({
    queryKey: ['storeStatsToday'],
    queryFn: async () => {
      const res = await api.get('/api/v1/stores/stats/today');
      return (res.data?.data ?? res.data) as DashboardStatsExtra;
    },
    refetchInterval: 30_000,
  });

  if (isError) {
    return <ErrorPanel message="Couldn't load today's stats." onRetry={() => refetch()} />;
  }

  const tiles = [
    {
      icon: <Inbox className="h-5 w-5" />,
      label: 'Awaiting accept',
      value: data?.pending ?? 0,
      tone: 'amber' as const,
    },
    {
      icon: <ClipboardList className="h-5 w-5" />,
      label: 'Orders today',
      value: data?.ordersReceived ?? 0,
      tone: 'primary' as const,
    },
    {
      icon: <CheckCircle2 className="h-5 w-5" />,
      label: 'Completed',
      value: data?.ordersCompleted ?? 0,
      tone: 'green' as const,
    },
    {
      icon: <IndianRupee className="h-5 w-5" />,
      label: "Today's revenue",
      value: rupees(data?.revenue ?? 0),
      tone: 'primary' as const,
    },
    {
      icon: <Timer className="h-5 w-5" />,
      label: 'Avg fulfilment',
      // Only render if backend ever ships avgFulfillmentMinutes — otherwise
      // hide the tile altogether so we're not staring at "—" forever.
      value:
        typeof data?.avgFulfillmentMinutes === 'number'
          ? `${data.avgFulfillmentMinutes} min`
          : '—',
      tone: 'gray' as const,
      hidden: typeof data?.avgFulfillmentMinutes !== 'number',
    },
  ];

  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
      {tiles
        .filter((t) => !t.hidden)
        .map((tile) => (
          <Card key={tile.label}>
            <CardContent className="flex flex-col gap-2 p-4 sm:p-5">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                  tile.tone === 'green'
                    ? 'bg-green-100 text-green-700'
                    : tile.tone === 'amber'
                    ? 'bg-amber-100 text-amber-700'
                    : tile.tone === 'gray'
                    ? 'bg-gray-100 text-gray-700'
                    : 'bg-primary-100 text-primary'
                }`}
              >
                {tile.icon}
              </div>
              {isLoading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <span className="text-xl font-bold text-gray-900 sm:text-2xl">{tile.value}</span>
              )}
              <span className="text-xs font-medium text-gray-500">{tile.label}</span>
            </CardContent>
          </Card>
        ))}
    </section>
  );
}

function NewOrdersSection() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery<StoreOrder[]>({
    queryKey: ['storeOrders', 'pending'],
    queryFn: async () => {
      const res = await api.get('/api/v1/stores/orders', {
        params: { statuses: 'PENDING' },
      });
      const payload = res.data?.data ?? res.data;
      return Array.isArray(payload) ? (payload as StoreOrder[]) : [];
    },
    refetchInterval: 15_000,
  });

  const accept = useMutation({
    mutationFn: (orderId: string) =>
      api.put(`/api/v1/orders/${orderId}/accept`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storeOrders'] });
      queryClient.invalidateQueries({ queryKey: ['storeActiveOrders'] });
      queryClient.invalidateQueries({ queryKey: ['storeStatsToday'] });
      toast.success('Order accepted');
    },
    onError: (err: Error) => toast.error(err.message || 'Could not accept order'),
  });

  const reject = useMutation({
    mutationFn: (orderId: string) =>
      api
        .put(`/api/v1/orders/${orderId}/reject`, { reason: 'Cannot fulfill right now' })
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storeOrders'] });
      queryClient.invalidateQueries({ queryKey: ['storeStatsToday'] });
      toast.success('Order rejected and re-broadcast');
    },
    onError: (err: Error) => toast.error(err.message || 'Could not reject order'),
  });

  const orders = data ?? [];

  return (
    <section>
      <header className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900 sm:text-xl">
            <Bell className="h-5 w-5 text-amber-600" /> New orders
            {orders.length > 0 ? (
              <Badge variant="warning" className="ml-1">
                {orders.length}
              </Badge>
            ) : null}
          </h2>
          <p className="text-xs text-gray-500">
            Accept or reject quickly — orders re-broadcast to other stores after a few minutes.
          </p>
        </div>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorPanel message="Couldn't load new orders." onRetry={() => refetch()} />
      ) : orders.length === 0 ? (
        <EmptyPanel
          icon={<CircleDashed className="h-6 w-6 text-primary" />}
          title="No new orders right now"
          subtitle="Once a customer places an order matched to your store you'll see it here in real time."
        />
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => {
            const isBusy =
              (accept.isPending && accept.variables === order.id) ||
              (reject.isPending && reject.variables === order.id);
            return (
              <li
                key={order.id}
                className="rounded-xl border-2 border-amber-300 bg-amber-50/40 p-4 shadow-sm"
              >
                <Link
                  href={`/orders/${order.id}`}
                  className="block focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-gray-900">
                          {shortOrderId(order.id)}
                        </span>
                        <OrderStatusBadge status={order.status} />
                      </div>
                      <p className="mt-1 truncate text-sm text-gray-700">
                        {order.itemsCount} item{order.itemsCount !== 1 ? 's' : ''} ·{' '}
                        {order.deliveryArea}
                      </p>
                      <p className="text-xs text-gray-500">{timeAgo(order.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-primary">{rupees(order.total)}</p>
                    </div>
                  </div>
                </Link>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr]">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-red-200 text-red-700 hover:bg-red-50"
                    disabled={isBusy}
                    onClick={() => reject.mutate(order.id)}
                  >
                    <XCircle className="h-4 w-4" /> Reject
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isBusy}
                    loading={accept.isPending && accept.variables === order.id}
                    onClick={() => accept.mutate(order.id)}
                  >
                    <CheckCircle2 className="h-4 w-4" /> Accept
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function InProgressSection() {
  const { data, isLoading, isError, refetch } = useQuery<StoreOrder[]>({
    queryKey: ['storeActiveOrders'],
    queryFn: async () => {
      const res = await api.get('/api/v1/stores/orders/active');
      const payload = res.data?.data ?? res.data;
      const list = Array.isArray(payload) ? (payload as StoreOrder[]) : [];
      // Backend's /orders/active returns PENDING + active. We've already
      // surfaced PENDING above, so strip them here to avoid double-rendering.
      return list.filter((o) => o.status !== 'PENDING');
    },
    refetchInterval: 15_000,
  });

  return (
    <section>
      <header className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900 sm:text-xl">
            <Truck className="h-5 w-5 text-primary" /> In progress
          </h2>
          <p className="text-xs text-gray-500">Accepted, being prepared or out for delivery.</p>
        </div>
        <Link
          href="/orders"
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary-700"
        >
          View all <ArrowRight className="h-4 w-4" />
        </Link>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorPanel message="Couldn't load active orders." onRetry={() => refetch()} />
      ) : !data || data.length === 0 ? (
        <EmptyPanel
          icon={<CheckCircle2 className="h-6 w-6 text-primary" />}
          title="Nothing in progress"
          subtitle="Accepted orders show up here while they're being prepared or delivered."
        />
      ) : (
        <ul className="space-y-3">
          {data.map((order) => (
            <li key={order.id}>
              <Link
                href={`/orders/${order.id}`}
                className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-primary-200 hover:shadow"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-gray-700">
                      {shortOrderId(order.id)}
                    </span>
                    <OrderStatusBadge status={order.status} />
                  </div>
                  <p className="mt-1 truncate text-sm text-gray-600">
                    {order.itemsCount} item{order.itemsCount !== 1 ? 's' : ''} ·{' '}
                    {order.deliveryArea}
                  </p>
                  <p className="text-xs text-gray-400">{timeAgo(order.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-primary">{rupees(order.total)}</p>
                  <ArrowRight className="ml-auto h-4 w-4 text-gray-400" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OperatingHoursCard() {
  // Pulls from the cached store profile populated by AppShell's storeMe
  // query — no extra request needed.
  const [hours, setHours] = useState<{ openTime?: string; closeTime?: string; isOpen?: boolean } | null>(
    null,
  );
  useEffect(() => {
    const s = getStoredStore();
    if (!s) return;
    setHours({ openTime: s.openTime, closeTime: s.closeTime, isOpen: s.isOpen });
  }, []);

  const status = useMemo(() => computeOpenStatus(hours), [hours]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock3 className="h-4 w-4 text-primary" /> Operating hours
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 sm:flex sm:items-center sm:justify-between sm:space-y-0">
        <div>
          <p className="text-sm text-gray-900">
            {hours?.openTime ?? '09:00'} – {hours?.closeTime ?? '21:00'}
          </p>
          <p className="text-xs text-gray-500">
            {hours?.isOpen
              ? `Open now — ${status.label}`
              : `Closed — ${status.label}`}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/profile/edit" className="gap-1">
            Edit hours
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function computeOpenStatus(
  hours: { openTime?: string; closeTime?: string; isOpen?: boolean } | null,
): { label: string } {
  if (!hours?.openTime || !hours?.closeTime) {
    return { label: 'set your hours in profile' };
  }
  const now = new Date();
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const open = parseHHMM(hours.openTime);
  const close = parseHHMM(hours.closeTime);
  if (open == null || close == null) return { label: 'check your hours' };

  if (close >= open) {
    if (minutesNow < open) return { label: `opens at ${hours.openTime}` };
    if (minutesNow >= close) return { label: `closed at ${hours.closeTime}` };
    return { label: `closes at ${hours.closeTime}` };
  }
  // Overnight (e.g. 22:00 → 02:00)
  if (minutesNow >= open || minutesNow < close) {
    return { label: `closes at ${hours.closeTime}` };
  }
  return { label: `opens at ${hours.openTime}` };
}

function parseHHMM(s: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = parseInt(m[1]!, 10);
  const min = parseInt(m[2]!, 10);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

function QuickLinks() {
  const links = [
    {
      href: '/inventory/browse-catalog',
      icon: <Plus className="h-5 w-5" />,
      title: 'Add items',
      body: 'Pick from the master catalog and set your price.',
    },
    {
      href: '/inventory',
      icon: <Package className="h-5 w-5" />,
      title: 'Manage inventory',
      body: 'Update prices and stock for your existing items.',
    },
    {
      href: '/earnings',
      icon: <IndianRupee className="h-5 w-5" />,
      title: 'Earnings',
      body: 'Today, this week and the full payout history.',
    },
    {
      href: '/settings',
      icon: <ClipboardList className="h-5 w-5" />,
      title: 'Settings',
      body: 'Operating hours, notifications and account.',
    },
  ];

  return (
    <section>
      <h2 className="mb-3 text-lg font-bold text-gray-900 sm:text-xl">Quick links</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
        {links.map((link) => (
          <Card key={link.href}>
            <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 text-primary">
                {link.icon}
              </div>
              <CardTitle className="text-base">{link.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-gray-600">{link.body}</p>
              <Button asChild variant="outline" size="sm">
                <Link href={link.href} className="gap-1">
                  Open <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
