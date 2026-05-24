'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bike,
  Box,
  Check,
  Clock,
  IndianRupee,
  MapPin,
  Navigation,
  Store as StoreIcon,
  X,
} from 'lucide-react';
import { Badge } from '@aks/ui/components/badge';
import { Button } from '@aks/ui/components/button';
import { Skeleton } from '@aks/ui/components/skeleton';
import { toast } from '@aks/ui/components/sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@aks/ui/components/dialog';
import { api } from '@/lib/api';
import { rupeesPrecise } from '@/lib/format';

// Default per-driver accept window (PlatformSetting.driverAcceptTimeoutSeconds
// in backend/prisma/schema.prisma). The actual server may override this;
// the timer is purely a UX countdown — the backend re-broadcasts to other
// drivers if nobody accepts in time.
export const ACCEPT_WINDOW_SECONDS = 60;

interface OfferOrder {
  id: string;
  status: string;
  total: number;
  deliveryFee?: number;
  store?: { name?: string | null; lat?: number | null; lng?: number | null; city?: string | null } | null;
  deliveryAddress?: {
    label?: string | null;
    city?: string | null;
    pincode?: string | null;
    lat?: number | null;
    lng?: number | null;
  } | null;
  items?: Array<{ name: string; qty?: number; quantity?: number; unit?: string; price: number }>;
}

export interface OfferDialogProps {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Distance hint piped through from the socket payload (km). */
  distanceKm?: number;
  /** Called when the timer expires so the parent can clear its `orderId`. */
  onAutoDecline?: () => void;
}

/**
 * Renders a fullscreen-ish modal with order details and Accept / Decline
 * actions. Used by `OfferProvider` for socket-pushed offers and by the
 * standalone `/deliveries/new` page so a push-notification tap lands on the
 * same surface.
 *
 * Why a timer at all: the matching engine re-broadcasts to other drivers
 * after `driverAcceptTimeoutSeconds` (default 60s — see backend
 * `services/driver.service.ts`). Showing the countdown lets the driver
 * decide quickly; on hitting 0 we auto-decline so the order is freed for
 * the next driver in the broadcast set.
 */
export function OfferDialog({
  orderId,
  open,
  onOpenChange,
  distanceKm,
  onAutoDecline,
}: OfferDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [remaining, setRemaining] = useState(ACCEPT_WINDOW_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch offer details ──────────────────────────────────────────────────
  // `/orders/:id` with role=DRIVER returns items + store + deliveryAddress
  // (PII stripped). We refetch every time `orderId` flips to a non-null
  // value so a fresh offer always pulls the latest snapshot.
  const offerQuery = useQuery<OfferOrder>({
    queryKey: ['offerOrder', orderId],
    queryFn: async () => {
      const r = await api.get<{ success: boolean; data: OfferOrder }>(
        `/api/v1/orders/${orderId}`,
      );
      return r.data?.data;
    },
    enabled: !!orderId && open,
    refetchOnWindowFocus: false,
    retry: 0,
  });

  // ── Countdown timer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !orderId) return;
    setRemaining(ACCEPT_WINDOW_SECONDS);
    timerRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          // Defer the side-effect so we don't update other state during
          // setInterval's own tick.
          setTimeout(() => onAutoDecline?.(), 0);
          return 0;
        }
        return r - 1;
      });
    }, 1_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [open, orderId, onAutoDecline]);

  // ── Accept / Decline mutations ───────────────────────────────────────────
  const acceptMutation = useMutation({
    mutationFn: async () => {
      const r = await api.put(`/api/v1/drivers/orders/${orderId}/accept`);
      return r.data;
    },
    onSuccess: () => {
      toast.success('Delivery accepted');
      queryClient.invalidateQueries({ queryKey: ['driverActiveOrder'] });
      queryClient.invalidateQueries({ queryKey: ['driverDeliveriesList'] });
      onOpenChange(false);
      if (orderId) router.push(`/deliveries/${orderId}`);
    },
    onError: (err: Error) => {
      // 400 happens if another driver beat us to it.
      toast.error(err.message || 'Could not accept — it may have been taken.');
      onOpenChange(false);
    },
  });

  const declineMutation = useMutation({
    mutationFn: async () => {
      const r = await api.put(`/api/v1/drivers/orders/${orderId}/reject`);
      return r.data;
    },
    onSuccess: () => {
      toast.info('Declined. We\'ll find another driver.');
      onOpenChange(false);
    },
    onError: (err: Error) => {
      // Reject can 403 if the order was never assigned to this driver
      // individually (e.g. broadcast mode). Treat that as a soft decline.
      console.warn('[offer] decline error', err.message);
      onOpenChange(false);
    },
  });

  const offer = offerQuery.data;

  const distance = useMemo(() => {
    if (typeof distanceKm === 'number') return distanceKm;
    if (
      offer?.store &&
      offer.deliveryAddress &&
      typeof offer.store.lat === 'number' &&
      typeof offer.store.lng === 'number' &&
      typeof offer.deliveryAddress.lat === 'number' &&
      typeof offer.deliveryAddress.lng === 'number'
    ) {
      return haversine(
        offer.store.lat,
        offer.store.lng,
        offer.deliveryAddress.lat,
        offer.deliveryAddress.lng,
      );
    }
    return null;
  }, [distanceKm, offer]);

  const payout = offer?.deliveryFee ?? 0;
  const itemCount = offer?.items?.length ?? 0;

  const percentRemaining = Math.max(0, Math.min(100, (remaining / ACCEPT_WINDOW_SECONDS) * 100));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
        {/* Hero — pulsing accent so it grabs attention even from a peripheral
            glance, which is what we want when a driver is mid-task. */}
        <div className="bg-primary px-5 pb-6 pt-5 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg text-white">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
              </span>
              New delivery offer
            </DialogTitle>
            <DialogDescription className="text-xs text-white/80">
              Tap Accept within the time window. We'll route you to the order screen.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex items-end justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/70">
                Estimated payout
              </p>
              <p className="text-3xl font-extrabold">{rupeesPrecise(payout)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/70">
                Time left
              </p>
              <p className="flex items-center gap-1 text-2xl font-extrabold">
                <Clock className="h-5 w-5" />
                {remaining}s
              </p>
            </div>
          </div>
        </div>

        {/* Countdown bar */}
        <div
          aria-hidden
          className="h-1 bg-primary/30"
        >
          <div
            className="h-full bg-white transition-[width] duration-1000 ease-linear"
            style={{ width: `${percentRemaining}%`, backgroundColor: '#F59E0B' }}
          />
        </div>

        <div className="space-y-4 px-5 py-4">
          {offerQuery.isLoading ? (
            <>
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </>
          ) : offerQuery.isError || !offer ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              Could not load offer details. You can still accept — full details will
              appear on the delivery screen.
            </p>
          ) : (
            <>
              {/* Pickup */}
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-blue-600">
                  <StoreIcon className="h-3 w-3" /> Pickup
                </p>
                <p className="text-sm font-bold text-gray-900">
                  {offer.store?.name ?? 'Store'}
                </p>
                <p className="text-xs text-gray-500">
                  {offer.store?.city ?? '—'}
                  {distance !== null ? ` · ${distance.toFixed(1)} km away` : ''}
                </p>
              </div>

              {/* Drop */}
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                  <MapPin className="h-3 w-3" /> Drop-off
                </p>
                <p className="text-sm font-bold text-gray-900">
                  {offer.deliveryAddress?.label ?? 'Customer address'}
                </p>
                <p className="text-xs text-gray-500">
                  {[offer.deliveryAddress?.city, offer.deliveryAddress?.pincode]
                    .filter(Boolean)
                    .join(', ') || '—'}
                </p>
              </div>

              {/* Meta */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <Stat
                  label="Items"
                  value={`${itemCount}`}
                  icon={<Box className="h-3 w-3" />}
                />
                <Stat
                  label="Order"
                  value={rupeesPrecise(offer.total)}
                  icon={<IndianRupee className="h-3 w-3" />}
                />
                <Stat
                  label="Distance"
                  value={distance !== null ? `${distance.toFixed(1)} km` : '—'}
                  icon={<Navigation className="h-3 w-3" />}
                />
              </div>
            </>
          )}
        </div>

        {/* Sticky action bar */}
        <div className="flex gap-2 border-t border-gray-100 bg-white px-5 py-4">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => declineMutation.mutate()}
            disabled={declineMutation.isPending || acceptMutation.isPending}
          >
            <X className="h-4 w-4" /> Decline
          </Button>
          <Button
            variant="default"
            className="flex-1"
            onClick={() => acceptMutation.mutate()}
            disabled={remaining <= 0 || acceptMutation.isPending}
            loading={acceptMutation.isPending}
          >
            <Check className="h-4 w-4" /> Accept
          </Button>
        </div>

        {/* Bonus context */}
        <div className="border-t border-gray-100 bg-gray-50 px-5 py-3 text-[11px] text-gray-500">
          <Bike className="mr-1 inline h-3 w-3" />
          Auto-declined when the timer hits 0 so it can be offered to another driver.
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-md bg-gray-50 px-2 py-2">
      <p className="flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-gray-900">{value}</p>
    </div>
  );
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(toRad(lat1)) * Math.cos(toRad(lat2));
  return 2 * R * Math.asin(Math.sqrt(h));
}
