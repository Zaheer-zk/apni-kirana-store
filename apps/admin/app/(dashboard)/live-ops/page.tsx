'use client';

import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Loader2, Radio } from 'lucide-react';
import { api } from '@/lib/api';

// Leaflet must be dynamically imported (it touches window at module load).
const LiveOpsMap = dynamic(() => import('@/components/LiveOpsMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
    </div>
  ),
});

type LiveOrder = {
  id: string;
  status: 'PENDING' | 'STORE_ACCEPTED' | 'DRIVER_ASSIGNED' | 'PICKED_UP';
  createdAt: string;
  total: number;
  customer: { id: string; name: string | null; phone: string | null };
  store: { id: string; name: string; lat: number; lng: number };
  driver: {
    id: string;
    currentLat: number | null;
    currentLng: number | null;
    user: { id: string; name: string | null; phone: string | null };
  } | null;
  deliveryAddress: { lat: number; lng: number; street: string; city: string };
};

type LiveDriver = {
  id: string;
  status: 'ONLINE' | 'OFFLINE';
  currentLat: number;
  currentLng: number;
  user: { id: string; name: string | null; phone: string | null };
};

export type LiveOpsSnapshot = {
  orders: LiveOrder[];
  drivers: LiveDriver[];
  generatedAt: string;
};

const STATUS_TONE: Record<LiveOrder['status'], { bg: string; text: string; label: string }> = {
  PENDING: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pending' },
  STORE_ACCEPTED: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Accepted' },
  DRIVER_ASSIGNED: { bg: 'bg-violet-100', text: 'text-violet-700', label: 'Driver assigned' },
  PICKED_UP: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Picked up' },
};

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

export default function LiveOpsPage() {
  // Refetch every 5s. Cheap on the server (single query with selective
  // includes); good enough granularity for ops monitoring.
  const snap = useQuery({
    queryKey: ['admin-live-ops'],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: LiveOpsSnapshot }>('/api/v1/admin/live-ops');
      return res.data.data;
    },
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  const orders = snap.data?.orders ?? [];
  const drivers = snap.data?.drivers ?? [];
  const onlineDrivers = drivers.filter((d) => d.status === 'ONLINE').length;

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Radio className="h-5 w-5 text-emerald-600 animate-pulse" aria-hidden />
            Live operations
          </h1>
          <p className="text-sm text-gray-500">
            Active orders + online drivers across the city. Refreshes every 5 seconds.
          </p>
        </div>
        <div className="flex gap-6 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500">Active orders</p>
            <p className="text-2xl font-bold text-gray-900">{orders.length}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500">Online drivers</p>
            <p className="text-2xl font-bold text-emerald-700">{onlineDrivers}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500">Last refresh</p>
            <p className="text-sm text-gray-700">
              {snap.data?.generatedAt ? new Date(snap.data.generatedAt).toLocaleTimeString() : '—'}
            </p>
          </div>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[2fr_1fr]">
        {/* Map */}
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          {snap.isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : snap.isError ? (
            <div className="flex h-full items-center justify-center text-sm text-red-600">
              Failed to load live snapshot.
            </div>
          ) : (
            <LiveOpsMap orders={orders} drivers={drivers} />
          )}
        </section>

        {/* Sidebar list */}
        <aside className="overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <header className="sticky top-0 z-10 border-b border-gray-100 bg-white px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Active orders ({orders.length})
            </p>
          </header>
          {orders.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-400">No active orders right now.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {orders.map((o) => {
                const tone = STATUS_TONE[o.status];
                return (
                  <li key={o.id} className="px-4 py-3 hover:bg-gray-50">
                    <Link href={`/orders/${o.id}`} className="block">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {o.store.name}
                          </p>
                          <p className="truncate text-xs text-gray-500">
                            → {o.deliveryAddress.street}, {o.deliveryAddress.city}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone.bg} ${tone.text}`}>
                          {tone.label}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
                        <span>
                          {o.customer.name ?? 'Customer'} · ₹{o.total.toFixed(0)}
                          {o.driver ? ` · ${o.driver.user.name ?? 'Driver'}` : ''}
                        </span>
                        <span>{timeAgo(o.createdAt)}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
