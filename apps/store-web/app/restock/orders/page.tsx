'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Building2, ClipboardList, Inbox, ShoppingCart } from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Card, CardContent } from '@aks/ui/components/card';
import { Skeleton } from '@aks/ui/components/skeleton';
import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';
import { EmptyPanel, ErrorPanel } from '@/components/StatePanels';
import { api } from '@/lib/api';

// History of restock orders this store has placed with wholesalers.
// Mirrors apps/store-portal/app/restock/orders.tsx — same /api/v1/orders/restock
// endpoint and same status pill labels.

interface RestockOrder {
  id: string;
  status: string;
  total: number;
  subtotal: number;
  deliveryFee: number;
  createdAt: string;
  items: Array<{ id: string; name: string; qty: number }>;
  store?: { name: string; owner?: { name: string | null; phone: string } };
}

const STATUS_STYLE: Record<string, { className: string; label: string }> = {
  PENDING: { className: 'bg-amber-50 text-amber-700', label: 'Awaiting wholesaler' },
  STORE_ACCEPTED: { className: 'bg-blue-50 text-blue-700', label: 'Accepted' },
  COOKING: { className: 'bg-amber-50 text-amber-700', label: 'Preparing' },
  DRIVER_ASSIGNED: { className: 'bg-blue-50 text-blue-700', label: 'Driver assigned' },
  PICKED_UP: { className: 'bg-indigo-50 text-indigo-700', label: 'On the way' },
  DELIVERED: { className: 'bg-emerald-50 text-emerald-700', label: 'Delivered' },
  CANCELLED: { className: 'bg-red-50 text-red-700', label: 'Cancelled' },
  REJECTED: { className: 'bg-red-50 text-red-700', label: 'Declined' },
};

export default function RestockOrdersPage() {
  return (
    <AuthGuard>
      <AppShell>
        <Inner />
      </AppShell>
    </AuthGuard>
  );
}

function Inner() {
  const query = useQuery<RestockOrder[]>({
    queryKey: ['restock-orders'],
    queryFn: async () => {
      const res = await api.get('/api/v1/orders/restock', { params: { limit: 50 } });
      // Backend wraps as { success, data: { orders, total } }; the mobile app
      // unwraps the inner `orders` array — do the same.
      const inner =
        (res.data?.data as { orders?: RestockOrder[] } | undefined) ?? res.data ?? null;
      if (Array.isArray(inner)) return inner;
      return inner?.orders ?? [];
    },
    refetchOnMount: 'always',
  });

  const orders = query.data ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href="/restock"
        className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to restock
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <ClipboardList className="h-6 w-6 text-primary" />
            My restock orders
          </h1>
          <p className="text-sm text-gray-500">Past and pending orders to wholesalers.</p>
        </div>
        <Button asChild size="sm">
          <Link href="/restock">
            <ShoppingCart className="h-4 w-4" /> New order
          </Link>
        </Button>
      </header>

      {query.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorPanel
          message="Couldn’t load your restock orders. Try again."
          onRetry={() => query.refetch()}
        />
      ) : orders.length === 0 ? (
        <EmptyPanel
          icon={<Inbox className="h-7 w-7" />}
          title="No restock orders yet"
          subtitle="When you place your first restock order with a wholesaler, it shows up here."
        />
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => {
            const summary = o.items
              .slice(0, 3)
              .map((i) => `${i.name} ×${i.qty}`)
              .join(', ');
            const more = o.items.length - 3;
            const pill = STATUS_STYLE[o.status] ?? {
              className: 'bg-gray-100 text-gray-700',
              label: o.status,
            };
            return (
              <li key={o.id}>
                <Card>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-gray-500">
                        #{o.id.slice(-6).toUpperCase()}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${pill.className}`}
                      >
                        {pill.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      <Building2 className="h-3.5 w-3.5 text-gray-400" />
                      <span className="truncate">{o.store?.name ?? 'Wholesaler'}</span>
                    </div>
                    <p className="line-clamp-2 text-sm text-gray-700">
                      {summary}
                      {more > 0 ? <span className="text-gray-500"> +{more} more</span> : null}
                    </p>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">
                        {new Date(o.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                      <span className="text-base font-bold text-gray-900">
                        ₹{o.total.toFixed(2)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
