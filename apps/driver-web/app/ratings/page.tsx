'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare, Star } from 'lucide-react';
import { Card, CardContent } from '@aks/ui/components/card';
import { Skeleton } from '@aks/ui/components/skeleton';
import { AppHeader } from '@/components/AppHeader';
import { RequireAuth } from '@/components/RequireAuth';
import { api, unwrapList } from '@/lib/api';

// Customer reviews for this driver. Mirrors apps/driver/app/profile/ratings.tsx —
// fans out from GET /api/v1/orders, picks orders where rating.driverRating is
// set, and renders an aggregate header + per-order reviews list. Backend
// doesn't expose a dedicated /drivers/me/ratings endpoint yet; both mobile
// and web derive from the order list to stay consistent.

interface OrderRating {
  driverRating?: number | null;
  driverComment?: string | null;
  createdAt?: string;
}

interface OrderListItem {
  id: string;
  rating?: OrderRating | null;
  customer?: { name?: string | null } | null;
  createdAt?: string;
}

interface ReviewItem {
  orderId: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  customerName: string;
}

export default function RatingsPage() {
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
  const orders = useQuery<OrderListItem[]>({
    queryKey: ['driverOrdersForRatings'],
    queryFn: async () => {
      const res = await api.get('/api/v1/orders');
      return unwrapList<OrderListItem>(res.data);
    },
  });

  const reviews: ReviewItem[] = useMemo(() => {
    if (!orders.data) return [];
    return orders.data
      .filter((o) => o.rating?.driverRating != null)
      .map((o) => ({
        orderId: o.id,
        rating: o.rating!.driverRating as number,
        comment: o.rating?.driverComment ?? null,
        createdAt: o.rating?.createdAt ?? o.createdAt ?? new Date().toISOString(),
        customerName: o.customer?.name ?? 'Anonymous customer',
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders.data]);

  const aggregate = useMemo(() => {
    if (reviews.length === 0) return { avg: 0, total: 0, counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
    const counts: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach((r) => {
      const k = Math.max(1, Math.min(5, Math.round(r.rating))) as 1 | 2 | 3 | 4 | 5;
      counts[k] += 1;
    });
    const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    return { avg, total: reviews.length, counts };
  }, [reviews]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-center gap-3">
        <Star className="h-6 w-6 text-amber-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My ratings</h1>
          <p className="text-sm text-gray-500">
            What customers said after each delivery.
          </p>
        </div>
      </header>

      {/* Aggregate */}
      {orders.isLoading ? (
        <Skeleton className="h-36 w-full rounded-2xl" />
      ) : (
        <Card>
          <CardContent className="flex items-center gap-6 p-6">
            <div className="text-center">
              <p className="text-5xl font-extrabold text-gray-900">
                {aggregate.total === 0 ? '—' : aggregate.avg.toFixed(1)}
              </p>
              <StarRow value={aggregate.avg} />
              <p className="mt-1 text-xs text-gray-500">
                {aggregate.total} rating{aggregate.total === 1 ? '' : 's'}
              </p>
            </div>
            <div className="flex-1 space-y-1.5">
              {[5, 4, 3, 2, 1].map((k) => {
                const count = aggregate.counts[k as 1 | 2 | 3 | 4 | 5];
                const pct = aggregate.total === 0 ? 0 : (count / aggregate.total) * 100;
                return (
                  <div key={k} className="flex items-center gap-2 text-xs">
                    <span className="w-3 font-semibold text-gray-700">{k}</span>
                    <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-amber-400"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-6 text-right text-gray-500">{count}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reviews */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Recent reviews
        </h2>
        {orders.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : reviews.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <Star className="h-7 w-7 text-gray-300" />
              <p className="text-sm font-bold text-gray-900">No reviews yet</p>
              <p className="max-w-sm text-xs text-gray-500">
                Customer ratings appear here once they rate your deliveries. Stay polite,
                punctual and careful with packages.
              </p>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {reviews.map((r) => (
              <li key={r.orderId}>
                <Card>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-900">
                        {r.customerName}
                      </span>
                      <StarRow value={r.rating} small />
                    </div>
                    {r.comment ? (
                      <p className="flex items-start gap-2 text-sm text-gray-600">
                        <MessageSquare className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
                        <span>{r.comment}</span>
                      </p>
                    ) : null}
                    <p className="text-xs text-gray-400">
                      {new Date(r.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StarRow({ value, small }: { value: number; small?: boolean }) {
  const size = small ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`${size} ${s <= Math.round(value) ? 'fill-amber-500 text-amber-500' : 'text-gray-300'}`}
        />
      ))}
    </div>
  );
}
