'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ChevronLeft, MapPin, Store as StoreIcon } from 'lucide-react';
import { Card, CardContent } from '@aks/ui/components/card';
import { Separator } from '@aks/ui/components/separator';
import { AppHeader } from '@/components/AppHeader';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { ErrorPanel, PageLoader } from '@/components/StatePanels';
import { fetchOrderGroup, type OrderGroupRollup } from '@/lib/orders';
import { rupees } from '@/lib/format';
import { useUser } from '@/lib/use-user';

/**
 * Customer rollup for a multi-store order. POST /orders splits cross-
 * store carts into one OrderGroup + N child Orders (one per fulfilling
 * store) — this screen renders the parent + per-store sub-rows so the
 * customer sees:
 *
 *   "Your order across 3 stores · ₹612 total · single delivery"
 *   ┌─ Store A · Accepted · 3 items · ₹240
 *   ├─ Store B · Pending  · 1 item  · ₹80
 *   └─ Store C · Driver assigned · 2 items · ₹292
 *
 * Each row deep-links to the per-leg detail page so the customer can
 * see each store's timeline + cancel just that leg without nuking the
 * whole basket.
 */
export default function OrderGroupPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { mounted, user } = useUser({ redirectTo: `/orders/group/${id}` });

  const { data, isLoading, isError, refetch } = useQuery<OrderGroupRollup>({
    queryKey: ['order-group', id],
    queryFn: () => fetchOrderGroup(id),
    enabled: !!id && !!user,
    refetchInterval: 15_000,
  });

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

  if (isLoading) {
    return (
      <>
        <AppHeader showSearch={false} />
        <main className="page-shell py-10">
          <PageLoader />
        </main>
      </>
    );
  }

  if (isError || !data) {
    return (
      <>
        <AppHeader showSearch={false} />
        <main className="page-shell py-10">
          <ErrorPanel
            message="Couldn't load this order group."
            onRetry={() => refetch()}
          />
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader showSearch={false} />
      <main className="page-shell py-6">
        <Link
          href="/orders"
          className="-ml-2 mb-3 inline-flex items-center gap-1 text-sm font-semibold text-gray-600 hover:text-gray-900"
        >
          <ChevronLeft className="h-4 w-4" />
          All orders
        </Link>

        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Your order across {data.orders.length} store
            {data.orders.length === 1 ? '' : 's'}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
            <span>#{data.id.slice(-8).toUpperCase()}</span>
            <span aria-hidden>·</span>
            <span>{rupees(data.total)} total · single delivery</span>
            <span aria-hidden>·</span>
            <OrderStatusBadge status={data.status as Parameters<typeof OrderStatusBadge>[0]['status']} />
          </div>
        </header>

        {/* Aggregate summary card — what the customer is actually paying. */}
        <Card className="mb-4">
          <CardContent className="space-y-2 p-5">
            <Row label="Items subtotal" value={rupees(data.subtotal)} />
            <Row label="Delivery fee" value={rupees(data.deliveryFee)} />
            <Separator />
            <Row label="Total" value={rupees(data.total)} bold />
            <p className="pt-2 text-xs text-gray-500">
              One driver picks up from each store and brings everything to
              you in a single delivery. Pickup ETAs may differ; the final
              delivery happens once all pickups are complete.
            </p>
          </CardContent>
        </Card>

        {/* Per-store legs */}
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Per-store status
        </h2>
        <div className="space-y-3">
          {data.orders.map((leg) => (
            <Link
              key={leg.id}
              href={`/orders/${leg.id}`}
              className="block transition hover:no-underline"
            >
              <Card className="hover:border-gray-300 hover:shadow-md">
                <CardContent className="flex items-center gap-4 p-4 sm:p-5">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
                    <StoreIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900">
                        {leg.store?.name ?? 'Store'}
                      </p>
                      <OrderStatusBadge
                        status={leg.status as Parameters<typeof OrderStatusBadge>[0]['status']}
                      />
                    </div>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                      <MapPin className="h-3 w-3" />
                      {leg.store?.city ?? '—'}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">
                      {leg.items?.length ?? 0} item
                      {(leg.items?.length ?? 0) === 1 ? '' : 's'} ·{' '}
                      {rupees(leg.subtotal)}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}

function Row({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className={bold ? 'font-semibold text-gray-900' : 'text-gray-600'}>
        {label}
      </span>
      <span className={bold ? 'text-lg font-bold text-gray-900' : 'text-gray-900'}>
        {value}
      </span>
    </div>
  );
}
