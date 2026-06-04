'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  IndianRupee,
  Loader2,
  MapPin,
  Store as StoreIcon,
  Truck,
} from 'lucide-react';
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
  const queryClient = useQueryClient();
  const [codToast, setCodToast] = useState<string | null>(null);

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

  // Group-level COD settlement — flips codCollected on every leg at
  // once. The driver hands over ONE lump sum at the door for the
  // group's full total; settling per-leg would force the admin to
  // reconcile N times for the same cash drop. See backend handler at
  // PUT /api/v1/admin/order-groups/:id/cod-collected.
  const settleCodMutation = useMutation({
    mutationFn: async (collected: boolean) => {
      const res = await api.put<{ success: boolean; data: { settledLegs: number } }>(
        `/api/v1/admin/order-groups/${id}/cod-collected`,
        { collected },
      );
      return res.data.data;
    },
    onSuccess: (data, collected) => {
      queryClient.invalidateQueries({ queryKey: ['admin-order-group', id] });
      setCodToast(
        collected
          ? `COD settled across ${data?.settledLegs ?? 0} legs.`
          : 'COD un-settled.',
      );
      setTimeout(() => setCodToast(null), 3500);
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setCodToast(
        e?.response?.data?.error?.message ?? 'Could not update COD status.',
      );
      setTimeout(() => setCodToast(null), 4500);
    },
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
  const isCod = group.paymentMethod === 'CASH_ON_DELIVERY';
  const allDelivered =
    group.orders.length > 0 &&
    group.orders
      .filter((o) => o.status !== 'CANCELLED')
      .every((o) => o.status === 'DELIVERED');
  const codSettled = isCod && group.paymentStatus === 'PAID';

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

      {/* COD settlement (multi-store) — one button reconciles cash across
          every leg because the driver collected the group total as ONE
          lump sum at the door. Disabled until every non-cancelled leg
          is DELIVERED. Hidden for non-COD groups. */}
      {isCod ? (
        <div
          className={`card flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5 ${
            codSettled
              ? 'border-emerald-200 bg-emerald-50'
              : allDelivered
                ? 'border-amber-200 bg-amber-50'
                : ''
          }`}
        >
          <div className="flex items-start gap-3">
            <IndianRupee className="mt-0.5 h-5 w-5 flex-shrink-0 text-gray-600" />
            <div>
              <p className="font-semibold text-gray-900">
                Cash on delivery — group total ₹{group.total.toFixed(0)}
              </p>
              <p className="mt-0.5 text-xs text-gray-600">
                {codSettled
                  ? 'Driver has handed in the cash. Per-store payouts now include each leg.'
                  : allDelivered
                    ? 'Driver delivered all legs. Settle when the cash drop is reconciled.'
                    : `Will be settleable after all ${group.orders.length} legs are delivered (${group.orders.filter((o) => o.status === 'DELIVERED').length}/${group.orders.length} done).`}
              </p>
              {codToast ? (
                <p className="mt-1 text-xs font-semibold text-primary-700">
                  {codToast}
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            disabled={
              settleCodMutation.isPending ||
              (!codSettled && !allDelivered)
            }
            onClick={() => settleCodMutation.mutate(!codSettled)}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {settleCodMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : codSettled ? (
              'Un-settle'
            ) : (
              'Mark COD settled'
            )}
          </button>
        </div>
      ) : null}

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
        <GroupDriverAssignBlock
          groupId={group.id}
          seedLegId={group.orders[0]?.id ?? null}
          currentDriverId={group.driverId}
        />
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

interface EligibleDriver {
  id: string;
  user: { id: string; name: string | null; phone: string };
  vehicleType?: string | null;
  vehicleNumber?: string | null;
  rating: number;
  distanceKm: number | null;
  inZone?: boolean;
  zoneRank?: number | null;
}

/**
 * Group-level driver assign / reassign. We reuse the per-leg
 * GET /admin/orders/:id/eligible-drivers endpoint with the FIRST leg as
 * the seed (eligibility is computed against each store's pickup point;
 * using the first leg is a reasonable proxy for ranking — admin can
 * still see the full list and pick). On submit we hit the new
 * PUT /admin/order-groups/:id/assign-driver which fans the chosen
 * driver across every sibling leg + the parent group via
 * order-group.service.ts:assignDriverToGroup.
 */
function GroupDriverAssignBlock({
  groupId,
  seedLegId,
  currentDriverId,
}: {
  groupId: string;
  seedLegId: string | null;
  currentDriverId: string | null;
}) {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<string | null>(null);

  const eligibleQuery = useQuery<EligibleDriver[]>({
    queryKey: ['admin-group-eligible-drivers', seedLegId],
    enabled: !!seedLegId,
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: EligibleDriver[] }>(
        `/api/v1/admin/orders/${seedLegId}/eligible-drivers`,
      );
      return res.data.data ?? [];
    },
  });

  const assignMutation = useMutation({
    mutationFn: async (args: { driverId: string; force?: boolean }) => {
      const res = await api.put<{
        success: boolean;
        data: { fannedToLegs: number };
      }>(`/api/v1/admin/order-groups/${groupId}/assign-driver`, args);
      return res.data.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-order-group', groupId] });
      setToast(
        `Driver fanned across ${data?.fannedToLegs ?? 0} legs.`,
      );
      setTimeout(() => setToast(null), 3500);
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setToast(e?.response?.data?.error?.message ?? 'Could not assign driver.');
      setTimeout(() => setToast(null), 4500);
    },
  });

  function handleAssign(d: EligibleDriver) {
    const outOfZone = d.zoneRank === null || d.inZone === false;
    if (
      outOfZone &&
      !window.confirm(
        "This driver doesn't serve the group's delivery zone. Assign anyway?",
      )
    ) {
      return;
    }
    assignMutation.mutate({ driverId: d.id, force: outOfZone });
  }

  const drivers = (eligibleQuery.data ?? []).slice(0, 8);
  if (!seedLegId) return null;

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {currentDriverId ? 'Reassign driver' : 'Assign driver'}
        </p>
        {toast ? (
          <span className="text-xs text-primary-700">{toast}</span>
        ) : null}
      </div>
      {eligibleQuery.isLoading ? (
        <p className="mt-2 text-xs text-gray-400">Loading drivers…</p>
      ) : drivers.length === 0 ? (
        <p className="mt-2 text-xs text-gray-400">
          No online drivers right now.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {drivers.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-2 rounded-md border border-gray-100 bg-gray-50/60 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-gray-900">
                  {d.user.name ?? 'Driver'}{' '}
                  <span className="text-xs text-gray-500">
                    · {d.vehicleType ?? '—'}
                  </span>
                </p>
                <p className="text-[11px] text-gray-500">
                  {d.distanceKm != null ? `${d.distanceKm} km` : '—'} ·{' '}
                  {d.zoneRank === 0
                    ? 'In zone'
                    : d.zoneRank == null
                      ? 'Out of zone'
                      : `Fallback zone #${d.zoneRank}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleAssign(d)}
                disabled={assignMutation.isPending || d.id === currentDriverId}
                className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {assignMutation.isPending &&
                assignMutation.variables?.driverId === d.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : d.id === currentDriverId ? (
                  'Current'
                ) : currentDriverId ? (
                  'Switch'
                ) : (
                  'Assign'
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
