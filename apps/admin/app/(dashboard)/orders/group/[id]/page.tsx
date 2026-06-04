'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, MapPin, Store as StoreIcon, Truck } from 'lucide-react';
import { api } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import type { OrderStatus } from '@aks/shared';

/**
 * Admin rollup for a multi-store OrderGroup. Read-only for now —
 * per-leg accept / reject / driver-assign still happens on the
 * individual /orders/{legId} pages, which the admin can drill into
 * from this view. Future work: group-level cancel-all and
 * coordinated rescue.
 */

interface PerLegStore {
  id: string;
  name: string;
  lat: number;
  lng: number;
  city?: string | null;
  street?: string | null;
}

interface PerLeg {
  id: string;
  status: OrderStatus;
  subtotal: number;
  total: number;
  storeId: string;
  store?: PerLegStore | null;
  items: Array<{ id: string }>;
  pickedUpAt: string | null;
}

interface OrderGroupRollup {
  id: string;
  customerId: string;
  status: OrderStatus;
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  driverId: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  createdAt: string;
  deliveryAddress: {
    label: string;
    street: string;
    city: string;
    pincode: string;
    lat: number;
    lng: number;
  } | null;
  orders: PerLeg[];
}

export default function AdminOrderGroupPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const groupQuery = useQuery<OrderGroupRollup>({
    queryKey: ['admin-order-group', id],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: OrderGroupRollup }>(
        `/api/v1/orders/group/${id}`,
      );
      return res.data.data!;
    },
    enabled: !!id,
    refetchInterval: 15_000,
  });

  if (groupQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-48 animate-pulse rounded bg-gray-200" />
        <div className="h-32 animate-pulse rounded bg-gray-100" />
      </div>
    );
  }

  if (groupQuery.isError || !groupQuery.data) {
    return (
      <div className="card flex flex-col items-center gap-2 p-10 text-center">
        <p className="font-semibold text-gray-900">Couldn't load group</p>
        <button
          onClick={() => groupQuery.refetch()}
          className="btn-primary"
        >
          Retry
        </button>
      </div>
    );
  }

  const group = groupQuery.data;
  const pickedUp = group.orders.filter((o) => !!o.pickedUpAt).length;

  return (
    <div className="space-y-5">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Orders
      </Link>

      <header>
        <h1 className="text-2xl font-bold text-gray-900">
          Multi-store order · {group.orders.length} stores
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
          <span>#{group.id.slice(-8).toUpperCase()}</span>
          <span>·</span>
          <span>
            Placed{' '}
            {new Date(group.createdAt).toLocaleString('en-IN', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </span>
          <span>·</span>
          <StatusBadge status={group.status} />
        </div>
      </header>

      {/* Aggregate summary — what the customer paid total. Per-leg
          numbers below are the per-store payout slice. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Items subtotal" value={`₹${group.subtotal.toFixed(0)}`} />
        <SummaryCard label="Delivery fee" value={`₹${group.deliveryFee.toFixed(0)}`} />
        <SummaryCard label="Total" value={`₹${group.total.toFixed(0)}`} bold />
        <SummaryCard
          label="Driver pickups"
          value={`${pickedUp} / ${group.orders.length}`}
          icon={<Truck className="h-4 w-4 text-primary" />}
        />
      </div>

      {/* Recipient + dropoff */}
      <div className="card p-4 sm:p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Delivery
        </h2>
        <p className="mt-2 font-medium text-gray-900">
          {group.recipientName ?? '—'}{' '}
          {group.recipientPhone ? (
            <span className="font-normal text-gray-500">
              · {group.recipientPhone}
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 text-sm text-gray-600">
          {group.deliveryAddress?.label}
          {group.deliveryAddress?.street ? ` · ${group.deliveryAddress.street}` : ''}
          {group.deliveryAddress?.city ? `, ${group.deliveryAddress.city}` : ''}
          {group.deliveryAddress?.pincode ? ` ${group.deliveryAddress.pincode}` : ''}
        </p>
        {group.driverId ? (
          <p className="mt-1 text-xs text-gray-500">
            Single driver assigned ·{' '}
            <Link
              href={`/drivers/${group.driverId}`}
              className="font-semibold text-primary hover:underline"
            >
              View driver →
            </Link>
          </p>
        ) : (
          <p className="mt-1 text-xs text-amber-700">
            No driver assigned yet — group must accept on every leg before
            matching kicks in.
          </p>
        )}
      </div>

      {/* Per-store legs — admin drills into each leg's existing detail
          page for accept / driver-assign / refund / etc. */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Per-store legs
        </h2>
        <div className="space-y-2">
          {group.orders.map((leg, idx) => (
            <Link
              key={leg.id}
              href={`/orders/${leg.id}`}
              className="card flex items-center gap-4 p-4 transition hover:border-gray-300 hover:shadow-md sm:p-5"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-700">
                <StoreIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-gray-900">
                    {idx + 1}. {leg.store?.name ?? '—'}
                  </p>
                  <StatusBadge status={leg.status} />
                  {leg.pickedUpAt ? (
                    <span className="text-xs font-semibold text-emerald-700">
                      ✓ Picked up
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                  <MapPin className="h-3 w-3" />
                  {leg.store?.city ?? '—'}
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  {leg.items.length} item{leg.items.length === 1 ? '' : 's'} ·{' '}
                  ₹{leg.subtotal.toFixed(0)}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  bold = false,
  icon,
}: {
  label: string;
  value: string;
  bold?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {icon}
        <span>{label}</span>
      </div>
      <p
        className={`mt-1 ${
          bold ? 'text-2xl font-bold text-gray-900' : 'text-xl font-semibold text-gray-900'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
