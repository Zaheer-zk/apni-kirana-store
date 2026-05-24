'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  Bike,
  Box,
  IndianRupee,
  MapPin,
  Navigation,
  Package,
  Receipt,
  Store,
  Sun,
  Sunrise,
  Sunset,
  Moon,
  Clock4,
} from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Card, CardContent } from '@aks/ui/components/card';
import { Badge } from '@aks/ui/components/badge';
import { Skeleton } from '@aks/ui/components/skeleton';
import { AppHeader } from '@/components/AppHeader';
import { RequireAuth } from '@/components/RequireAuth';
import { OnlineToggle } from '@/components/OnlineToggle';
import { ErrorPanel } from '@/components/StatePanels';
import { api } from '@/lib/api';
import { getStoredUser, type StoredUser } from '@/lib/auth';
import { mapsDirectionsUrl, rupees, rupeesPrecise } from '@/lib/format';
import type { DailyDriverStats } from '@aks/shared';

interface DriverOrderItem {
  itemId: string;
  name: string;
  qty?: number;
  quantity?: number;
  price: number;
  unit?: string;
}

interface ActiveOrder {
  id: string;
  status:
    | 'PENDING'
    | 'STORE_ACCEPTED'
    | 'DRIVER_ASSIGNED'
    | 'PICKED_UP'
    | 'DELIVERED'
    | 'CANCELLED';
  items: DriverOrderItem[];
  store?: {
    id?: string;
    name?: string;
    lat?: number;
    lng?: number;
    street?: string;
    city?: string;
    address?: string;
  } | null;
  deliveryAddress?: {
    lat?: number;
    lng?: number;
    label?: string | null;
    pincode?: string | null;
    city?: string | null;
  } | null;
  total: number;
  paymentMethod: string;
}

type StatsShape = DailyDriverStats & {
  // The backend's current `/stats/today` returns these keys; the shared
  // type uses `deliveriesCount`/`earnings`. Accept both shapes so we can
  // evolve the backend without breaking the web app.
  todayDeliveries?: number;
  todayEarnings?: number;
};

interface RecentEarningEntry {
  orderId: string;
  driverEarnings: number;
  completedAt: string;
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <AppHeader />
      <main className="page-shell py-6">
        <Dashboard />
      </main>
    </RequireAuth>
  );
}

function Dashboard() {
  const [user, setUser] = useState<StoredUser | null>(null);
  useEffect(() => setUser(getStoredUser()), []);

  const statsQuery = useQuery<StatsShape>({
    queryKey: ['driverTodayStats'],
    queryFn: async () => {
      const r = await api.get<{ success: boolean; data: StatsShape } | StatsShape>(
        '/api/v1/drivers/stats/today',
      );
      const body = r.data as { success?: boolean; data?: StatsShape } & StatsShape;
      return body?.data ?? body;
    },
    refetchInterval: 60_000,
  });

  // Backend shape differs from the shared type — accept both.
  const deliveriesCount =
    statsQuery.data?.deliveriesCount ?? statsQuery.data?.todayDeliveries ?? 0;
  const earnings = statsQuery.data?.earnings ?? statsQuery.data?.todayEarnings ?? 0;
  const hoursOnline = statsQuery.data?.hoursOnline ?? 0;
  const status = statsQuery.data?.status;
  const isPending = status === 'PENDING_APPROVAL';

  // Active order — the active-orders endpoint returns either nothing or the
  // single in-flight order assigned to this driver.
  const activeQuery = useQuery<ActiveOrder | null>({
    queryKey: ['driverActiveOrder'],
    queryFn: async () => {
      try {
        const r = await api.get<{ success: boolean; data: ActiveOrder[] | null }>(
          '/api/v1/drivers/deliveries?status=PICKED_UP',
        );
        const list = (r.data?.data ?? []) as ActiveOrder[];
        const inFlight = list.find((o) =>
          ['DRIVER_ASSIGNED', 'PICKED_UP'].includes(o.status),
        );
        return inFlight ?? null;
      } catch {
        return null;
      }
    },
    enabled: !isPending,
    refetchInterval: 30_000,
  });

  // Recent earnings — small list under the stats.
  const recentQuery = useQuery<RecentEarningEntry[]>({
    queryKey: ['driverRecentEarnings'],
    queryFn: async () => {
      try {
        const r = await api.get<RecentEarningEntry[] | { data?: RecentEarningEntry[] }>(
          '/api/v1/drivers/earnings/breakdown?period=week',
        );
        const body = r.data;
        if (Array.isArray(body)) return body;
        if (Array.isArray((body as { data?: unknown }).data)) {
          return (body as { data: RecentEarningEntry[] }).data;
        }
        return [];
      } catch {
        return [];
      }
    },
    enabled: !isPending,
  });

  const greet = greetingForHour(new Date().getHours());
  const GreetIcon = greet.icon;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1 text-xs font-semibold text-gray-500">
            <GreetIcon className="h-3.5 w-3.5" />
            {greet.label}
            {user?.name ? `, ${user.name.split(' ')[0]}` : ''}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">
            Driver Dashboard
          </h1>
        </div>
      </header>

      {isPending ? (
        <Card className="border-warning bg-warningLight">
          <CardContent className="flex items-start gap-3 p-4">
            <Bell className="mt-0.5 h-5 w-5 text-warning" />
            <div>
              <p className="text-sm font-bold text-gray-900">Application under review</p>
              <p className="mt-0.5 text-sm text-gray-700">
                Your driver account hasn't been approved yet.{' '}
                <Link className="font-semibold text-primary hover:text-primary-700" href="/pending">
                  View status
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <OnlineToggle />
      )}

      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-500">
          Today's stats
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile
            icon={<Box className="h-4 w-4" />}
            label="Deliveries"
            value={String(deliveriesCount)}
            tintBg="bg-primary-50"
            tintFg="text-primary"
            loading={statsQuery.isLoading}
          />
          <StatTile
            icon={<IndianRupee className="h-4 w-4" />}
            label="Earnings"
            value={rupees(earnings)}
            tintBg="bg-accent-light"
            tintFg="text-accent"
            loading={statsQuery.isLoading}
          />
          <StatTile
            icon={<Clock4 className="h-4 w-4" />}
            label="Hours"
            value={hoursOnline.toFixed(1)}
            tintBg="bg-blue-50"
            tintFg="text-blue-600"
            loading={statsQuery.isLoading}
          />
        </div>
      </section>

      {!isPending ? <ActiveDeliveryCard query={activeQuery} /> : null}

      {!isPending ? (
        <section>
          <header className="mb-3 flex items-end justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500">
              Recent earnings
            </h2>
            <Link
              href="/deliveries"
              className="text-xs font-semibold text-primary hover:text-primary-700"
            >
              View all
            </Link>
          </header>

          {recentQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : recentQuery.isError ? (
            <ErrorPanel
              message="Couldn't load your recent earnings."
              onRetry={() => recentQuery.refetch()}
            />
          ) : (recentQuery.data ?? []).length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-8 text-center text-sm text-gray-500">
                <Receipt className="h-6 w-6 text-gray-400" />
                No deliveries in the last 7 days.
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-2">
              {(recentQuery.data ?? []).slice(0, 5).map((e) => (
                <li key={e.orderId}>
                  <Card>
                    <CardContent className="flex items-center justify-between p-3 sm:p-4">
                      <div className="flex items-center gap-3">
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
                      </div>
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
      ) : null}
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  tintBg,
  tintFg,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tintBg: string;
  tintFg: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-3 sm:p-4">
        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${tintBg} ${tintFg}`}>
          {icon}
        </div>
        {loading ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <p className="text-2xl font-extrabold text-gray-900">{value}</p>
        )}
        <p className="text-xs font-semibold text-gray-500">{label}</p>
      </CardContent>
    </Card>
  );
}

function ActiveDeliveryCard({
  query,
}: {
  query: ReturnType<typeof useQuery<ActiveOrder | null>>;
}) {
  if (query.isLoading) {
    return <Skeleton className="h-44 w-full rounded-2xl" />;
  }
  const order = query.data;
  if (!order) {
    return (
      <Card className="bg-white">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-light">
            <Bike className="h-7 w-7 text-accent" />
          </div>
          <p className="text-sm font-bold text-gray-900">No active delivery</p>
          <p className="max-w-sm text-xs text-gray-500">
            When you accept a delivery on your mobile app, it will appear here for
            quick reference.
          </p>
        </CardContent>
      </Card>
    );
  }

  const isAtStore = order.status === 'DRIVER_ASSIGNED';
  const isToCustomer = order.status === 'PICKED_UP';

  const pickupAddress =
    [order.store?.street, order.store?.address, order.store?.city]
      .filter(Boolean)
      .join(', ') || 'Store address';

  const dropAddress =
    [order.deliveryAddress?.label, order.deliveryAddress?.city, order.deliveryAddress?.pincode]
      .filter(Boolean)
      .join(', ') || 'Dropoff area';

  const pickupUrl = mapsDirectionsUrl(order.store?.lat, order.store?.lng);
  const dropUrl = mapsDirectionsUrl(order.deliveryAddress?.lat, order.deliveryAddress?.lng);

  return (
    <Card className="border-primary-200">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Badge variant="default">
              {isAtStore ? 'STEP 1 OF 2' : isToCustomer ? 'STEP 2 OF 2' : order.status}
            </Badge>
            <h3 className="mt-2 text-lg font-bold text-gray-900">
              {isAtStore
                ? `Pickup from ${order.store?.name ?? 'store'}`
                : isToCustomer
                  ? 'Deliver to dropoff'
                  : 'Active delivery'}
            </h3>
          </div>
          <Badge variant={order.paymentMethod === 'CASH_ON_DELIVERY' ? 'warning' : 'success'} className="shrink-0">
            {order.paymentMethod === 'CASH_ON_DELIVERY' ? 'Collect cash' : 'Already paid'}
          </Badge>
        </div>

        <div className="rounded-xl bg-gray-50 p-3 text-sm">
          <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
            <Store className="h-3 w-3" /> Pickup
          </p>
          <p className="text-gray-800">{pickupAddress}</p>
          {pickupUrl ? (
            <Button asChild variant="outline" size="sm" className="mt-2 w-full">
              <a href={pickupUrl} target="_blank" rel="noreferrer">
                <Navigation className="h-4 w-4" /> Open pickup in Maps
              </a>
            </Button>
          ) : null}
        </div>

        <div className="rounded-xl bg-gray-50 p-3 text-sm">
          <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
            <MapPin className="h-3 w-3" /> Drop
          </p>
          <p className="text-gray-800">{dropAddress}</p>
          {dropUrl ? (
            <Button asChild variant="outline" size="sm" className="mt-2 w-full">
              <a href={dropUrl} target="_blank" rel="noreferrer">
                <Navigation className="h-4 w-4" /> Open drop-off in Maps
              </a>
            </Button>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 pt-3">
          <div>
            <p className="text-xs font-semibold text-gray-500">Bill total</p>
            <p className="text-xl font-bold text-gray-900">{rupeesPrecise(order.total)}</p>
          </div>
          <p className="text-xs text-gray-500">
            {order.items.length === 1 ? '1 item' : `${order.items.length} items`}
          </p>
        </div>

        <p className="text-[11px] leading-relaxed text-gray-500">
          Accept, pick-up and OTP confirmation are mobile-app actions. Use the mobile app
          to update this order.
        </p>
      </CardContent>
    </Card>
  );
}

function greetingForHour(hour: number) {
  if (hour < 5) return { label: 'Late shift', icon: Moon };
  if (hour < 12) return { label: 'Good morning', icon: Sunrise };
  if (hour < 17) return { label: 'Good afternoon', icon: Sun };
  if (hour < 21) return { label: 'Good evening', icon: Sunset };
  return { label: 'Good night', icon: Moon };
}
