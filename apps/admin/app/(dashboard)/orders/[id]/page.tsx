'use client';

import { use, useEffect, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  ArrowLeft,
  User,
  Store as StoreIcon,
  Bike,
  Clock,
  Package,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  KeyRound,
  Star,
  RefreshCcw,
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import { OrderStatus } from '@aks/shared';

interface DeliveryAddress {
  street: string;
  city: string;
  pincode?: string;
  lat: number;
  lng: number;
}

interface OrderItem {
  itemId: string;
  catalogItemId?: string;
  name: string;
  unit: string;
  qty: number;
  price: number;
}

interface Customer {
  id: string;
  name: string | null;
  phone: string;
}

interface OrderStore {
  id: string;
  name: string;
  address?: string;
  city?: string;
  lat?: number;
  lng?: number;
  owner?: { name: string | null; phone?: string };
}

interface OrderDriver {
  id: string;
  vehicleType?: string | null;
  vehicleNumber?: string | null;
  rating?: number | null;
  user?: { name: string | null; phone?: string };
}

interface OrderRating {
  rating: number;
  comment?: string | null;
}

interface OrderDetail {
  id: string;
  status: OrderStatus;
  subtotal: number;
  deliveryFee: number;
  commission?: number;
  total: number;
  paymentMethod?: string;
  paymentStatus?: string;
  dropoffOtp?: string | null;
  createdAt: string;
  updatedAt?: string;
  acceptedAt?: string | null;
  driverAssignedAt?: string | null;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  customer: Customer;
  store: OrderStore | null;
  driver: OrderDriver | null;
  items: OrderItem[];
  deliveryAddress: DeliveryAddress;
  rating?: OrderRating | null;
}

interface ToastState {
  id: number;
  type: 'success' | 'error';
  message: string;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: 'Order placed',
  [OrderStatus.STORE_ACCEPTED]: 'Accepted by store',
  [OrderStatus.DRIVER_ASSIGNED]: 'Driver assigned',
  [OrderStatus.PICKED_UP]: 'Picked up',
  [OrderStatus.DELIVERED]: 'Delivered',
  [OrderStatus.CANCELLED]: 'Cancelled',
  [OrderStatus.REJECTED]: 'Rejected',
};

interface AdminStore {
  id: string;
  name: string;
  city?: string;
  status: string;
}

interface AdminDriver {
  id: string;
  status: string;
  vehicleType?: string | null;
  vehicleNumber?: string | null;
  user?: { name: string | null; phone?: string };
}

function SectionCard({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="text-primary">{icon}</div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="max-w-xs text-right font-medium text-gray-900">{value}</span>
    </div>
  );
}

export default function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();

  const [storeChoice, setStoreChoice] = useState('');
  const [driverChoice, setDriverChoice] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [refundError, setRefundError] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const { data, isLoading, isError } = useQuery<OrderDetail>({
    queryKey: ['admin-order', id],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: OrderDetail }>(
        `/api/v1/admin/orders/${id}`
      );
      return res.data.data!;
    },
  });

  const { data: storeOptions } = useQuery<AdminStore[]>({
    queryKey: ['admin-stores-active-options'],
    queryFn: async () => {
      const res = await api.get<{
        success: boolean;
        data: { stores: AdminStore[] };
      }>('/api/v1/admin/stores?status=ACTIVE');
      return res.data.data?.stores ?? [];
    },
  });

  const { data: driverOptionsOnline } = useQuery<AdminDriver[]>({
    queryKey: ['admin-drivers-online-options'],
    queryFn: async () => {
      const res = await api.get<{
        success: boolean;
        data: { drivers: AdminDriver[] };
      }>('/api/v1/admin/drivers?status=ONLINE');
      return res.data.data?.drivers ?? [];
    },
  });

  const { data: driverOptionsActive } = useQuery<AdminDriver[]>({
    queryKey: ['admin-drivers-active-options'],
    queryFn: async () => {
      const res = await api.get<{
        success: boolean;
        data: { drivers: AdminDriver[] };
      }>('/api/v1/admin/drivers?status=ACTIVE');
      return res.data.data?.drivers ?? [];
    },
  });

  const driverOptions: AdminDriver[] = (() => {
    const map = new Map<string, AdminDriver>();
    [...(driverOptionsOnline ?? []), ...(driverOptionsActive ?? [])].forEach((d) => {
      map.set(d.id, d);
    });
    return Array.from(map.values());
  })();

  const assignStoreMutation = useMutation({
    mutationFn: async (storeId: string) => {
      const res = await api.put<{ success: boolean; data: OrderDetail }>(
        `/api/v1/admin/orders/${id}/assign-store`,
        { storeId }
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-order', id] });
      setStoreChoice('');
      setToast({ id: Date.now(), type: 'success', message: 'Store reassigned successfully.' });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setToast({
        id: Date.now(),
        type: 'error',
        message: e?.response?.data?.error?.message ?? 'Failed to reassign store.',
      });
    },
  });

  const assignDriverMutation = useMutation({
    mutationFn: async (driverId: string) => {
      const res = await api.put<{ success: boolean; data: OrderDetail }>(
        `/api/v1/admin/orders/${id}/assign-driver`,
        { driverId }
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-order', id] });
      setDriverChoice('');
      setToast({ id: Date.now(), type: 'success', message: 'Driver assigned successfully.' });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setToast({
        id: Date.now(),
        type: 'error',
        message: e?.response?.data?.error?.message ?? 'Failed to assign driver.',
      });
    },
  });

  const refundMutation = useMutation({
    mutationFn: async (reason: string) => {
      const body: Record<string, unknown> = {};
      if (reason.trim()) body.reason = reason.trim();
      const res = await api.put<{ success: boolean; data: OrderDetail }>(
        `/api/v1/admin/orders/${id}/refund`,
        body
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-order', id] });
      setRefundOpen(false);
      setRefundReason('');
      setRefundError(null);
      setToast({ id: Date.now(), type: 'success', message: 'Refund issued successfully.' });
    },
    onError: (err: unknown) => {
      const e = err as {
        response?: { status?: number; data?: { error?: { message?: string } } };
      };
      const message = e?.response?.data?.error?.message ?? 'Failed to issue refund.';
      if (e?.response?.status === 409) {
        setRefundError(message);
      } else {
        setRefundError(message);
      }
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-60 rounded bg-gray-200" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card h-44" />
          ))}
        </div>
        <div className="card h-64" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="py-20 text-center">
        <p className="text-red-500">Failed to load order details.</p>
        <Link
          href="/orders"
          className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Orders
        </Link>
      </div>
    );
  }

  const timeline: { status: OrderStatus; ts: string | null | undefined }[] = [
    { status: OrderStatus.PENDING, ts: data.createdAt },
    { status: OrderStatus.STORE_ACCEPTED, ts: data.acceptedAt },
    { status: OrderStatus.DRIVER_ASSIGNED, ts: data.driverAssignedAt },
    { status: OrderStatus.PICKED_UP, ts: data.pickedUpAt },
    { status: OrderStatus.DELIVERED, ts: data.deliveredAt },
  ];
  if (data.cancelledAt) {
    timeline.push({ status: OrderStatus.CANCELLED, ts: data.cancelledAt });
  }

  const fullAddress = [
    data.deliveryAddress.street,
    data.deliveryAddress.city,
    data.deliveryAddress.pincode,
  ]
    .filter(Boolean)
    .join(', ');

  const customerLabel =
    data.customer?.name ?? data.customer?.phone ?? 'Unknown';

  const showOtp =
    !!data.dropoffOtp &&
    data.status !== OrderStatus.DELIVERED &&
    data.status !== OrderStatus.CANCELLED &&
    data.status !== OrderStatus.REJECTED;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/orders"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Orders
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Order #{data.id.slice(-8).toUpperCase()}
            </h1>
            <p className="mt-1 text-sm text-gray-400">
              Placed on{' '}
              {new Date(data.createdAt).toLocaleString('en-IN', {
                dateStyle: 'long',
                timeStyle: 'short',
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Status banner */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={data.status} />
          <span className="text-sm text-gray-500">
            Last updated{' '}
            {new Date(data.updatedAt ?? data.createdAt).toLocaleString('en-IN', {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </span>
          {data.paymentStatus && (
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                data.paymentStatus === 'REFUNDED'
                  ? 'bg-orange-50 text-orange-700 border-orange-200'
                  : data.paymentStatus === 'PAID'
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'bg-gray-100 text-gray-600 border-gray-200'
              }`}
            >
              {data.paymentStatus}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {data.paymentStatus !== 'REFUNDED' && (
            <button
              onClick={() => {
                setRefundReason('');
                setRefundError(null);
                setRefundOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Issue refund
            </button>
          )}
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-gray-400">Total</p>
            <p className="text-xl font-bold text-primary">
              ₹{data.total.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Customer */}
        <SectionCard title="Customer" icon={<User className="h-4 w-4" />}>
          <div className="space-y-2">
            <InfoLine label="Name" value={customerLabel} />
            <InfoLine label="Phone" value={data.customer?.phone ?? '—'} />
            <InfoLine label="Address" value={fullAddress || '—'} />
            <InfoLine
              label="Coordinates"
              value={`${data.deliveryAddress.lat.toFixed(5)}, ${data.deliveryAddress.lng.toFixed(5)}`}
            />
          </div>
        </SectionCard>

        {/* Store */}
        <SectionCard title="Store" icon={<StoreIcon className="h-4 w-4" />}>
          {data.store ? (
            <div className="space-y-2">
              <InfoLine label="Name" value={data.store.name} />
              <InfoLine label="Owner" value={data.store.owner?.name ?? '—'} />
              <InfoLine
                label="Address"
                value={
                  [data.store.address, data.store.city]
                    .filter(Boolean)
                    .join(', ') || '—'
                }
              />
            </div>
          ) : (
            <p className="text-sm text-gray-400">No store linked.</p>
          )}

          <div className="mt-4 border-t border-gray-100 pt-4">
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Reassign to…
            </label>
            <div className="flex gap-2">
              <select
                value={storeChoice}
                onChange={(e) => setStoreChoice(e.target.value)}
                className="input flex-1"
                disabled={assignStoreMutation.isPending}
              >
                <option value="">Select an active store…</option>
                {(storeOptions ?? [])
                  .filter((s) => s.id !== data.store?.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.city ? ` — ${s.city}` : ''}
                    </option>
                  ))}
              </select>
              <button
                onClick={() => storeChoice && assignStoreMutation.mutate(storeChoice)}
                disabled={!storeChoice || assignStoreMutation.isPending}
                className="btn-primary"
              >
                {assignStoreMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Assign'
                )}
              </button>
            </div>
          </div>
        </SectionCard>

        {/* Driver */}
        <SectionCard title="Driver" icon={<Bike className="h-4 w-4" />}>
          {data.driver ? (
            <div className="space-y-2">
              <InfoLine label="Name" value={data.driver.user?.name ?? '—'} />
              <InfoLine label="Phone" value={data.driver.user?.phone ?? '—'} />
              <InfoLine
                label="Vehicle"
                value={
                  [data.driver.vehicleType, data.driver.vehicleNumber]
                    .filter(Boolean)
                    .join(' • ') || '—'
                }
              />
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Rating</span>
                <span className="inline-flex items-center gap-1 font-medium text-gray-900">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  {data.driver.rating != null ? data.driver.rating.toFixed(1) : '—'}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Not assigned.</p>
          )}

          <div className="mt-4 border-t border-gray-100 pt-4">
            <label className="mb-1 block text-xs font-medium text-gray-600">
              {data.driver ? 'Reassign driver…' : 'Assign driver…'}
            </label>
            <div className="flex gap-2">
              <select
                value={driverChoice}
                onChange={(e) => setDriverChoice(e.target.value)}
                className="input flex-1"
                disabled={assignDriverMutation.isPending}
              >
                <option value="">Select a driver…</option>
                {driverOptions
                  .filter((d) => d.id !== data.driver?.id)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.user?.name ?? 'Driver'} • {d.status}
                      {d.vehicleNumber ? ` • ${d.vehicleNumber}` : ''}
                    </option>
                  ))}
              </select>
              <button
                onClick={() =>
                  driverChoice && assignDriverMutation.mutate(driverChoice)
                }
                disabled={!driverChoice || assignDriverMutation.isPending}
                className="btn-primary"
              >
                {assignDriverMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Assign'
                )}
              </button>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Items */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-4 sm:px-6">
          <Package className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold text-gray-900">
            Items ({data.items.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-6 py-3 text-left font-medium text-gray-500">Item</th>
              <th className="px-6 py-3 text-left font-medium text-gray-500">Unit</th>
              <th className="px-6 py-3 text-right font-medium text-gray-500">Qty</th>
              <th className="px-6 py-3 text-right font-medium text-gray-500">Price</th>
              <th className="px-6 py-3 text-right font-medium text-gray-500">Line Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.items.map((item) => (
              <tr key={item.itemId}>
                <td className="px-6 py-3 font-medium text-gray-900">{item.name}</td>
                <td className="px-6 py-3 text-gray-500">{item.unit}</td>
                <td className="px-6 py-3 text-right text-gray-700">{item.qty}</td>
                <td className="px-6 py-3 text-right text-gray-700">
                  ₹{item.price.toFixed(2)}
                </td>
                <td className="px-6 py-3 text-right font-medium text-gray-900">
                  ₹{(item.price * item.qty).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-100 bg-gray-50">
              <td colSpan={4} className="px-6 py-3 text-right text-sm text-gray-500">
                Subtotal
              </td>
              <td className="px-6 py-3 text-right font-medium text-gray-900">
                ₹{data.subtotal.toFixed(2)}
              </td>
            </tr>
            <tr>
              <td colSpan={4} className="px-6 py-3 text-right text-sm text-gray-500">
                Delivery Fee
              </td>
              <td className="px-6 py-3 text-right font-medium text-gray-900">
                ₹{data.deliveryFee.toFixed(2)}
              </td>
            </tr>
            {data.commission != null && (
              <tr>
                <td colSpan={4} className="px-6 py-3 text-right text-sm text-gray-500">
                  Platform Commission
                </td>
                <td className="px-6 py-3 text-right font-medium text-gray-900">
                  ₹{data.commission.toFixed(2)}
                </td>
              </tr>
            )}
            <tr className="border-t border-gray-200">
              <td colSpan={4} className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                Total
              </td>
              <td className="px-6 py-3 text-right text-base font-bold text-primary">
                ₹{data.total.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
        </div>
      </div>

      {/* OTP */}
      {showOtp && (
        <div className="card flex items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Dropoff OTP</p>
              <p className="text-xs text-gray-500">
                Customer must share this 4-digit code at delivery.
              </p>
            </div>
          </div>
          <div className="font-mono text-3xl font-bold tracking-[0.4em] text-primary tabular-nums">
            {data.dropoffOtp}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="card p-4 sm:p-6">
        <div className="mb-5 flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold text-gray-900">Status Timeline</h3>
        </div>
        <ol className="relative space-y-5 border-l border-gray-200 pl-5">
          {timeline.map((event, i) => {
            const reached = !!event.ts;
            return (
              <li key={i} className="relative">
                <div
                  className={`absolute -left-[21px] top-0.5 flex h-3 w-3 items-center justify-center rounded-full border-2 border-white ${
                    reached ? 'bg-primary' : 'bg-gray-300'
                  }`}
                />
                <div className="flex items-baseline justify-between">
                  <p
                    className={`text-sm font-medium ${
                      reached ? 'text-gray-900' : 'text-gray-400'
                    }`}
                  >
                    {STATUS_LABELS[event.status] ?? event.status}
                  </p>
                  {reached && event.ts && (
                    <time className="text-xs text-gray-400">
                      {new Date(event.ts).toLocaleString('en-IN', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </time>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Refund modal */}
      {refundOpen && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center overflow-y-auto bg-gray-900/50 sm:items-center sm:p-4">
          <div className="card flex w-full max-w-md flex-col rounded-none p-4 sm:rounded-lg sm:p-6">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-50 text-red-600">
                  <RefreshCcw className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Issue refund
                  </h2>
                  <p className="text-xs text-gray-500">
                    Refund ₹{data.total.toFixed(2)} to the customer
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (refundMutation.isPending) return;
                  setRefundOpen(false);
                  setRefundError(null);
                }}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                disabled={refundMutation.isPending}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-gray-700">
                This will mark the payment as <strong>REFUNDED</strong>
                {data.status !== OrderStatus.DELIVERED && (
                  <> and <strong>cancel the order</strong></>
                )}
                . The customer will be notified. This action is logged.
              </p>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Reason (optional but recommended)
                </label>
                <textarea
                  className="input min-h-[80px]"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="e.g. Customer reported missing items"
                  maxLength={500}
                  disabled={refundMutation.isPending}
                />
              </div>

              {refundError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{refundError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setRefundOpen(false);
                    setRefundError(null);
                  }}
                  className="btn-secondary"
                  disabled={refundMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => refundMutation.mutate(refundReason)}
                  disabled={refundMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded-md border border-red-600 bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {refundMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-4 w-4" />
                  )}
                  Confirm refund
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <div
            className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg ${
              toast.type === 'success'
                ? 'border-green-200 bg-white text-green-800'
                : 'border-red-200 bg-white text-red-800'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 text-red-600" />
            )}
            <span>{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="ml-2 text-gray-400 hover:text-gray-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
