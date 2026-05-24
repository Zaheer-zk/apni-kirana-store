'use client';

import { use, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Bike,
  CheckCircle2,
  HelpCircle,
  LifeBuoy,
  Loader2,
  Locate,
  MapPin,
  Navigation,
  PackageCheck,
  Phone,
  ShoppingBag,
  Store as StoreIcon,
} from 'lucide-react';
import { Badge } from '@aks/ui/components/badge';
import { Button } from '@aks/ui/components/button';
import { Card, CardContent } from '@aks/ui/components/card';
import { Input } from '@aks/ui/components/input';
import { Label } from '@aks/ui/components/label';
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
import { AppHeader } from '@/components/AppHeader';
import { RequireAuth } from '@/components/RequireAuth';
import { ErrorPanel } from '@/components/StatePanels';
import { api } from '@/lib/api';
import { mapsDirectionsUrl, rupeesPrecise } from '@/lib/format';
import { subscribeToOrder } from '@/lib/socket';

// Leaflet runs on the client only — skip it from the SSR bundle entirely.
const DeliveryMap = dynamic(
  () => import('@/components/DeliveryMap').then((m) => m.DeliveryMap),
  { ssr: false, loading: () => <Skeleton className="h-72 w-full rounded-xl" /> },
);

interface OrderItem {
  itemId?: string | null;
  name: string;
  qty?: number;
  quantity?: number;
  price: number;
  unit?: string;
}

interface OrderDetail {
  id: string;
  status:
    | 'PENDING'
    | 'STORE_ACCEPTED'
    | 'DRIVER_ASSIGNED'
    | 'PICKED_UP'
    | 'DELIVERED'
    | 'CANCELLED'
    | 'REJECTED';
  items: OrderItem[];
  store?: {
    id?: string;
    name?: string | null;
    lat?: number | null;
    lng?: number | null;
    street?: string | null;
    city?: string | null;
    phone?: string | null;
  } | null;
  deliveryAddress?: {
    lat?: number | null;
    lng?: number | null;
    label?: string | null;
    city?: string | null;
    pincode?: string | null;
  } | null;
  // Backend strips PII for DRIVER role — these will be null.
  customer?: { id?: string; name?: string | null; phone?: string | null } | null;
  total: number;
  deliveryFee?: number;
  paymentMethod: 'CASH_ON_DELIVERY' | 'ONLINE';
  paymentStatus?: string;
  createdAt?: string;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  driverAssignedAt?: string | null;
}

// Visual checkpoints the driver clicks through. Only PICKED_UP and DELIVERED
// are real backend transitions — "arrived at store" and "arrived at customer"
// are UI-only progress markers persisted in component state because the
// OrderStatus enum doesn't have intermediate PENDING states.
type Checkpoint = 'EN_ROUTE_PICKUP' | 'AT_STORE' | 'EN_ROUTE_DROP' | 'AT_CUSTOMER';

export default function ActiveDeliveryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <RequireAuth>
      <AppHeader />
      <main className="page-shell py-6">
        <ActiveDelivery orderId={id} />
      </main>
    </RequireAuth>
  );
}

function ActiveDelivery({ orderId }: { orderId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [otp, setOtp] = useState('');
  const [otpDialogOpen, setOtpDialogOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [checkpoint, setCheckpoint] = useState<Checkpoint>('EN_ROUTE_PICKUP');
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const detailQuery = useQuery<OrderDetail>({
    queryKey: ['orderDetail', orderId],
    queryFn: async () => {
      const r = await api.get<{ success: boolean; data: OrderDetail }>(
        `/api/v1/orders/${orderId}`,
      );
      return r.data?.data;
    },
    refetchInterval: 30_000,
  });

  // ── Live updates ─────────────────────────────────────────────────────────
  // Subscribe to this order's socket room so cancellations / status changes
  // pushed by the customer or admin are reflected instantly.
  useEffect(() => {
    const unsub = subscribeToOrder(orderId, (payload) => {
      queryClient.invalidateQueries({ queryKey: ['orderDetail', orderId] });
      if (payload.status === 'CANCELLED') {
        toast.info('This order was cancelled.');
      } else if (payload.status === 'DELIVERED') {
        toast.success('Delivery completed!');
      }
    });
    return unsub;
  }, [orderId, queryClient]);

  // ── Best-effort browser GPS ──────────────────────────────────────────────
  // Web cannot run background tracking — see docs/driver-web.md. We watch
  // foreground position only so the driver can see themselves on the map;
  // we do NOT push these updates to the server (the mobile app owns that).
  useEffect(() => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setDriverPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        console.warn('[delivery detail] geolocation error', err.message);
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
    );
    watchIdRef.current = watchId;
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  // ── Mutations: pickup + deliver ──────────────────────────────────────────
  const pickupMutation = useMutation({
    mutationFn: async () => {
      const r = await api.put(`/api/v1/drivers/orders/${orderId}/pickup`);
      return r.data;
    },
    onSuccess: () => {
      toast.success('Pickup confirmed');
      setCheckpoint('EN_ROUTE_DROP');
      queryClient.invalidateQueries({ queryKey: ['orderDetail', orderId] });
      queryClient.invalidateQueries({ queryKey: ['driverActiveOrder'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to confirm pickup'),
  });

  const deliverMutation = useMutation({
    mutationFn: async (dropoffOtp?: string) => {
      const r = await api.put(`/api/v1/drivers/orders/${orderId}/deliver`, {
        ...(dropoffOtp ? { dropoffOtp } : {}),
      });
      return r.data;
    },
    onSuccess: () => {
      toast.success('Delivery completed!');
      setOtpDialogOpen(false);
      setOtp('');
      queryClient.invalidateQueries({ queryKey: ['orderDetail', orderId] });
      queryClient.invalidateQueries({ queryKey: ['driverActiveOrder'] });
      queryClient.invalidateQueries({ queryKey: ['driverDeliveriesList'] });
      // Send the driver back to the deliveries list after a brief pause so
      // they see the success state first.
      setTimeout(() => router.replace('/deliveries'), 800);
    },
    onError: (err: Error) => {
      // 400 from backend when OTP is wrong / missing — leave dialog open so
      // the driver can correct it.
      toast.error(err.message || 'Failed to confirm delivery');
    },
  });

  const order = detailQuery.data;

  // Sync the visual checkpoint with the canonical status. Picked-up means we
  // must be at-least en-route-to-drop; DRIVER_ASSIGNED could mean still
  // travelling to store or already there (UI checkpoint persists locally).
  useEffect(() => {
    if (!order) return;
    if (order.status === 'PICKED_UP' && checkpoint !== 'AT_CUSTOMER') {
      setCheckpoint('EN_ROUTE_DROP');
    }
  }, [order, checkpoint]);

  const pickupCoords = useMemo(
    () => ({
      lat: order?.store?.lat ?? null,
      lng: order?.store?.lng ?? null,
      label: order?.store?.name ?? 'Pickup',
    }),
    [order],
  );
  const dropoffCoords = useMemo(
    () => ({
      lat: order?.deliveryAddress?.lat ?? null,
      lng: order?.deliveryAddress?.lng ?? null,
      label: order?.deliveryAddress?.label ?? 'Drop-off',
    }),
    [order],
  );

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-44 w-full rounded-xl" />
      </div>
    );
  }

  if (detailQuery.isError || !order) {
    return (
      <ErrorPanel
        message="Couldn't load this delivery."
        onRetry={() => detailQuery.refetch()}
      />
    );
  }

  const isFinal = ['DELIVERED', 'CANCELLED', 'REJECTED'].includes(order.status);
  const customerPhone = order.customer?.phone ?? null;
  const storePhone = order.store?.phone ?? null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/deliveries" aria-label="Back to deliveries">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <p className="text-xs font-semibold text-gray-500">
            Order #{order.id.slice(-8).toUpperCase()}
          </p>
          <h1 className="text-2xl font-bold text-gray-900">
            {isFinal ? statusHeadline(order.status) : 'Active delivery'}
          </h1>
        </div>
        <Badge
          variant={
            order.status === 'DELIVERED'
              ? 'success'
              : order.status === 'CANCELLED' || order.status === 'REJECTED'
                ? 'destructive'
                : 'default'
          }
          className="ml-auto"
        >
          {humanStatus(order.status)}
        </Badge>
      </div>

      <DeliveryMap pickup={pickupCoords} dropoff={dropoffCoords} driver={driverPos} />

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Locate className="h-3 w-3" />
          {driverPos
            ? 'Live location active'
            : "Browser GPS unavailable — open your mobile app for live tracking"}
        </span>
        <Button variant="outline" size="sm" onClick={() => setHelpOpen(true)}>
          <HelpCircle className="h-4 w-4" /> Help
        </Button>
      </div>

      {/* Pickup + drop-off cards */}
      <div className="grid gap-3 md:grid-cols-2">
        <LocationCard
          icon={<StoreIcon className="h-4 w-4" />}
          tag="Pickup"
          tagColor="text-blue-600 bg-blue-50"
          title={order.store?.name ?? 'Store'}
          subtitle={
            [order.store?.street, order.store?.city].filter(Boolean).join(', ') || '—'
          }
          phone={storePhone}
          mapUrl={mapsDirectionsUrl(order.store?.lat, order.store?.lng)}
        />
        <LocationCard
          icon={<MapPin className="h-4 w-4" />}
          tag="Drop-off"
          tagColor="text-primary bg-primary-50"
          title={order.deliveryAddress?.label ?? 'Customer address'}
          subtitle={
            [order.deliveryAddress?.city, order.deliveryAddress?.pincode]
              .filter(Boolean)
              .join(', ') || '—'
          }
          phone={customerPhone}
          // Mention the privacy redaction so the driver doesn't think this is broken.
          phoneEmptyHint="Customer contact is hidden for privacy"
          mapUrl={mapsDirectionsUrl(order.deliveryAddress?.lat, order.deliveryAddress?.lng)}
        />
      </div>

      {/* Items */}
      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
          Items ({order.items.length})
        </h2>
        <Card>
          <CardContent className="divide-y divide-gray-100 p-0">
            {order.items.slice(0, 6).map((it, i) => {
              const qty = it.qty ?? it.quantity ?? 1;
              return (
                <div
                  key={`${it.itemId ?? it.name}-${i}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 text-gray-500">
                      <ShoppingBag className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{it.name}</p>
                      <p className="text-xs text-gray-500">
                        {qty} × {it.unit ?? 'unit'}
                      </p>
                    </div>
                  </div>
                  <p className="font-semibold text-gray-900">
                    {rupeesPrecise(it.price * qty)}
                  </p>
                </div>
              );
            })}
            {order.items.length > 6 ? (
              <p className="px-4 py-2 text-xs text-gray-500">
                + {order.items.length - 6} more item{order.items.length - 6 === 1 ? '' : 's'}
              </p>
            ) : null}
            <div className="flex items-center justify-between gap-3 bg-gray-50 px-4 py-3 text-sm font-bold">
              <span>Bill total</span>
              <span>{rupeesPrecise(order.total)}</span>
            </div>
          </CardContent>
        </Card>
        {order.paymentMethod === 'CASH_ON_DELIVERY' && order.status !== 'DELIVERED' ? (
          <p className="mt-2 text-xs font-semibold text-amber-700">
            Collect {rupeesPrecise(order.total)} in cash on delivery.
          </p>
        ) : null}
      </section>

      {/* Status flow */}
      {!isFinal ? (
        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
            Status flow
          </h2>
          <Card>
            <CardContent className="space-y-3 p-4">
              <FlowStep
                label="Arrived at store"
                done={
                  checkpoint === 'AT_STORE' ||
                  checkpoint === 'EN_ROUTE_DROP' ||
                  checkpoint === 'AT_CUSTOMER' ||
                  order.status === 'PICKED_UP'
                }
                active={checkpoint === 'EN_ROUTE_PICKUP'}
                onAdvance={() => setCheckpoint('AT_STORE')}
                disabled={order.status !== 'DRIVER_ASSIGNED'}
              />
              <FlowStep
                label="Picked up order"
                done={
                  order.status === 'PICKED_UP' ||
                  checkpoint === 'EN_ROUTE_DROP' ||
                  checkpoint === 'AT_CUSTOMER'
                }
                active={checkpoint === 'AT_STORE' && order.status === 'DRIVER_ASSIGNED'}
                onAdvance={() => pickupMutation.mutate()}
                disabled={order.status !== 'DRIVER_ASSIGNED' || pickupMutation.isPending}
                loading={pickupMutation.isPending}
              />
              <FlowStep
                label="Arrived at customer"
                done={checkpoint === 'AT_CUSTOMER'}
                active={checkpoint === 'EN_ROUTE_DROP'}
                onAdvance={() => setCheckpoint('AT_CUSTOMER')}
                disabled={order.status !== 'PICKED_UP'}
              />
              <FlowStep
                label="Mark delivered"
                done={false}
                active={checkpoint === 'AT_CUSTOMER' && order.status === 'PICKED_UP'}
                onAdvance={() => setOtpDialogOpen(true)}
                disabled={order.status !== 'PICKED_UP' || deliverMutation.isPending}
                loading={deliverMutation.isPending}
                actionIcon={<PackageCheck className="h-4 w-4" />}
              />
            </CardContent>
          </Card>
          <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
            "Arrived" buttons are local checkpoints — only "Picked up" and "Mark delivered"
            tell the customer your status changed.
          </p>
        </section>
      ) : null}

      {/* OTP Dialog */}
      <Dialog open={otpDialogOpen} onOpenChange={setOtpDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm delivery</DialogTitle>
            <DialogDescription>
              Ask the customer for the 4-digit OTP shown in their app, then enter it
              below to mark the delivery complete.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="dropoff-otp">Drop-off OTP</Label>
            <Input
              id="dropoff-otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              autoFocus
            />
            <p className="text-[11px] text-gray-500">
              If the customer can't find their OTP, ask them to refresh the order screen.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => deliverMutation.mutate(undefined)}>
              Skip OTP
            </Button>
            <Button
              onClick={() => deliverMutation.mutate(otp.trim() || undefined)}
              loading={deliverMutation.isPending}
              disabled={deliverMutation.isPending}
            >
              <CheckCircle2 className="h-4 w-4" /> Confirm delivery
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Help Dialog */}
      <HelpDialog
        open={helpOpen}
        onOpenChange={setHelpOpen}
        orderId={order.id}
        storePhone={storePhone}
      />

      {/* Delivered state — show payout summary */}
      {order.status === 'DELIVERED' ? (
        <Card className="border-primary-200 bg-primary-50">
          <CardContent className="flex items-center gap-3 p-4">
            <Bike className="h-6 w-6 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-bold text-gray-900">Delivery complete</p>
              <p className="text-xs text-gray-700">
                Your earnings: {rupeesPrecise(order.deliveryFee ?? 0)}
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/earnings">View earnings</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function FlowStep({
  label,
  done,
  active,
  onAdvance,
  disabled,
  loading,
  actionIcon,
}: {
  label: string;
  done: boolean;
  active: boolean;
  onAdvance: () => void;
  disabled?: boolean;
  loading?: boolean;
  actionIcon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2">
      <div className="flex items-center gap-3">
        <div
          className={
            done
              ? 'flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white'
              : active
                ? 'flex h-6 w-6 items-center justify-center rounded-full border-2 border-primary text-primary'
                : 'flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 text-gray-400'
          }
        >
          {done ? <CheckCircle2 className="h-4 w-4" /> : null}
        </div>
        <p className={`text-sm ${done ? 'text-gray-500 line-through' : 'font-semibold text-gray-900'}`}>
          {label}
        </p>
      </div>
      {!done ? (
        <Button
          variant={active ? 'default' : 'outline'}
          size="sm"
          onClick={onAdvance}
          disabled={disabled || loading}
          loading={loading}
        >
          {loading ? null : actionIcon}
          {active ? 'Confirm' : 'Mark'}
        </Button>
      ) : null}
    </div>
  );
}

function LocationCard({
  icon,
  tag,
  tagColor,
  title,
  subtitle,
  phone,
  phoneEmptyHint,
  mapUrl,
}: {
  icon: React.ReactNode;
  tag: string;
  tagColor: string;
  title: string;
  subtitle: string;
  phone?: string | null;
  phoneEmptyHint?: string;
  mapUrl?: string | null;
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tagColor}`}
        >
          {icon}
          {tag}
        </span>
        <p className="text-base font-bold text-gray-900">{title}</p>
        <p className="text-xs text-gray-500">{subtitle}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {phone ? (
            <Button asChild variant="outline" size="sm" className="flex-1">
              <a href={`tel:${phone}`}>
                <Phone className="h-4 w-4" /> Call
              </a>
            </Button>
          ) : phoneEmptyHint ? (
            <p className="flex-1 self-center text-[11px] italic text-gray-500">
              {phoneEmptyHint}
            </p>
          ) : null}
          {mapUrl ? (
            <Button asChild variant={phone ? 'default' : 'outline'} size="sm" className="flex-1">
              <a href={mapUrl} target="_blank" rel="noreferrer">
                <Navigation className="h-4 w-4" /> Directions
              </a>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function HelpDialog({
  open,
  onOpenChange,
  orderId,
  storePhone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  storePhone?: string | null;
}) {
  const [body, setBody] = useState('');
  const sendMutation = useMutation({
    mutationFn: async () => {
      const text = `[Order ${orderId.slice(-8).toUpperCase()}] ${body.trim()}`;
      const r = await api.post('/api/v1/support/me/messages', { body: text });
      return r.data;
    },
    onSuccess: () => {
      toast.success('Support message sent. We will reply in chat.');
      setBody('');
      onOpenChange(false);
    },
    onError: (err: Error) =>
      toast.error(err.message || 'Could not send. Try again or call support.'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LifeBuoy className="h-4 w-4 text-primary" /> Need help?
          </DialogTitle>
          <DialogDescription>
            Reach the store or our support team if something's wrong with this delivery.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {storePhone ? (
            <Button asChild variant="outline" className="w-full justify-start">
              <a href={`tel:${storePhone}`}>
                <Phone className="h-4 w-4" /> Call the store
              </a>
            </Button>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="help-msg">Report an issue to support</Label>
            <textarea
              id="help-msg"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="e.g. Customer not reachable, store closed, etc."
              rows={3}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={() => sendMutation.mutate()}
            disabled={body.trim().length < 5 || sendMutation.isPending}
            loading={sendMutation.isPending}
          >
            Send message
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function statusHeadline(status: string): string {
  if (status === 'DELIVERED') return 'Delivery complete';
  if (status === 'CANCELLED') return 'Order cancelled';
  if (status === 'REJECTED') return 'Order rejected';
  return 'Delivery';
}

function humanStatus(s: string): string {
  return s
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
