'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  IndianRupee,
  Lock,
  MapPin,
  MessageCircle,
  PackageCheck,
  Phone,
  Truck,
  User,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@aks/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@aks/ui/components/card';
import { Skeleton } from '@aks/ui/components/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@aks/ui/components/dialog';
import { toast } from '@aks/ui/components/sonner';
import type { OrderDetail } from '@aks/shared';
import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { ErrorPanel } from '@/components/StatePanels';
import { DeliveryMap } from '@/components/DeliveryMap';
import { api } from '@/lib/api';
import { rupees, shortOrderId } from '@/lib/format';
import { useOrderSocket } from '@/lib/useOrderSocket';

const STATUS_TIMELINE_LABELS: Record<string, string> = {
  PENDING: 'Order placed',
  STORE_ACCEPTED: 'Store accepted',
  STORE_REJECTED: 'Store rejected',
  DRIVER_ASSIGNED: 'Driver assigned',
  PICKED_UP: 'Picked up',
  IN_TRANSIT: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected',
};

/**
 * Reasons offered to the store owner when rejecting an order. The matching
 * engine doesn't act on the text — it just re-queues the order against the
 * next candidate — so this list exists mostly to:
 *   1. Make rejection a deliberate, structured choice rather than a free-text
 *      shrug.
 *   2. Give admins something to spot patterns in (e.g. a particular store
 *      rejecting everything as "closing soon" needs operations follow-up).
 */
const REJECT_REASONS = [
  { value: 'OUT_OF_STOCK', label: 'Out of stock' },
  { value: 'CLOSING_SOON', label: 'Closing soon — can\'t prepare in time' },
  { value: 'TOO_BUSY', label: 'Too busy right now' },
  { value: 'CANT_FULFILL', label: 'Can\'t fulfill this order' },
  { value: 'OTHER', label: 'Other (describe below)' },
] as const;
type RejectReasonValue = (typeof REJECT_REASONS)[number]['value'];

/**
 * Backend's `GET /api/v1/orders/:id` returns the Prisma row with `items`,
 * `store`, `customer`, `driver { user }` and `deliveryAddress` joined. The
 * shared `OrderDetail` type omits some fields we want to surface for the
 * operator (commission, driver coords, address coords) so we widen it here.
 */
interface OrderDetailExtra extends OrderDetail {
  commission?: number;
  // When the customer placed the order for someone else (gift, parent,
  // colleague), the recipient's name + phone are stored here. The store
  // surfaces these so the kitchen / counter staff know who to address.
  recipientName?: string | null;
  recipientPhone?: string | null;
  // Set when the store marks the order ready/packed — drives the packed-state
  // UI (button hidden, "Packed & ready" pill shown) and the server-side
  // idempotency check.
  packedAt?: string | null;
  // Set when a restaurant transitions from STORE_ACCEPTED → COOKING; surfaces
  // the cooking-state badge on the order detail screen.
  cookingStartedAt?: string | null;
  /** Multi-store group context. Set only when this order is one leg of a
   *  multi-store basket. Counts-only by design — we don't leak sibling
   *  store names to competitors who are in the same basket. */
  groupContext?: {
    orderGroupId: string;
    totalLegs: number;
    acceptedLegs: number;
    deliveredLegs: number;
  } | null;
  // The order's store is included in the join with category so we can branch
  // the UI for hotels/restaurants (cooking step, different copy).
  store?: { id: string; name: string; lat: number; lng: number; category?: string };
  customer?: { id: string; name: string; phone: string } | null;
  driver?: {
    id: string;
    currentLat?: number | null;
    currentLng?: number | null;
    vehicleType?: string | null;
    vehicleNumber?: string | null;
    user?: { name: string; phone: string } | null;
  } | null;
  deliveryAddress?: {
    lat?: number;
    lng?: number;
    label?: string;
    city?: string;
    pincode?: string;
  } | null;
}

export default function OrderDetailPage() {
  return (
    <AuthGuard>
      <AppShell>
        <OrderDetailInner />
      </AppShell>
    </AuthGuard>
  );
}

function OrderDetailInner() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const queryClient = useQueryClient();
  const [rejectOpen, setRejectOpen] = useState(false);

  // Live updates: status transitions invalidate this query; driver location
  // updates land in a side-channel cache the map reads.
  useOrderSocket(id);

  const { data: order, isLoading, isError, refetch } = useQuery<OrderDetailExtra | null>({
    queryKey: ['orderDetail', id],
    enabled: !!id,
    queryFn: async () => {
      const res = await api.get(`/api/v1/orders/${id}`);
      return (res.data?.data ?? res.data) as OrderDetailExtra | null;
    },
    // Polling is the belt; sockets are the suspenders. If sockets drop we
    // still pick up new statuses within 20s.
    refetchInterval: 20_000,
  });

  // Live driver location pushed via `driver:location` socket events
  const { data: liveDriver } = useQuery<{ lat: number; lng: number; at: number } | null>({
    queryKey: ['driverLocation', id],
    enabled: !!id,
    // We never fetch this — sockets populate it. Returning null when nothing
    // is cached lets the map render from order.driver.currentLat/Lng.
    queryFn: () => Promise.resolve(null),
    staleTime: Infinity,
  });

  const accept = useMutation({
    mutationFn: () => api.put(`/api/v1/orders/${id}/accept`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orderDetail', id] });
      queryClient.invalidateQueries({ queryKey: ['storeOrders'] });
      queryClient.invalidateQueries({ queryKey: ['storeActiveOrders'] });
      queryClient.invalidateQueries({ queryKey: ['storeStatsToday'] });
      toast.success('Order accepted');
    },
    onError: (err: Error) => toast.error(err.message || 'Could not accept order'),
  });

  const reject = useMutation({
    mutationFn: (reason: string) =>
      api.put(`/api/v1/orders/${id}/reject`, { reason }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orderDetail', id] });
      queryClient.invalidateQueries({ queryKey: ['storeOrders'] });
      queryClient.invalidateQueries({ queryKey: ['storeStatsToday'] });
      setRejectOpen(false);
      toast.success('Order rejected');
      router.replace('/orders');
    },
    onError: (err: Error) => toast.error(err.message || 'Could not reject order'),
  });

  const markReady = useMutation({
    mutationFn: () => api.put(`/api/v1/orders/${id}/ready`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orderDetail', id] });
      queryClient.invalidateQueries({ queryKey: ['storeActiveOrders'] });
      toast.success('Marked as packed and ready for pickup');
    },
    onError: (err: Error) => toast.error(err.message || 'Could not update order'),
  });

  // Restaurant-only: transition STORE_ACCEPTED → COOKING so the customer
  // sees an in-progress 'Cooking' step on their tracking timeline.
  const markCooking = useMutation({
    mutationFn: () => api.put(`/api/v1/orders/${id}/cooking`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orderDetail', id] });
      queryClient.invalidateQueries({ queryKey: ['storeActiveOrders'] });
      toast.success('Cooking started — the customer will see it on their tracker.');
    },
    onError: (err: Error) => toast.error(err.message || 'Could not start cooking'),
  });

  const driverPoint = useMemo(() => {
    // Prefer the live socket location; fall back to whatever the driver
    // record had when we last fetched.
    if (liveDriver) return { lat: liveDriver.lat, lng: liveDriver.lng };
    const d = order?.driver;
    if (d?.currentLat != null && d?.currentLng != null) {
      return { lat: d.currentLat, lng: d.currentLng };
    }
    return null;
  }, [liveDriver, order?.driver]);

  if (isLoading) {
    return (
      <div className="page-shell space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="page-shell">
        <ErrorPanel message="Couldn't load this order." onRetry={() => refetch()} />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="page-shell">
        <ErrorPanel message="Order not found." />
      </div>
    );
  }

  const isPending = order.status === 'PENDING';
  const isAccepted = order.status === 'STORE_ACCEPTED';
  const isCooking = order.status === 'COOKING';
  const isRestaurant = order.store?.category === 'RESTAURANT';
  const alreadyPacked = !!order.packedAt;
  const isBusy =
    accept.isPending || reject.isPending || markReady.isPending || markCooking.isPending;

  // Commission / payout maths. `commission` is stored on the order row at
  // creation time using the snapshot rate so the operator sees the exact
  // amount they'll receive, not a recomputed estimate.
  const subtotal = order.subtotal ?? 0;
  const commission = order.commission ?? 0;
  const storeNet = Math.max(0, subtotal - commission);
  const deliveryFee = order.deliveryFee ?? 0;

  const storeLatLng =
    order.store?.lat != null && order.store?.lng != null
      ? { lat: order.store.lat, lng: order.store.lng, name: order.store.name }
      : null;
  const dropoffLatLng =
    order.deliveryAddress?.lat != null && order.deliveryAddress?.lng != null
      ? {
          lat: order.deliveryAddress.lat,
          lng: order.deliveryAddress.lng,
          label: order.deliveryAddress.label ?? 'Delivery point',
        }
      : null;
  // We only show the map once a driver has been assigned OR the order is
  // accepted (so the operator can verify dropoff is where they expect).
  const showMap = (isAccepted || !isPending) && (storeLatLng || dropoffLatLng || driverPoint);

  return (
    <div className="page-shell space-y-6">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <a
          href="/orders"
          onClick={(e) => {
            e.preventDefault();
            router.back();
          }}
          className="gap-1"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to orders
        </a>
      </Button>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl font-bold text-gray-900 sm:text-2xl">
            {shortOrderId(order.id)}
          </h1>
          <p className="text-xs text-gray-500">
            Placed{' '}
            {new Date(order.createdAt).toLocaleString('en-IN', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </header>

      {/* New-order banner — only on PENDING orders so the operator knows the
          accept/reject buttons at the bottom are what they're here for. */}
      {isPending ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>New order awaiting your acceptance.</strong> You have a few minutes before it
          re-broadcasts to other stores. Review the items below and decide.
        </div>
      ) : null}

      {/* Multi-store group context — surfaces "this is one leg of a
          basket the customer also placed with other stores" so the
          operator understands why their slice is smaller than the
          customer total. Counts-only: we don't leak sibling store
          names to competitors who happen to be in the same basket. */}
      {order.groupContext ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <strong>Part of a multi-store basket</strong>{' '}
          <span className="text-blue-700">
            · 1 of {order.groupContext.totalLegs} stores ·{' '}
            {order.groupContext.acceptedLegs}/{order.groupContext.totalLegs}{' '}
            accepted ·{' '}
            {order.groupContext.deliveredLegs}/{order.groupContext.totalLegs}{' '}
            delivered
          </span>
          <p className="mt-1 text-xs text-blue-700">
            The customer placed this order across multiple stores. One driver
            will pick up from each store and deliver everything together —
            your slice is independent of the others, so accept or reject
            based on YOUR inventory only.
          </p>
        </div>
      ) : null}

      {/* Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {order.items.map((item) => (
            <div
              key={item.itemId}
              className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3 last:border-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                <p className="text-xs text-gray-500">{item.unit}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold text-gray-600">×{item.quantity}</p>
                <p className="text-sm font-bold text-gray-900">
                  {rupees(item.price * item.quantity)}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Payout breakdown — what the operator actually takes home */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <IndianRupee className="h-4 w-4 text-primary" /> Payout breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Items subtotal" value={rupees(subtotal)} />
          <Row label="Platform commission" value={`− ${rupees(commission)}`} tone="muted" />
          <div className="my-2 h-px bg-gray-200" />
          <Row label="Your payout" value={rupees(storeNet)} bold />
          <p className="pt-2 text-xs text-gray-500">
            Delivery fee of {rupees(deliveryFee)} goes to the driver. Customers paid{' '}
            <span className="font-medium text-gray-700">{rupees(order.total)}</span> total
            {order.paymentMethod ? ` via ${order.paymentMethod}` : ''}.
          </p>
        </CardContent>
      </Card>

      {/* Driver card — only once a driver is assigned */}
      {order.driver ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Truck className="h-4 w-4 text-primary" /> Driver
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <p className="text-xs uppercase text-gray-400">Name</p>
              <p className="font-medium text-gray-900">{order.driver.user?.name ?? '—'}</p>
            </div>
            {order.driver.user?.phone ? (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase text-gray-400">Phone</p>
                  <p className="font-medium text-gray-900">+91 {order.driver.user.phone}</p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <a href={`tel:+91${order.driver.user.phone}`} className="gap-1">
                    <Phone className="h-4 w-4" /> Call
                  </a>
                </Button>
              </div>
            ) : null}
            {order.driver.vehicleNumber ? (
              <div>
                <p className="text-xs uppercase text-gray-400">Vehicle</p>
                <p className="font-medium text-gray-900">
                  {order.driver.vehicleType} · {order.driver.vehicleNumber}
                </p>
              </div>
            ) : null}
            {liveDriver ? (
              <p className="text-xs text-green-700">
                Driver location updated {Math.max(1, Math.round((Date.now() - liveDriver.at) / 1000))}s ago
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Map — pickup ↔ driver ↔ dropoff */}
      {showMap ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Live route</CardTitle>
          </CardHeader>
          <CardContent>
            <DeliveryMap
              store={storeLatLng}
              dropoff={dropoffLatLng}
              driver={driverPoint}
              heightClass="h-72"
            />
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-600">
              <Legend color="#10b981" label="Your store" />
              {driverPoint ? <Legend color="#ea580c" label="Driver" /> : null}
              {dropoffLatLng ? <Legend color="#0ea5e9" label="Delivery point" /> : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Delivery info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Delivery info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-gray-500">Area</p>
              <p className="text-sm font-medium text-gray-900">{order.deliveryArea}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-gray-500">Pincode</p>
              <p className="text-sm font-medium text-gray-900">{order.deliveryPincode || '—'}</p>
            </div>
          </div>
          {order.recipientName || order.recipientPhone ? (
            <div className="flex items-start gap-3">
              <User className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <p className="text-xs text-gray-500">Recipient (order for someone else)</p>
                <p className="text-sm font-medium text-gray-900">
                  {[order.recipientName, order.recipientPhone].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
          ) : null}
          <div className="flex items-start gap-2 rounded-md bg-gray-50 p-3 text-xs text-gray-600">
            <Lock className="mt-0.5 h-3.5 w-3.5" />
            <span>
              Customer details are hidden for privacy. The driver receives the full address.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Chat — per-order thread with customer (or driver after pickup).
          Mirrors the store-portal mobile chat surface. Active only while
          there's something useful to say; cancelled/delivered orders fall
          through. */}
      {['PENDING', 'STORE_ACCEPTED', 'COOKING', 'DRIVER_ASSIGNED', 'PICKED_UP'].includes(
        order.status,
      ) ? (
        <Button asChild variant="outline" className="w-full justify-start gap-2">
          <Link href={`/orders/${order.id}/chat` as never}>
            <MessageCircle className="h-4 w-4" />
            {order.status === 'PICKED_UP' ? 'Chat with driver' : 'Chat with customer'}
          </Link>
        </Button>
      ) : null}

      {/* Timeline */}
      {order.statusTimeline && order.statusTimeline.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Order timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {order.statusTimeline.map((ev, idx) => {
                const isLast = idx === order.statusTimeline!.length - 1;
                return (
                  <li key={`${ev.status}-${idx}`} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`h-3 w-3 rounded-full ${
                          ev.isCurrent ? 'bg-primary' : 'bg-gray-300'
                        }`}
                      />
                      {!isLast ? <span className="h-8 w-px bg-gray-200" /> : null}
                    </div>
                    <div className="-mt-0.5">
                      <p
                        className={`text-sm ${
                          ev.isCurrent ? 'font-semibold text-gray-900' : 'text-gray-600'
                        }`}
                      >
                        {STATUS_TIMELINE_LABELS[ev.status] ?? ev.status}
                      </p>
                      {ev.timestamp ? (
                        <p className="text-xs text-gray-400">
                          {new Date(ev.timestamp).toLocaleString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      {/* Actions */}
      {isPending ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="border-red-200 text-red-700 hover:bg-red-50"
            disabled={isBusy}
            onClick={() => setRejectOpen(true)}
          >
            <XCircle className="h-4 w-4" /> Reject order
          </Button>
          <Button
            type="button"
            size="lg"
            loading={accept.isPending}
            disabled={isBusy}
            onClick={() => accept.mutate()}
          >
            <CheckCircle2 className="h-4 w-4" /> Accept order
          </Button>
        </div>
      ) : isAccepted || isCooking ? (
        <div className="flex flex-col gap-2">
          {/* Restaurant-only: 'Start cooking' button visible only while
              the order is still STORE_ACCEPTED and we haven't packed yet.
              Once tapped, status moves to COOKING and the customer sees
              the in-progress milestone. */}
          {isRestaurant && isAccepted && !alreadyPacked ? (
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="w-full border-amber-300 text-amber-700 hover:bg-amber-50"
              loading={markCooking.isPending}
              disabled={isBusy || markCooking.isPending}
              onClick={() => markCooking.mutate()}
            >
              🍳 Start cooking
            </Button>
          ) : null}

          {/* Mark-as-packed: hidden once packedAt is set so the operator
              can't fire it twice. Server also rejects duplicates as
              defence-in-depth. */}
          {!alreadyPacked ? (
            <Button
              type="button"
              size="lg"
              className="w-full"
              loading={markReady.isPending}
              disabled={isBusy || markReady.isPending}
              onClick={() => markReady.mutate()}
            >
              <PackageCheck className="h-4 w-4" />{' '}
              {isRestaurant ? 'Ready for pickup' : 'Mark as packed (ready for pickup)'}
            </Button>
          ) : (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              <PackageCheck className="h-4 w-4" /> Packed & ready — waiting for the driver to arrive.
            </div>
          )}
        </div>
      ) : null}

      <RejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        onConfirm={(reason) => reject.mutate(reason)}
        submitting={reject.isPending}
      />
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  tone,
}: {
  label: string;
  value: string;
  bold?: boolean;
  tone?: 'muted';
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${tone === 'muted' ? 'text-gray-500' : 'text-gray-700'}`}>
        {label}
      </span>
      <span
        className={`text-sm ${bold ? 'text-lg font-bold text-primary' : 'font-semibold text-gray-900'}`}
      >
        {value}
      </span>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function RejectDialog({
  open,
  onOpenChange,
  onConfirm,
  submitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  submitting: boolean;
}) {
  const [reasonValue, setReasonValue] = useState<RejectReasonValue>('OUT_OF_STOCK');
  const [extra, setExtra] = useState('');

  function submit() {
    const base = REJECT_REASONS.find((r) => r.value === reasonValue)?.label ?? 'Cannot fulfill';
    const trimmedExtra = extra.trim();
    // Always include the structured label so admin reports can group rejections.
    // If the operator picked OTHER without typing anything, fall back to a
    // generic message so the backend's zod min(1) check passes.
    if (reasonValue === 'OTHER') {
      if (!trimmedExtra) {
        onConfirm('Store cannot fulfill this order');
        return;
      }
      onConfirm(trimmedExtra);
      return;
    }
    onConfirm(trimmedExtra ? `${base} — ${trimmedExtra}` : base);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject this order?</DialogTitle>
          <DialogDescription>
            The customer will be notified and the order will be re-broadcast to the next nearby
            store. Tell us why so admins can spot patterns.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <fieldset className="space-y-2">
            {REJECT_REASONS.map((r) => (
              <label
                key={r.value}
                className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition ${
                  reasonValue === r.value
                    ? 'border-primary bg-primary-50/50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="reject-reason"
                  value={r.value}
                  checked={reasonValue === r.value}
                  onChange={() => setReasonValue(r.value)}
                  className="mt-0.5"
                />
                <span className="text-gray-800">{r.label}</span>
              </label>
            ))}
          </fieldset>
          <textarea
            rows={2}
            placeholder={
              reasonValue === 'OTHER' ? 'Tell us what happened (required)' : 'Notes (optional)'
            }
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            className="flex w-full rounded-md border border-input bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} loading={submitting}>
            Reject order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
