'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  Download,
  IndianRupee,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@aks/ui/components/card';
import { Skeleton } from '@aks/ui/components/skeleton';
import { Badge } from '@aks/ui/components/badge';
import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';
import { EmptyPanel, ErrorPanel } from '@/components/StatePanels';
import { api } from '@/lib/api';
import { rupees, shortOrderId } from '@/lib/format';

type Period = 'week' | 'month' | 'all';
const PERIOD_LABELS: Record<Period, string> = {
  week: 'This week',
  month: 'Last 30 days',
  all: 'All time',
};

/**
 * Backend's `GET /api/v1/stores/orders` returns Prisma Order rows with
 * `items` and a slim `deliveryAddress` joined. Commission and timestamps
 * are present on the row. We rely on that shape here. If the backend ever
 * trims its response, this widens.
 */
interface RawStoreOrder {
  id: string;
  status: string;
  subtotal: number;
  deliveryFee: number;
  commission: number;
  total: number;
  paymentMethod?: string;
  paymentStatus?: string;
  createdAt: string;
  deliveredAt?: string | null;
  items?: Array<{ qty?: number; quantity?: number }>;
  deliveryAddress?: { city?: string; label?: string; pincode?: string } | null;
}

export default function EarningsPage() {
  return (
    <AuthGuard>
      <AppShell>
        <EarningsInner />
      </AppShell>
    </AuthGuard>
  );
}

function EarningsInner() {
  const [period, setPeriod] = useState<Period>('week');

  // We fetch all DELIVERED orders for the store and slice client-side. The
  // backend cap is take:100, which is fine for an MVP store-operator
  // dashboard. If a single store starts doing >100 deliveries between
  // sessions we'll need a /stores/earnings endpoint with proper pagination
  // and aggregates (see Returned findings).
  const {
    data: rawOrders,
    isLoading,
    isError,
    refetch,
  } = useQuery<RawStoreOrder[]>({
    queryKey: ['storeOrders', 'delivered'],
    queryFn: async () => {
      const res = await api.get('/api/v1/stores/orders', {
        params: { statuses: 'DELIVERED' },
      });
      const payload = res.data?.data ?? res.data;
      return Array.isArray(payload) ? (payload as RawStoreOrder[]) : [];
    },
    refetchInterval: 60_000,
  });

  const orders = rawOrders ?? [];

  const periodStart = useMemo(() => {
    const d = new Date();
    if (period === 'week') {
      d.setDate(d.getDate() - 7);
    } else if (period === 'month') {
      d.setDate(d.getDate() - 30);
    } else {
      return new Date(0);
    }
    d.setHours(0, 0, 0, 0);
    return d;
  }, [period]);

  const periodOrders = useMemo(() => {
    return orders.filter((o) => {
      const ts = new Date(o.deliveredAt ?? o.createdAt).getTime();
      return ts >= periodStart.getTime();
    });
  }, [orders, periodStart]);

  // Totals — gross = sum of subtotals, commission = sum of commission,
  // net = gross − commission (the operator's payout). Delivery fees go to
  // the driver and are reported separately for clarity.
  const totals = useMemo(() => {
    let gross = 0;
    let commission = 0;
    let deliveryFee = 0;
    let orderCount = 0;
    for (const o of periodOrders) {
      gross += o.subtotal ?? 0;
      commission += o.commission ?? 0;
      deliveryFee += o.deliveryFee ?? 0;
      orderCount += 1;
    }
    return {
      gross,
      commission,
      deliveryFee,
      net: Math.max(0, gross - commission),
      orderCount,
      avgOrder: orderCount > 0 ? gross / orderCount : 0,
    };
  }, [periodOrders]);

  // 14-day sparkline data (always 14 buckets regardless of selected period
  // so the chart stays visually comparable between week/month/all views).
  const chartData = useMemo(() => buildDailySeries(orders, 14), [orders]);

  function exportCsv() {
    if (periodOrders.length === 0) {
      return;
    }
    const header = ['orderId', 'deliveredAt', 'items', 'subtotal', 'commission', 'net'];
    const rows = periodOrders.map((o) => [
      o.id,
      o.deliveredAt ?? o.createdAt,
      String(itemsCount(o)),
      String(o.subtotal ?? 0),
      String(o.commission ?? 0),
      String((o.subtotal ?? 0) - (o.commission ?? 0)),
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `earnings-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page-shell space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <span className="section-eyebrow">Payouts</span>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Earnings</h1>
          <p className="text-sm text-gray-500">
            Track what you've earned and what's owed. Payouts are processed weekly.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodToggle period={period} onChange={setPeriod} />
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={periodOrders.length === 0} className="gap-1">
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
      </header>

      {/* Hero card — net earnings dominate, with breakdown beneath */}
      <Card className="bg-primary text-white">
        <CardContent className="space-y-4 p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-100">
                {PERIOD_LABELS[period]} payout
              </p>
              {isLoading ? (
                <Skeleton className="mt-2 h-10 w-48 bg-primary-700/50" />
              ) : (
                <p className="mt-1 text-3xl font-bold sm:text-4xl">{rupees(totals.net)}</p>
              )}
              <p className="mt-1 text-sm text-primary-100">
                {totals.orderCount} delivered order{totals.orderCount === 1 ? '' : 's'}
                {totals.orderCount > 0
                  ? ` · avg ${rupees(totals.avgOrder)}`
                  : null}
              </p>
            </div>
            <div className="hidden h-12 w-12 items-center justify-center rounded-full bg-white/15 sm:flex">
              <IndianRupee className="h-6 w-6" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 border-t border-white/20 pt-3 text-sm">
            <BreakdownTile label="Gross" value={rupees(totals.gross)} />
            <BreakdownTile label="Commission" value={`− ${rupees(totals.commission)}`} />
            <BreakdownTile label="Driver fee" value={rupees(totals.deliveryFee)} subtle />
          </div>
        </CardContent>
      </Card>

      {/* 14-day sparkline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4 text-primary" /> Last 14 days
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DailyChart data={chartData} loading={isLoading} />
        </CardContent>
      </Card>

      {/* History table */}
      <section>
        <h2 className="mb-3 text-lg font-bold text-gray-900 sm:text-xl">Order history</h2>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <ErrorPanel message="Couldn't load earnings history." onRetry={() => refetch()} />
        ) : periodOrders.length === 0 ? (
          <EmptyPanel
            icon={<IndianRupee className="h-6 w-6" />}
            title="No completed orders in this period"
            subtitle="Once an order is delivered, it'll show up here with the payout breakdown."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            {/* Header row — only renders on tablet+ so the mobile cards below feel native */}
            <div className="hidden border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase text-gray-500 sm:grid sm:grid-cols-[1fr_120px_120px_120px_100px] sm:gap-3">
              <span>Order</span>
              <span className="text-right">Gross</span>
              <span className="text-right">Commission</span>
              <span className="text-right">Net</span>
              <span className="text-right">Payout</span>
            </div>
            <ul className="divide-y divide-gray-100">
              {periodOrders.map((o) => {
                const net = (o.subtotal ?? 0) - (o.commission ?? 0);
                return (
                  <li
                    key={o.id}
                    className="flex flex-col gap-2 p-4 sm:grid sm:grid-cols-[1fr_120px_120px_120px_100px] sm:items-center sm:gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold text-gray-900">
                        {shortOrderId(o.id)}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {formatWhen(o.deliveredAt ?? o.createdAt)} ·{' '}
                        {itemsCount(o)} item{itemsCount(o) === 1 ? '' : 's'}
                      </p>
                    </div>
                    <span className="text-sm text-gray-700 sm:text-right">
                      {rupees(o.subtotal)}
                    </span>
                    <span className="text-sm text-gray-500 sm:text-right">
                      − {rupees(o.commission)}
                    </span>
                    <span className="text-sm font-bold text-primary sm:text-right">
                      {rupees(net)}
                    </span>
                    <PayoutBadge status={resolvePayoutStatus(o)} />
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-500">
              Showing {periodOrders.length} order{periodOrders.length === 1 ? '' : 's'} from the
              last {orders.length === 100 ? '100 (server cap)' : orders.length} delivered.
              Payouts are settled weekly via your registered bank account.
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function PeriodToggle({
  period,
  onChange,
}: {
  period: Period;
  onChange: (next: Period) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-gray-200 bg-white p-1">
      {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
            period === p ? 'bg-primary text-white' : 'text-gray-600 hover:text-gray-900'
          }`}
          aria-pressed={period === p}
        >
          {PERIOD_LABELS[p]}
        </button>
      ))}
    </div>
  );
}

function BreakdownTile({
  label,
  value,
  subtle,
}: {
  label: string;
  value: string;
  subtle?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-primary-100">{label}</p>
      <p className={`mt-0.5 text-base font-bold ${subtle ? 'text-primary-100' : 'text-white'}`}>
        {value}
      </p>
    </div>
  );
}

interface DailyDatum {
  date: string;
  label: string;
  total: number;
}

function buildDailySeries(orders: RawStoreOrder[], days: number): DailyDatum[] {
  const out: DailyDatum[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    out.push({
      date: iso,
      label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      total: 0,
    });
  }
  const byDate = new Map(out.map((b) => [b.date, b]));
  for (const o of orders) {
    const when = new Date(o.deliveredAt ?? o.createdAt);
    when.setHours(0, 0, 0, 0);
    const key = when.toISOString().slice(0, 10);
    const bucket = byDate.get(key);
    if (bucket) {
      const net = (o.subtotal ?? 0) - (o.commission ?? 0);
      bucket.total += net;
    }
  }
  return out;
}

function DailyChart({ data, loading }: { data: DailyDatum[]; loading: boolean }) {
  if (loading) {
    return <Skeleton className="h-32 w-full" />;
  }
  const max = Math.max(1, ...data.map((d) => d.total));
  // Bar chart: each day is one bar, height proportional to net for that day.
  // 14 bars × ~24px wide = 336px content. We let it stretch to container.
  const yesterday = data[data.length - 2]?.total ?? 0;
  const today = data[data.length - 1]?.total ?? 0;
  const delta = today - yesterday;

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-1 sm:gap-1.5">
        {data.map((d, idx) => {
          const heightPct = Math.max(2, Math.round((d.total / max) * 100));
          const isLast = idx === data.length - 1;
          return (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
              <div className="relative flex h-28 w-full items-end">
                <div
                  className={`w-full rounded-t-md transition-all ${
                    isLast ? 'bg-primary' : 'bg-primary/60'
                  }`}
                  style={{ height: `${heightPct}%` }}
                  title={`${d.label}: ${rupees(d.total)}`}
                />
              </div>
              <span className="hidden text-[10px] text-gray-500 sm:block">
                {d.label.split(' ')[0]}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>14d total: <strong>{rupees(data.reduce((s, d) => s + d.total, 0))}</strong></span>
        <span className="inline-flex items-center gap-1">
          {delta >= 0 ? (
            <TrendingUp className="h-3.5 w-3.5 text-green-600" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5 text-red-600" />
          )}
          Today vs yesterday: {delta >= 0 ? '+' : ''}
          {rupees(delta)}
        </span>
      </div>
    </div>
  );
}

function PayoutBadge({ status }: { status: 'paid' | 'pending' | 'queued' }) {
  if (status === 'paid') {
    return (
      <span className="sm:text-right">
        <Badge variant="success">Paid</Badge>
      </span>
    );
  }
  if (status === 'queued') {
    return (
      <span className="sm:text-right">
        <Badge variant="warning">Queued</Badge>
      </span>
    );
  }
  return (
    <span className="sm:text-right">
      <Badge variant="secondary">Pending</Badge>
    </span>
  );
}

/**
 * The platform pays out weekly. Orders delivered more than 7 days ago are
 * assumed paid (best-effort label; the backend doesn't yet expose an
 * authoritative payout status per order — see Returned findings for the
 * endpoint we'd need to bind to). Orders <7d old are 'queued' (in the
 * current cycle); failed payments stay 'pending'.
 */
function resolvePayoutStatus(o: RawStoreOrder): 'paid' | 'pending' | 'queued' {
  if (o.paymentStatus && o.paymentStatus !== 'PAID' && o.paymentStatus !== 'COMPLETED') {
    return 'pending';
  }
  const at = new Date(o.deliveredAt ?? o.createdAt).getTime();
  const daysOld = (Date.now() - at) / (1000 * 60 * 60 * 24);
  return daysOld > 7 ? 'paid' : 'queued';
}

function itemsCount(o: RawStoreOrder): number {
  if (!o.items || o.items.length === 0) return 0;
  return o.items.reduce((sum, it) => sum + (it.qty ?? it.quantity ?? 1), 0);
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
