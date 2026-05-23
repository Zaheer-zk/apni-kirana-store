'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  IndianRupee,
  Inbox,
  Package,
  Plus,
} from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@aks/ui/components/card';
import { Skeleton } from '@aks/ui/components/skeleton';
import type { StoreOrder, StoreDashboardStats } from '@aks/shared';
import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { EmptyPanel, ErrorPanel } from '@/components/StatePanels';
import { api } from '@/lib/api';
import { rupees, shortOrderId, timeAgo } from '@/lib/format';

/**
 * Dashboard — the landing page after login. Live tiles for today's orders /
 * revenue / pending acceptance, plus the list of active orders. Mirrors the
 * Expo store-portal dashboard screen-for-screen.
 */
export default function DashboardPage() {
  return (
    <AuthGuard>
      <AppShell>
        <div className="page-shell space-y-6">
          <Header />
          <StatTiles />
          <ActiveOrdersSection />
          <QuickLinks />
        </div>
      </AppShell>
    </AuthGuard>
  );
}

function Header() {
  return (
    <header className="flex flex-col gap-1 sm:gap-2">
      <span className="section-eyebrow">Today's snapshot</span>
      <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Dashboard</h1>
      <p className="text-sm text-gray-500">
        Track new orders, today's earnings and switch your store status from the top bar.
      </p>
    </header>
  );
}

function StatTiles() {
  const { data, isLoading, isError, refetch } = useQuery<StoreDashboardStats>({
    queryKey: ['storeStatsToday'],
    queryFn: async () => {
      const res = await api.get('/api/v1/stores/stats/today');
      return (res.data?.data ?? res.data) as StoreDashboardStats;
    },
    refetchInterval: 30_000,
  });

  if (isError) {
    return <ErrorPanel message="Couldn't load today's stats." onRetry={() => refetch()} />;
  }

  const tiles = [
    {
      icon: <Inbox className="h-5 w-5" />,
      label: 'Pending',
      value: data?.pending ?? 0,
      tone: 'amber',
    },
    {
      icon: <ClipboardList className="h-5 w-5" />,
      label: 'Orders today',
      value: data?.ordersReceived ?? 0,
      tone: 'primary',
    },
    {
      icon: <CheckCircle2 className="h-5 w-5" />,
      label: 'Completed',
      value: data?.ordersCompleted ?? 0,
      tone: 'green',
    },
    {
      icon: <IndianRupee className="h-5 w-5" />,
      label: "Today's revenue",
      value: rupees(data?.revenue ?? 0),
      tone: 'primary',
    },
  ];

  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardContent className="flex flex-col gap-2 p-4 sm:p-5">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                tile.tone === 'green'
                  ? 'bg-green-100 text-green-700'
                  : tile.tone === 'amber'
                  ? 'bg-amber-100 text-amber-700'
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

function ActiveOrdersSection() {
  const { data, isLoading, isError, refetch } = useQuery<StoreOrder[]>({
    queryKey: ['storeActiveOrders'],
    queryFn: async () => {
      const res = await api.get('/api/v1/stores/orders/active');
      const payload = res.data?.data ?? res.data;
      return Array.isArray(payload) ? (payload as StoreOrder[]) : [];
    },
    refetchInterval: 15_000,
  });

  return (
    <section>
      <header className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 sm:text-xl">Active orders</h2>
          <p className="text-xs text-gray-500">Orders currently in flight — accept, prepare, hand off.</p>
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
          title="You're all caught up"
          subtitle="New orders show up here in real time. Make sure your store is set to Open in the top bar."
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
                    {order.itemsCount} item{order.itemsCount !== 1 ? 's' : ''} · {order.deliveryArea}
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
      href: '/profile/edit',
      icon: <ClipboardList className="h-5 w-5" />,
      title: 'Edit store profile',
      body: 'Change your store name, hours, address or pin location.',
    },
  ];

  return (
    <section>
      <h2 className="mb-3 text-lg font-bold text-gray-900 sm:text-xl">Quick links</h2>
      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
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
