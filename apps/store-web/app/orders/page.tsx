'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Inbox } from 'lucide-react';
import { Skeleton } from '@aks/ui/components/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@aks/ui/components/tabs';
import type { OrderStatus, StoreOrder } from '@aks/shared';
import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { EmptyPanel, ErrorPanel } from '@/components/StatePanels';
import { api } from '@/lib/api';
import { rupees, shortOrderId, timeAgo } from '@/lib/format';

type TabKey = 'pending' | 'accepted' | 'picked-up' | 'delivered';

const TAB_STATUSES: Record<TabKey, OrderStatus[]> = {
  pending: ['PENDING' as OrderStatus],
  accepted: ['STORE_ACCEPTED' as OrderStatus, 'DRIVER_ASSIGNED' as OrderStatus],
  'picked-up': ['PICKED_UP' as OrderStatus],
  delivered: ['DELIVERED' as OrderStatus, 'CANCELLED' as OrderStatus, 'REJECTED' as OrderStatus],
};

const TAB_LABELS: Record<TabKey, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  'picked-up': 'Picked up',
  delivered: 'Completed',
};

const EMPTY_COPY: Record<TabKey, { title: string; subtitle: string }> = {
  pending: {
    title: 'No incoming orders',
    subtitle: 'New orders show up here in real time when your store is open.',
  },
  accepted: {
    title: 'No active orders',
    subtitle: 'Orders being prepared or waiting on a driver show up here.',
  },
  'picked-up': {
    title: 'Nothing out for delivery',
    subtitle: 'Once a driver picks up an order it will appear here until delivered.',
  },
  delivered: {
    title: 'No completed orders yet',
    subtitle: 'Past orders (delivered, cancelled or rejected) show up here.',
  },
};

export default function OrdersPage() {
  return (
    <AuthGuard>
      <AppShell>
        <div className="page-shell space-y-4">
          <header className="space-y-1">
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Orders</h1>
            <p className="text-sm text-gray-500">
              Accept new orders, mark them ready for pickup and follow them until delivery.
            </p>
          </header>

          <Tabs defaultValue="pending" className="space-y-4">
            {/* Horizontal scroll on phones — the four tabs don't fit at 360px */}
            <div className="-mx-1 overflow-x-auto px-1">
              <TabsList className="inline-flex w-auto">
                {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
                  <TabsTrigger key={key} value={key} className="px-4">
                    {TAB_LABELS[key]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
              <TabsContent key={key} value={key} className="space-y-3">
                <OrdersList tab={key} />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </AppShell>
    </AuthGuard>
  );
}

function OrdersList({ tab }: { tab: TabKey }) {
  const statuses = TAB_STATUSES[tab];

  const { data, isLoading, isError, refetch } = useQuery<StoreOrder[]>({
    queryKey: ['storeOrders', tab],
    queryFn: async () => {
      const res = await api.get('/api/v1/stores/orders', {
        params: { statuses: statuses.join(',') },
      });
      const payload = res.data?.data ?? res.data;
      return Array.isArray(payload) ? (payload as StoreOrder[]) : [];
    },
    refetchInterval: tab === 'delivered' ? false : 15_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <ErrorPanel message="Couldn't load orders." onRetry={() => refetch()} />;
  }

  if (!data || data.length === 0) {
    const empty = EMPTY_COPY[tab];
    return (
      <EmptyPanel icon={<Inbox className="h-6 w-6" />} title={empty.title} subtitle={empty.subtitle} />
    );
  }

  return (
    <ul className="space-y-3">
      {data.map((order) => (
        <li key={order.id}>
          <Link
            href={`/orders/${order.id}`}
            className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-primary-200 hover:shadow"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
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
  );
}
