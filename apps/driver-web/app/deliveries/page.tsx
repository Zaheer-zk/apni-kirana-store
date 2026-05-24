'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bike,
  Box,
  Calendar,
  ChevronRight,
  Home,
  Store as StoreIcon,
} from 'lucide-react';
import { Badge } from '@aks/ui/components/badge';
import { Button } from '@aks/ui/components/button';
import { Card, CardContent } from '@aks/ui/components/card';
import { Input } from '@aks/ui/components/input';
import { Label } from '@aks/ui/components/label';
import { Skeleton } from '@aks/ui/components/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@aks/ui/components/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@aks/ui/components/select';
import { AppHeader } from '@/components/AppHeader';
import { RequireAuth } from '@/components/RequireAuth';
import { EmptyPanel, ErrorPanel } from '@/components/StatePanels';
import { api, unwrapList } from '@/lib/api';
import { formatDate, formatTime, rupeesPrecise } from '@/lib/format';

interface DeliveryRow {
  id: string;
  status: string;
  driverEarnings?: number;
  deliveryFee?: number;
  total?: number;
  createdAt: string;
  deliveredAt?: string | null;
  store?: { name?: string | null; lat?: number | null; lng?: number | null } | null;
  deliveryAddress?: {
    label?: string | null;
    city?: string | null;
    pincode?: string | null;
    lat?: number | null;
    lng?: number | null;
  } | null;
}

// Active = currently assigned but not yet finished.
const ACTIVE_STATUSES = new Set(['DRIVER_ASSIGNED', 'PICKED_UP']);
// Past = finished one way or another.
const PAST_STATUSES = new Set(['DELIVERED', 'CANCELLED', 'REJECTED']);

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'destructive'> = {
  DELIVERED: 'success',
  CANCELLED: 'warning',
  REJECTED: 'destructive',
  PICKED_UP: 'default',
  DRIVER_ASSIGNED: 'default',
  STORE_ACCEPTED: 'default',
};

function statusLabel(s: string): string {
  return s
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DeliveriesPage() {
  return (
    <RequireAuth>
      <AppHeader />
      <main className="page-shell py-6">
        <DeliveriesList />
      </main>
    </RequireAuth>
  );
}

function DeliveriesList() {
  const query = useQuery<DeliveryRow[]>({
    queryKey: ['driverDeliveriesList'],
    queryFn: async () => {
      // Backend currently returns the latest 100 (no pagination cursor) —
      // see backend/src/routes/drivers.routes.ts `/deliveries`. We slice it
      // client-side into Active vs Past tabs.
      const r = await api.get('/api/v1/drivers/deliveries');
      return unwrapList<DeliveryRow>(r.data);
    },
    refetchInterval: 60_000,
  });

  const [tab, setTab] = useState<'active' | 'past'>('active');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DELIVERED' | 'CANCELLED' | 'REJECTED'>('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const rows = query.data ?? [];
  const active = useMemo(() => rows.filter((r) => ACTIVE_STATUSES.has(r.status)), [rows]);
  const past = useMemo(() => {
    let list = rows.filter((r) => PAST_STATUSES.has(r.status));
    if (statusFilter !== 'ALL') {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (fromDate) {
      const from = new Date(fromDate);
      from.setHours(0, 0, 0, 0);
      list = list.filter((r) => new Date(r.createdAt) >= from);
    }
    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      list = list.filter((r) => new Date(r.createdAt) <= to);
    }
    return list;
  }, [rows, statusFilter, fromDate, toDate]);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Deliveries</h1>
          <p className="mt-1 text-sm text-gray-500">
            {active.length === 1 ? '1 active' : `${active.length} active`} ·{' '}
            {past.length === 1 ? '1 past' : `${past.length} past`}
          </p>
        </div>
      </header>

      {query.isError ? (
        <ErrorPanel
          message="Couldn't load your deliveries."
          onRetry={() => query.refetch()}
        />
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'active' | 'past')}>
          <TabsList>
            <TabsTrigger value="active">
              Active{active.length > 0 ? ` (${active.length})` : ''}
            </TabsTrigger>
            <TabsTrigger value="past">Past</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-4">
            {query.isLoading ? (
              <ListSkeleton />
            ) : active.length === 0 ? (
              <EmptyPanel
                icon={<Bike className="h-6 w-6" />}
                title="No active deliveries"
                subtitle="Go online from the dashboard to start receiving delivery requests."
                action={
                  <Button asChild variant="default" size="sm">
                    <Link href="/">Open dashboard</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-3">
                {active.map((d) => (
                  <li key={d.id}>
                    <DeliveryRowLink d={d} />
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="past" className="mt-4 space-y-4">
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="past-status">Status</Label>
                    <Select
                      value={statusFilter}
                      onValueChange={(v) =>
                        setStatusFilter(v as typeof statusFilter)
                      }
                    >
                      <SelectTrigger id="past-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All statuses</SelectItem>
                        <SelectItem value="DELIVERED">Delivered</SelectItem>
                        <SelectItem value="CANCELLED">Cancelled</SelectItem>
                        <SelectItem value="REJECTED">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="from-date">From</Label>
                    <Input
                      id="from-date"
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="to-date">To</Label>
                    <Input
                      id="to-date"
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                    />
                  </div>
                </div>
                {statusFilter !== 'ALL' || fromDate || toDate ? (
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Showing {past.length}{' '}
                      {past.length === 1 ? 'delivery' : 'deliveries'}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setStatusFilter('ALL');
                        setFromDate('');
                        setToDate('');
                      }}
                    >
                      Clear filters
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {query.isLoading ? (
              <ListSkeleton />
            ) : past.length === 0 ? (
              <EmptyPanel
                icon={<Box className="h-6 w-6" />}
                title="No past deliveries"
                subtitle="Your delivery history will appear here once you complete your first order."
              />
            ) : (
              <ul className="space-y-3">
                {past.map((d) => (
                  <li key={d.id}>
                    <DeliveryRowLink d={d} />
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-32 w-full rounded-2xl" />
      ))}
    </div>
  );
}

function DeliveryRowLink({ d }: { d: DeliveryRow }) {
  const variant = STATUS_VARIANT[d.status] ?? 'default';
  const pickup = d.store?.name ?? 'Pickup';
  const drop =
    [d.deliveryAddress?.label, d.deliveryAddress?.city, d.deliveryAddress?.pincode]
      .filter(Boolean)
      .join(', ') || 'Delivery area';

  const earnings = d.driverEarnings ?? d.deliveryFee ?? 0;
  const distanceKm = haversine(d.store, d.deliveryAddress);

  return (
    <Link
      href={`/deliveries/${d.id}`}
      className="block rounded-2xl ring-offset-background transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card>
        <CardContent className="space-y-3 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-gray-900">{formatDate(d.createdAt)}</p>
              <p className="text-xs text-gray-500">{formatTime(d.createdAt)}</p>
            </div>
            <Badge variant={variant}>{statusLabel(d.status)}</Badge>
          </div>

          <div className="flex gap-3">
            <div className="flex flex-col items-center pt-1">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white">
                <StoreIcon className="h-2.5 w-2.5" />
              </div>
              <div className="my-1 w-0.5 flex-1 bg-gray-200" />
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white">
                <Home className="h-2.5 w-2.5" />
              </div>
            </div>

            <div className="flex-1 space-y-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  Pickup
                </p>
                <p className="text-sm font-semibold text-gray-900">{pickup}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  Delivery
                </p>
                <p className="text-sm font-semibold text-gray-900">{drop}</p>
              </div>
            </div>
            <ChevronRight className="mt-1 h-4 w-4 text-gray-300" />
          </div>

          <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-xs">
            <p className="flex items-center gap-3 text-gray-500">
              <span>Order #{d.id.slice(-8).toUpperCase()}</span>
              {distanceKm !== null ? (
                <span aria-label="distance">{distanceKm.toFixed(1)} km</span>
              ) : null}
            </p>
            <p className="text-base font-bold text-accent">+{rupeesPrecise(earnings)}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * Crow-flies distance between two lat/lng points, in km. Returns null when
 * either point is missing. Same approach as the backend matching engine — a
 * proper road-distance calc would require Maps API credits we don't spend
 * in the dashboard.
 */
function haversine(
  a: { lat?: number | null; lng?: number | null } | null | undefined,
  b: { lat?: number | null; lng?: number | null } | null | undefined,
): number | null {
  if (
    !a ||
    !b ||
    typeof a.lat !== 'number' ||
    typeof a.lng !== 'number' ||
    typeof b.lat !== 'number' ||
    typeof b.lng !== 'number'
  ) {
    return null;
  }
  const R = 6371;
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}
