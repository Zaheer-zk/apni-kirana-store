'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarRange,
  Clock,
  IndianRupee,
  Package,
  Receipt,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Badge } from '@aks/ui/components/badge';
import { Card, CardContent } from '@aks/ui/components/card';
import { Skeleton } from '@aks/ui/components/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@aks/ui/components/tabs';
import { AppHeader } from '@/components/AppHeader';
import { RequireAuth } from '@/components/RequireAuth';
import { EmptyPanel, ErrorPanel } from '@/components/StatePanels';
import { api, unwrapList } from '@/lib/api';
import { rupees, rupeesPrecise } from '@/lib/format';

type Period = 'today' | 'week' | 'month';

interface DriverEarningsSummary {
  today?: number;
  week?: number;
  month?: number;
  total?: number;
  pendingPayout?: number;
  payoutStatus?: string;
  rating?: number;
  totalDeliveries?: number;
}

interface DriverEarningsEntry {
  orderId: string;
  driverEarnings: number;
  completedAt: string;
}

interface DeliveryRow {
  id: string;
  status: string;
  driverEarnings?: number;
  deliveryFee?: number;
  createdAt: string;
  deliveredAt?: string | null;
}

/**
 * Backend has GET /api/v1/drivers/earnings (lifetime totals) but the
 * mobile-app-facing /earnings/summary and /earnings/breakdown endpoints
 * referenced in shared/src/types.ts and apps/driver/app/(tabs)/earnings.tsx
 * are NOT yet implemented (see backend/src/routes/drivers.routes.ts). So we
 * call them opportunistically and fall back to deriving the same numbers
 * from /drivers/deliveries — the canonical source — until the backend ships
 * those routes.
 */
async function fetchSummary(): Promise<DriverEarningsSummary | null> {
  try {
    const r = await api.get<{ success: boolean; data: DriverEarningsSummary }>(
      '/api/v1/drivers/earnings/summary',
    );
    return r.data?.data ?? null;
  } catch {
    return null;
  }
}

async function fetchLifetime(): Promise<{
  totalEarnings?: number;
  totalDeliveries?: number;
  rating?: number;
} | null> {
  try {
    const r = await api.get<{
      success: boolean;
      data: { totalEarnings?: number; totalDeliveries?: number; rating?: number };
    }>('/api/v1/drivers/earnings');
    return r.data?.data ?? null;
  } catch {
    return null;
  }
}

async function fetchBreakdown(period: Period): Promise<DriverEarningsEntry[] | null> {
  try {
    const r = await api.get(`/api/v1/drivers/earnings/breakdown?period=${period}`);
    const body = r.data as unknown;
    if (Array.isArray(body)) return body as DriverEarningsEntry[];
    if (body && typeof body === 'object' && 'data' in (body as object)) {
      const d = (body as { data: unknown }).data;
      if (Array.isArray(d)) return d as DriverEarningsEntry[];
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchDeliveries(): Promise<DeliveryRow[]> {
  const r = await api.get('/api/v1/drivers/deliveries');
  return unwrapList<DeliveryRow>(r.data);
}

export default function EarningsPage() {
  return (
    <RequireAuth>
      <AppHeader />
      <main className="page-shell py-6">
        <Earnings />
      </main>
    </RequireAuth>
  );
}

function Earnings() {
  const [period, setPeriod] = useState<Period>('week');

  const summaryQuery = useQuery({
    queryKey: ['driverEarningsSummary'],
    queryFn: fetchSummary,
    staleTime: 60_000,
  });

  const lifetimeQuery = useQuery({
    queryKey: ['driverEarningsLifetime'],
    queryFn: fetchLifetime,
    staleTime: 60_000,
  });

  const breakdownQuery = useQuery({
    queryKey: ['driverEarningsBreakdown', period],
    queryFn: () => fetchBreakdown(period),
    staleTime: 60_000,
  });

  // Fallback source — always fetched so the page can render numbers even
  // when the /earnings/summary endpoint hasn't shipped yet.
  const deliveriesQuery = useQuery({
    queryKey: ['driverDeliveriesList'],
    queryFn: fetchDeliveries,
    staleTime: 60_000,
  });

  const derived = useMemo(() => deriveFromDeliveries(deliveriesQuery.data ?? []), [
    deliveriesQuery.data,
  ]);

  const summary = summaryQuery.data;
  const lifetime = lifetimeQuery.data;

  const today = summary?.today ?? derived.today;
  const week = summary?.week ?? derived.week;
  const month = summary?.month ?? derived.month;
  const totalEarnings = summary?.total ?? lifetime?.totalEarnings ?? derived.total;
  const totalDeliveries =
    summary?.totalDeliveries ?? lifetime?.totalDeliveries ?? derived.totalDeliveries;
  const pendingPayout = summary?.pendingPayout;
  const payoutStatus = summary?.payoutStatus;

  // Pick the right breakdown source: real endpoint when it exists, else
  // derive on the fly.
  const breakdown =
    breakdownQuery.data && breakdownQuery.data.length > 0
      ? breakdownQuery.data
      : derived.entriesByPeriod[period];

  const dailyForChart = derived.dailySeries(period);
  const isLoading =
    summaryQuery.isLoading && lifetimeQuery.isLoading && deliveriesQuery.isLoading;
  const isError =
    summaryQuery.isError &&
    lifetimeQuery.isError &&
    deliveriesQuery.isError;

  if (isError) {
    return (
      <ErrorPanel
        message="Couldn't load your earnings."
        onRetry={() => {
          summaryQuery.refetch();
          lifetimeQuery.refetch();
          deliveriesQuery.refetch();
          breakdownQuery.refetch();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Earnings</h1>
          <p className="mt-1 text-sm text-gray-500">
            What you've earned across deliveries on Quick Easy Mart.
          </p>
        </div>
      </header>

      {/* Hero — this month at a glance. */}
      <Card className="border-primary-200 bg-primary-50">
        <CardContent className="flex items-center gap-4 p-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white">
            <Wallet className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              This month
            </p>
            {isLoading ? (
              <Skeleton className="mt-1 h-8 w-32" />
            ) : (
              <p className="text-3xl font-extrabold text-gray-900">
                {rupeesPrecise(month)}
              </p>
            )}
            <p className="text-xs text-gray-700">
              This week: {rupeesPrecise(week)} · Today: {rupeesPrecise(today)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Quick stats */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          icon={<IndianRupee className="h-4 w-4" />}
          label="Lifetime"
          value={rupees(totalEarnings)}
          loading={isLoading}
          tintBg="bg-accent-light"
          tintFg="text-accent"
        />
        <StatTile
          icon={<Package className="h-4 w-4" />}
          label="Deliveries"
          value={String(totalDeliveries ?? 0)}
          loading={isLoading}
          tintBg="bg-blue-50"
          tintFg="text-blue-600"
        />
        <StatTile
          icon={<TrendingUp className="h-4 w-4" />}
          label="This week"
          value={rupees(week)}
          loading={isLoading}
          tintBg="bg-primary-50"
          tintFg="text-primary"
        />
        <StatTile
          icon={<Clock className="h-4 w-4" />}
          label="Today"
          value={rupees(today)}
          loading={isLoading}
          tintBg="bg-amber-50"
          tintFg="text-amber-600"
        />
      </section>

      {/* Payout status */}
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <Receipt className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-gray-900">Next payout</p>
            <p className="text-xs text-gray-500">
              Payouts run weekly. The pending balance is paid out via your registered
              bank account.{' '}
              <Link
                href="/profile"
                className="font-semibold text-primary hover:text-primary-700"
              >
                Update bank details
              </Link>
            </p>
          </div>
          <div className="text-right">
            <p className="text-base font-bold text-gray-900">
              {rupeesPrecise(pendingPayout ?? week)}
            </p>
            <Badge
              variant={
                payoutStatus === 'PAID'
                  ? 'success'
                  : payoutStatus === 'PROCESSING'
                    ? 'default'
                    : 'warning'
              }
              className="mt-1"
            >
              {payoutStatus ?? 'PENDING'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Daily breakdown chart + per-delivery list */}
      <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
        <TabsList>
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="week">This week</TabsTrigger>
          <TabsTrigger value="month">This month</TabsTrigger>
        </TabsList>

        <TabsContent value={period} className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-5">
              <div className="mb-3 flex items-center justify-between text-xs">
                <h2 className="font-bold uppercase tracking-wide text-gray-500">
                  Daily earnings
                </h2>
                <span className="inline-flex items-center gap-1 text-gray-500">
                  <CalendarRange className="h-3 w-3" />
                  {periodLabel(period)}
                </span>
              </div>
              {isLoading ? (
                <Skeleton className="h-32 w-full rounded-md" />
              ) : (
                <BarChart series={dailyForChart} />
              )}
            </CardContent>
          </Card>

          <section>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-500">
              Per-delivery breakdown ({breakdown.length})
            </h2>
            {isLoading ? (
              <ListSkeleton />
            ) : breakdown.length === 0 ? (
              <EmptyPanel
                icon={<Receipt className="h-6 w-6" />}
                title="No deliveries in this period"
                subtitle="Stay online to start earning — completed deliveries will appear here."
              />
            ) : (
              <ul className="space-y-2">
                {breakdown.map((e) => (
                  <li key={e.orderId}>
                    <Card>
                      <CardContent className="flex items-center justify-between p-3 sm:p-4">
                        <Link
                          href={`/deliveries/${e.orderId}`}
                          className="flex items-center gap-3 text-left"
                        >
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-light text-accent">
                            <Package className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900">
                              #{e.orderId.slice(-8).toUpperCase()}
                            </p>
                            <p className="text-xs text-gray-500">
                              {new Date(e.completedAt).toLocaleString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                        </Link>
                        <p className="text-base font-bold text-accent">
                          +{rupeesPrecise(e.driverEarnings)}
                        </p>
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  loading,
  tintBg,
  tintFg,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  loading: boolean;
  tintBg: string;
  tintFg: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-3 sm:p-4">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full ${tintBg} ${tintFg}`}
        >
          {icon}
        </div>
        {loading ? (
          <Skeleton className="h-6 w-16" />
        ) : (
          <p className="text-xl font-extrabold text-gray-900">{value}</p>
        )}
        <p className="text-xs font-semibold text-gray-500">{label}</p>
      </CardContent>
    </Card>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-2xl" />
      ))}
    </div>
  );
}

/**
 * Minimal SVG bar chart. Each bar is one day in the period. Heights are
 * relative to the day with the highest earnings — flat zeros render as a
 * thin baseline so the period still looks intentional rather than empty.
 *
 * No chart library is pulled in (per the slice 2 spec). For two-tier
 * complexity this is plenty.
 */
function BarChart({ series }: { series: Array<{ label: string; value: number }> }) {
  if (series.length === 0) {
    return (
      <p className="text-center text-xs text-gray-500">No data in this period yet.</p>
    );
  }

  const max = Math.max(0, ...series.map((d) => d.value));
  const innerHeight = 110;
  const barWidth = 24;
  const gap = series.length > 14 ? 4 : 10;
  const chartWidth = series.length * (barWidth + gap);
  const labelInterval = series.length > 14 ? Math.ceil(series.length / 6) : 1;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        width={chartWidth + 32}
        height={innerHeight + 30}
        role="img"
        aria-label="Daily earnings"
      >
        {series.map((d, i) => {
          const h = max > 0 ? Math.max(2, (d.value / max) * innerHeight) : 2;
          const x = 16 + i * (barWidth + gap);
          const y = innerHeight - h + 10;
          const showLabel = i % labelInterval === 0 || i === series.length - 1;
          return (
            <g key={`${d.label}-${i}`}>
              <title>{`${d.label}: ₹${d.value.toFixed(2)}`}</title>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={h}
                rx={4}
                fill={d.value > 0 ? '#16A34A' : '#E5E7EB'}
              />
              {showLabel ? (
                <text
                  x={x + barWidth / 2}
                  y={innerHeight + 26}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#6B7280"
                >
                  {d.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function periodLabel(p: Period): string {
  if (p === 'today') return 'Today';
  if (p === 'week') return 'Last 7 days';
  return 'Last 30 days';
}

interface DerivedShape {
  today: number;
  week: number;
  month: number;
  total: number;
  totalDeliveries: number;
  entriesByPeriod: Record<Period, DriverEarningsEntry[]>;
  dailySeries: (period: Period) => Array<{ label: string; value: number }>;
}

/**
 * Derive period totals + per-delivery entries from the deliveries list. Used
 * as a fallback when the dedicated `/earnings/summary` and `/earnings/breakdown`
 * endpoints don't exist on this backend version.
 */
function deriveFromDeliveries(rows: DeliveryRow[]): DerivedShape {
  const delivered = rows.filter((r) => r.status === 'DELIVERED');

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfDay.getDate() - 6); // last 7 days inclusive
  const startOfMonth = new Date(startOfDay);
  startOfMonth.setDate(startOfDay.getDate() - 29); // last 30 days inclusive

  function asEntries(threshold: Date): DriverEarningsEntry[] {
    return delivered
      .filter((r) => {
        const ts = new Date(r.deliveredAt ?? r.createdAt);
        return ts >= threshold;
      })
      .map((r) => ({
        orderId: r.id,
        driverEarnings: r.driverEarnings ?? r.deliveryFee ?? 0,
        completedAt: r.deliveredAt ?? r.createdAt,
      }))
      .sort((a, b) => +new Date(b.completedAt) - +new Date(a.completedAt));
  }

  const todayEntries = asEntries(startOfDay);
  const weekEntries = asEntries(startOfWeek);
  const monthEntries = asEntries(startOfMonth);
  const lifetime = delivered.reduce(
    (sum, r) => sum + (r.driverEarnings ?? r.deliveryFee ?? 0),
    0,
  );

  function dailySeries(period: Period): Array<{ label: string; value: number }> {
    const days = period === 'today' ? 1 : period === 'week' ? 7 : 30;
    const buckets: Array<{ label: string; value: number; day: string }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(startOfDay);
      d.setDate(startOfDay.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label =
        period === 'today'
          ? d.toLocaleTimeString('en-IN', { hour: '2-digit' })
          : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      buckets.push({ label, value: 0, day: key });
    }
    const firstBucketStart = new Date(`${buckets[0]!.day}T00:00:00`);
    const now = new Date();
    for (const r of delivered) {
      const ts = new Date(r.deliveredAt ?? r.createdAt);
      if (ts < firstBucketStart || ts > now) continue;
      const key = ts.toISOString().slice(0, 10);
      const bucket = buckets.find((b) => b.day === key);
      if (bucket) bucket.value += r.driverEarnings ?? r.deliveryFee ?? 0;
    }
    return buckets.map(({ label, value }) => ({ label, value }));
  }

  return {
    today: todayEntries.reduce((s, e) => s + e.driverEarnings, 0),
    week: weekEntries.reduce((s, e) => s + e.driverEarnings, 0),
    month: monthEntries.reduce((s, e) => s + e.driverEarnings, 0),
    total: lifetime,
    totalDeliveries: delivered.length,
    entriesByPeriod: {
      today: todayEntries,
      week: weekEntries,
      month: monthEntries,
    },
    dailySeries,
  };
}
