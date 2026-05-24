'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronRight, Loader2, Receipt, ShoppingBag, Store } from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Card, CardContent } from '@aks/ui/components/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@aks/ui/components/tabs';
import { AppHeader } from '@/components/AppHeader';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { EmptyPanel, ErrorPanel, PageLoader } from '@/components/StatePanels';
import {
  fetchOrdersPage,
  isActiveOrder,
  isCancelledOrRejected,
  type CustomerOrder,
} from '@/lib/orders';
import { rupees } from '@/lib/format';
import { useUser } from '@/lib/use-user';

const PAGE_LIMIT = 20;

type Tab = 'active' | 'past' | 'cancelled';

export default function OrdersPage() {
  const { user, mounted } = useUser({ redirectTo: '/orders' });

  const ordersQuery = useInfiniteQuery({
    queryKey: ['my-orders'],
    queryFn: ({ pageParam }) => fetchOrdersPage(pageParam as number, PAGE_LIMIT),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    refetchOnMount: 'always',
    staleTime: 0,
    enabled: !!user,
  });

  const allOrders = useMemo(
    () => (ordersQuery.data?.pages ?? []).flatMap((p) => p.orders),
    [ordersQuery.data],
  );

  // Sort newest-first across all loaded pages (backend already orders by
  // createdAt desc, but re-sorting is cheap and defensive).
  const sorted = useMemo(
    () => [...allOrders].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [allOrders],
  );

  const buckets = useMemo(() => {
    const active: CustomerOrder[] = [];
    const past: CustomerOrder[] = [];
    const cancelled: CustomerOrder[] = [];
    for (const o of sorted) {
      if (isCancelledOrRejected(o)) cancelled.push(o);
      else if (isActiveOrder(o)) active.push(o);
      else past.push(o);
    }
    return { active, past, cancelled };
  }, [sorted]);

  if (!mounted || !user) {
    return (
      <>
        <AppHeader showSearch={false} />
        <main className="page-shell py-10">
          <PageLoader />
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader showSearch={false} />
      <main className="page-shell py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">My orders</h1>
          <p className="mt-1 text-sm text-gray-500">Track active orders and revisit your history.</p>
        </header>

        {ordersQuery.isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : ordersQuery.isError ? (
          <ErrorPanel
            message={
              ordersQuery.error instanceof Error
                ? ordersQuery.error.message
                : 'Could not load your orders.'
            }
            onRetry={() => ordersQuery.refetch()}
          />
        ) : sorted.length === 0 ? (
          <EmptyPanel
            icon={<Receipt className="h-6 w-6" />}
            title="No orders yet"
            subtitle="Place your first order to see it here."
            action={
              <Button asChild>
                <Link href="/">Start shopping</Link>
              </Button>
            }
          />
        ) : (
          <Tabs defaultValue="active" className="w-full">
            <TabsList className="grid w-full grid-cols-3 sm:max-w-md">
              <TabsTrigger value="active">
                Active{buckets.active.length ? ` (${buckets.active.length})` : ''}
              </TabsTrigger>
              <TabsTrigger value="past">
                Past{buckets.past.length ? ` (${buckets.past.length})` : ''}
              </TabsTrigger>
              <TabsTrigger value="cancelled">
                Cancelled{buckets.cancelled.length ? ` (${buckets.cancelled.length})` : ''}
              </TabsTrigger>
            </TabsList>

            <TabContent name="active" orders={buckets.active} emptyHint="No active orders right now." />
            <TabContent name="past" orders={buckets.past} emptyHint="No completed orders yet." />
            <TabContent
              name="cancelled"
              orders={buckets.cancelled}
              emptyHint="No cancelled or rejected orders."
            />
          </Tabs>
        )}

        {ordersQuery.hasNextPage ? (
          <div className="mt-6 flex justify-center">
            <Button
              variant="outline"
              onClick={() => ordersQuery.fetchNextPage()}
              loading={ordersQuery.isFetchingNextPage}
            >
              Load more
            </Button>
          </div>
        ) : null}
      </main>
    </>
  );
}

function TabContent({
  name,
  orders,
  emptyHint,
}: {
  name: Tab;
  orders: CustomerOrder[];
  emptyHint: string;
}) {
  return (
    <TabsContent value={name} className="pt-4">
      {orders.length === 0 ? (
        <EmptyPanel
          icon={<ShoppingBag className="h-6 w-6" />}
          title="Nothing here"
          subtitle={emptyHint}
        />
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => (
            <li key={order.id}>
              <OrderRow order={order} />
            </li>
          ))}
        </ul>
      )}
    </TabsContent>
  );
}

function OrderRow({ order }: { order: CustomerOrder }) {
  const itemsCount = order.items.reduce((sum, i) => sum + i.qty, 0);
  const summary = order.items.slice(0, 3).map((i) => i.name).join(', ');
  const more = order.items.length - 3;
  const when = new Date(order.createdAt).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <Link href={`/orders/${order.id}`} className="block">
      <Card className="border-gray-200 transition hover:border-primary-200 hover:shadow-md">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Store className="h-4 w-4 text-primary" />
              {order.store?.name ?? 'Order'}
              <span className="text-xs font-normal text-gray-500">
                #{order.id.slice(-6).toUpperCase()}
              </span>
            </div>
            <OrderStatusBadge status={order.status} />
          </div>

          <p className="mt-2 line-clamp-2 text-sm text-gray-600">
            {itemsCount} {itemsCount === 1 ? 'item' : 'items'}
            {summary ? `: ${summary}` : null}
            {more > 0 ? ` +${more} more` : ''}
          </p>

          <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
            <span>{when}</span>
            <span className="inline-flex items-center gap-1 text-sm font-bold text-gray-900">
              {rupees(order.total)}
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
