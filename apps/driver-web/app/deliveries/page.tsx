'use client';

import { useQuery } from '@tanstack/react-query';
import { Box, Home, Store as StoreIcon } from 'lucide-react';
import { Badge } from '@aks/ui/components/badge';
import { Card, CardContent } from '@aks/ui/components/card';
import { Skeleton } from '@aks/ui/components/skeleton';
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
  store?: { name?: string | null; lat?: number; lng?: number } | null;
  deliveryAddress?: {
    label?: string | null;
    city?: string | null;
    pincode?: string | null;
  } | null;
}

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
      const r = await api.get('/api/v1/drivers/deliveries');
      return unwrapList<DeliveryRow>(r.data);
    },
  });

  const count = query.data?.length ?? 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Delivery history</h1>
        <p className="mt-1 text-sm text-gray-500">
          {count === 1 ? '1 delivery completed' : `${count} deliveries completed`}
        </p>
      </header>

      {query.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-2xl" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorPanel
          message="Couldn't load your delivery history."
          onRetry={() => query.refetch()}
        />
      ) : count === 0 ? (
        <EmptyPanel
          icon={<Box className="h-6 w-6" />}
          title="No deliveries yet"
          subtitle="Go online from the dashboard to start receiving delivery requests."
        />
      ) : (
        <ul className="space-y-3">
          {query.data!.map((d) => (
            <li key={d.id}>
              <DeliveryCard d={d} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DeliveryCard({ d }: { d: DeliveryRow }) {
  const variant = STATUS_VARIANT[d.status] ?? 'default';
  const pickup = d.store?.name ?? 'Pickup';
  const drop =
    [d.deliveryAddress?.label, d.deliveryAddress?.city, d.deliveryAddress?.pincode]
      .filter(Boolean)
      .join(', ') || 'Delivery area';

  const earnings = d.driverEarnings ?? d.deliveryFee ?? 0;

  return (
    <Card>
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex items-start justify-between">
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
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Pickup</p>
              <p className="text-sm font-semibold text-gray-900">{pickup}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Delivery</p>
              <p className="text-sm font-semibold text-gray-900">{drop}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 pt-3">
          <p className="text-xs text-gray-500">Order #{d.id.slice(-8).toUpperCase()}</p>
          <p className="text-base font-bold text-accent">+{rupeesPrecise(earnings)}</p>
        </div>
      </CardContent>
    </Card>
  );
}
