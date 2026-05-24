'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bike,
  Check,
  ChevronLeft,
  Clock,
  CreditCard,
  Loader2,
  MapPin,
  Package,
  PhoneCall,
  Receipt,
  Store as StoreIcon,
  Truck,
  XCircle,
} from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Card, CardContent } from '@aks/ui/components/card';
import { Separator } from '@aks/ui/components/separator';
import { Badge } from '@aks/ui/components/badge';
import { toast } from '@aks/ui/components/sonner';
import { OrderStatus, PaymentMethod } from '@aks/shared';
import { AppHeader } from '@/components/AppHeader';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { ErrorPanel, PageLoader } from '@/components/StatePanels';
import { cancelOrder, fetchOrder, type CustomerOrder } from '@/lib/orders';
import { rupees } from '@/lib/format';
import { openOrderSocket } from '@/lib/socket';
import { useUser } from '@/lib/use-user';

// react-leaflet uses `window` at import time — load only on the client.
const TrackingMap = dynamic(
  () => import('@/components/TrackingMap').then((m) => m.TrackingMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-72 items-center justify-center rounded-md border border-gray-200 bg-gray-100">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    ),
  },
);

const STEPS: Array<{ status: OrderStatus; label: string; icon: typeof Receipt }> = [
  { status: OrderStatus.PENDING, label: 'Placed', icon: Receipt },
  { status: OrderStatus.STORE_ACCEPTED, label: 'Accepted', icon: StoreIcon },
  { status: OrderStatus.DRIVER_ASSIGNED, label: 'Driver assigned', icon: Bike },
  { status: OrderStatus.PICKED_UP, label: 'Picked up', icon: Truck },
  { status: OrderStatus.DELIVERED, label: 'Delivered', icon: Check },
];

function statusHeadline(status: OrderStatus | string): string {
  switch (status) {
    case OrderStatus.PENDING:
      return 'Waiting for the store to confirm your order';
    case OrderStatus.STORE_ACCEPTED:
      return 'Order accepted — packing now';
    case OrderStatus.DRIVER_ASSIGNED:
      return 'Driver is heading to the store';
    case OrderStatus.PICKED_UP:
      return 'Driver is on the way to you';
    case OrderStatus.DELIVERED:
      return 'Order delivered. Enjoy!';
    case OrderStatus.CANCELLED:
      return 'Order was cancelled';
    case OrderStatus.REJECTED:
      return 'Order was rejected by the store';
    default:
      return '';
  }
}

function etaForStatus(status: OrderStatus | string): string | null {
  switch (status) {
    case OrderStatus.PENDING:
    case OrderStatus.STORE_ACCEPTED:
      return '30–45 min';
    case OrderStatus.DRIVER_ASSIGNED:
    case OrderStatus.PICKED_UP:
      return '15–25 min';
    default:
      return null;
  }
}

export default function OrderTrackingPage() {
  const params = useParams<{ id: string }>();
  const orderId = params?.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, mounted } = useUser({ redirectTo: orderId ? `/orders/${orderId}` : '/orders' });

  const [liveStatus, setLiveStatus] = useState<OrderStatus | null>(null);
  const [driverLoc, setDriverLoc] = useState<{ lat: number; lng: number } | null>(null);

  const orderQuery = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => fetchOrder(orderId!),
    enabled: !!orderId && !!user,
    // Poll every 30s as a safety net in case the socket misses an event
    refetchInterval: 30_000,
  });

  // Subscribe to socket.io for status + driver location.
  useEffect(() => {
    if (!orderId || !user) return;
    const cleanup = openOrderSocket(orderId, {
      onStatus: (status) => {
        setLiveStatus(status as OrderStatus);
        queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      },
      onLocation: (loc) => setDriverLoc(loc),
    });
    return () => {
      cleanup?.();
    };
  }, [orderId, user, queryClient]);

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => cancelOrder(orderId!, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      toast.success('Order cancelled');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not cancel'),
  });

  if (!mounted || !user) {
    return (
      <>
        <AppHeader showSearch={false} />
        <main className="page-shell py-10">
          <PageLoader />
        </main>
      </>
    );
  }

  if (orderQuery.isLoading) {
    return (
      <>
        <AppHeader showSearch={false} />
        <main className="page-shell py-10">
          <PageLoader />
        </main>
      </>
    );
  }

  if (orderQuery.isError || !orderQuery.data) {
    return (
      <>
        <AppHeader showSearch={false} />
        <main className="page-shell py-10">
          <ErrorPanel
            message={
              orderQuery.error instanceof Error
                ? orderQuery.error.message
                : 'Could not load this order.'
            }
            onRetry={() => orderQuery.refetch()}
          />
          <div className="mt-4 flex justify-center">
            <Button variant="outline" asChild>
              <Link href="/orders">
                <ChevronLeft className="h-4 w-4" />
                Back to orders
              </Link>
            </Button>
          </div>
        </main>
      </>
    );
  }

  const order = orderQuery.data;
  const status = liveStatus ?? (order.status as OrderStatus);
  const canCancel = status === OrderStatus.PENDING || status === OrderStatus.STORE_ACCEPTED;
  const headline = statusHeadline(status);
  const eta = etaForStatus(status);
  const isCancelled = status === OrderStatus.CANCELLED || status === OrderStatus.REJECTED;

  return (
    <>
      <AppHeader showSearch={false} />
      <main className="page-shell py-6 space-y-5">
        <Button variant="ghost" asChild className="-ml-2 self-start">
          <Link href="/orders">
            <ChevronLeft className="h-4 w-4" />
            Back to orders
          </Link>
        </Button>

        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Order #{order.id.slice(-6).toUpperCase()}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-gray-900">{headline}</h1>
            {eta && !isCancelled ? (
              <p className="mt-1 inline-flex items-center gap-1 text-sm text-gray-500">
                <Clock className="h-4 w-4" />
                Arriving in {eta}
              </p>
            ) : null}
          </div>
          <OrderStatusBadge status={status} />
        </header>

        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <section className="space-y-5">
            <StatusTimeline status={status} />
            <MapSection order={order} driverLoc={driverLoc} />
            {order.driver ? <DriverCard driver={order.driver} /> : null}
            <ItemsCard order={order} />
            <AddressCard order={order} />
          </section>

          <aside className="space-y-5">
            <SummaryCard order={order} />
            <PaymentCard order={order} />
            {order.dropoffOtp && status === OrderStatus.PICKED_UP ? (
              <DropoffOtpCard otp={order.dropoffOtp} />
            ) : null}
            {canCancel ? (
              <Button
                variant="outline"
                className="w-full border-destructive text-destructive hover:bg-red-50 hover:text-destructive"
                onClick={() => {
                  if (!confirm('Cancel this order?')) return;
                  const reason = prompt('Tell us why (optional)') ?? 'Cancelled by customer';
                  cancelMutation.mutate(reason.trim() || 'Cancelled by customer');
                }}
                loading={cancelMutation.isPending}
              >
                <XCircle className="h-4 w-4" />
                Cancel order
              </Button>
            ) : null}
            {status === OrderStatus.DELIVERED ? (
              <Button className="w-full" onClick={() => router.push('/')}>
                Order again
              </Button>
            ) : null}
          </aside>
        </div>
      </main>
    </>
  );
}

function StatusTimeline({ status }: { status: OrderStatus }) {
  const cancelled = status === OrderStatus.CANCELLED || status === OrderStatus.REJECTED;
  const currentIdx = STEPS.findIndex((s) => s.status === status);

  return (
    <Card>
      <CardContent className="p-5">
        <ol className="grid grid-cols-5 gap-2 sm:gap-3">
          {STEPS.map((step, idx) => {
            const done = !cancelled && idx < currentIdx;
            const current = !cancelled && idx === currentIdx;
            const Icon = step.icon;
            return (
              <li key={step.status} className="flex flex-col items-center text-center">
                <div
                  className={[
                    'flex h-9 w-9 items-center justify-center rounded-full border-2',
                    done
                      ? 'border-primary bg-primary text-primary-foreground'
                      : current
                        ? 'border-primary bg-white text-primary'
                        : 'border-gray-200 bg-gray-50 text-gray-400',
                  ].join(' ')}
                >
                  {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <p
                  className={[
                    'mt-1.5 text-[11px] font-semibold leading-tight sm:text-xs',
                    current ? 'text-primary' : done ? 'text-gray-900' : 'text-gray-400',
                  ].join(' ')}
                >
                  {step.label}
                </p>
              </li>
            );
          })}
        </ol>
        {cancelled ? (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-center text-sm font-medium text-red-700">
            This order didn't go through. You can try placing a new one.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MapSection({
  order,
  driverLoc,
}: {
  order: CustomerOrder;
  driverLoc: { lat: number; lng: number } | null;
}) {
  const markers = useMemo(() => {
    const out: Array<{ id: string; lat: number; lng: number; label: string; kind: 'store' | 'customer' | 'driver' }> = [];
    if (order.store?.lat != null && order.store?.lng != null) {
      out.push({
        id: 'store',
        lat: order.store.lat,
        lng: order.store.lng,
        label: order.store.name,
        kind: 'store',
      });
    }
    if (order.deliveryAddress?.lat != null && order.deliveryAddress?.lng != null) {
      out.push({
        id: 'you',
        lat: order.deliveryAddress.lat,
        lng: order.deliveryAddress.lng,
        label: 'You',
        kind: 'customer',
      });
    }
    const live = driverLoc ?? (order.driver?.currentLat != null && order.driver?.currentLng != null
      ? { lat: order.driver.currentLat, lng: order.driver.currentLng }
      : null);
    if (live) {
      out.push({ id: 'driver', lat: live.lat, lng: live.lng, label: 'Driver', kind: 'driver' });
    }
    return out;
  }, [order, driverLoc]);

  if (markers.length === 0) return null;
  return (
    <Card>
      <CardContent className="p-0">
        <TrackingMap markers={markers} heightClass="h-72" />
      </CardContent>
    </Card>
  );
}

function DriverCard({ driver }: { driver: NonNullable<CustomerOrder['driver']> }) {
  const name = driver.user?.name ?? 'Your driver';
  const phone = driver.user?.phone ?? null;
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <Bike className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{name}</p>
          <p className="text-xs text-gray-500">
            {driver.vehicleType ?? 'Bike'}
            {driver.vehicleNumber ? ` · ${driver.vehicleNumber}` : ''}
            {typeof driver.rating === 'number' ? ` · ★ ${driver.rating.toFixed(1)}` : ''}
          </p>
        </div>
        {phone ? (
          <Button asChild variant="outline" size="sm">
            <a href={`tel:${phone}`}>
              <PhoneCall className="h-4 w-4" />
              Call
            </a>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ItemsCard({ order }: { order: CustomerOrder }) {
  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Package className="h-4 w-4 text-primary" />
          Items ({order.items.length})
        </h2>
        <ul className="divide-y divide-gray-100">
          {order.items.map((item, idx) => (
            <li key={item.id ?? `${item.itemId}-${idx}`} className="flex items-center gap-3 py-2">
              <Badge variant="secondary" className="font-mono text-[11px]">
                {item.qty}×
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{item.name}</p>
                <p className="text-xs text-gray-500">{item.unit}</p>
              </div>
              <span className="text-sm font-semibold text-gray-900">{rupees(item.price * item.qty)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function AddressCard({ order }: { order: CustomerOrder }) {
  if (!order.deliveryAddress) return null;
  const a = order.deliveryAddress;
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
          <MapPin className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">Delivery address — {a.label}</p>
          <p className="mt-0.5 text-sm text-gray-600">
            {a.street}, {a.city}, {a.state} {a.pincode}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryCard({ order }: { order: CustomerOrder }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <h2 className="text-base font-semibold text-gray-900">Bill summary</h2>
        <Row label="Subtotal" value={rupees(order.subtotal)} />
        <Row label="Delivery fee" value={rupees(order.deliveryFee)} />
        {order.promoDiscount ? (
          <Row label={`Promo (${order.promoCode ?? 'discount'})`} value={`- ${rupees(order.promoDiscount)}`} />
        ) : null}
        <Separator />
        <Row label="Total" value={rupees(order.total)} bold />
      </CardContent>
    </Card>
  );
}

function PaymentCard({ order }: { order: CustomerOrder }) {
  const cod = order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY;
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700">
          <CreditCard className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">
            {cod ? 'Cash on delivery' : 'Online payment'}
          </p>
          <p className="text-xs text-gray-500">Status: {order.paymentStatus}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DropoffOtpCard({ otp }: { otp: string }) {
  return (
    <Card className="border-primary/40">
      <CardContent className="p-5 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          Delivery OTP
        </p>
        <p className="mt-2 font-mono text-3xl font-bold tracking-[0.4em] text-gray-900">
          {otp}
        </p>
        <p className="mt-2 text-xs text-gray-500">
          Share this only with the driver at the door.
        </p>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className={bold ? 'font-semibold text-gray-900' : 'text-gray-600'}>{label}</span>
      <span className={bold ? 'text-lg font-bold text-gray-900' : 'text-gray-900'}>{value}</span>
    </div>
  );
}
