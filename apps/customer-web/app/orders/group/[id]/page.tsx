'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ChevronLeft, Loader2, MapPin, Store as StoreIcon, XCircle } from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Card, CardContent } from '@aks/ui/components/card';
import { Separator } from '@aks/ui/components/separator';
import { toast } from '@aks/ui/components/sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@aks/ui/components/dialog';
import { AppHeader } from '@/components/AppHeader';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { ErrorPanel, PageLoader } from '@/components/StatePanels';
import {
  cancelOrderGroup,
  fetchOrderGroup,
  type OrderGroupRollup,
} from '@/lib/orders';
import { rupees } from '@/lib/format';
import { useUser } from '@/lib/use-user';

/**
 * Customer rollup for a multi-store order. POST /orders splits cross-
 * store carts into one OrderGroup + N child Orders (one per fulfilling
 * store) — this screen renders the parent + per-store sub-rows so the
 * customer sees:
 *
 *   "Your order across 3 stores · ₹612 total · single delivery"
 *   ┌─ Store A · Accepted · 3 items · ₹240
 *   ├─ Store B · Pending  · 1 item  · ₹80
 *   └─ Store C · Driver assigned · 2 items · ₹292
 *
 * Each row deep-links to the per-leg detail page so the customer can
 * see each store's timeline + cancel just that leg without nuking the
 * whole basket.
 */
export default function OrderGroupPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { mounted, user } = useUser({ redirectTo: `/orders/group/${id}` });
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const { data, isLoading, isError, refetch } = useQuery<OrderGroupRollup>({
    queryKey: ['order-group', id],
    queryFn: () => fetchOrderGroup(id),
    enabled: !!id && !!user,
    refetchInterval: 15_000,
  });

  // Cancel-all mutation. The backend cancels every leg that's still
  // cancellable (pre-pickup) AND refunds the proportional slice of the
  // group's single deliveryFee to the customer's wallet. Already-
  // picked-up / delivered legs are skipped — we surface that in the
  // success toast so the customer isn't confused if N legs were live
  // but only K got cancelled.
  const cancelMutation = useMutation({
    mutationFn: () => cancelOrderGroup(id, cancelReason.trim() || 'Cancelled by customer'),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['order-group', id] });
      setCancelOpen(false);
      setCancelReason('');
      const refundCopy =
        result.refundRupees > 0
          ? ` ₹${result.refundRupees.toFixed(0)} credited to your wallet.`
          : '';
      toast.success(
        `Cancelled ${result.cancelledLegs.length} of ${data?.orders.length ?? 0} legs.${refundCopy}`,
      );
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(e?.response?.data?.error?.message ?? 'Could not cancel the group.');
    },
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

  if (isLoading) {
    return (
      <>
        <AppHeader showSearch={false} />
        <main className="page-shell py-10">
          <PageLoader />
        </main>
      </>
    );
  }

  if (isError || !data) {
    return (
      <>
        <AppHeader showSearch={false} />
        <main className="page-shell py-10">
          <ErrorPanel
            message="Couldn't load this order group."
            onRetry={() => refetch()}
          />
        </main>
      </>
    );
  }

  // Cancel-all is offered when at least one leg is still cancellable
  // (PENDING / STORE_ACCEPTED / DRIVER_ASSIGNED-not-yet-picked-up).
  // Picked-up or delivered legs are past the point of no return.
  const anyCancellable = data.orders.some(
    (o) =>
      o.status === 'PENDING' ||
      o.status === 'STORE_ACCEPTED' ||
      o.status === 'COOKING' ||
      (o.status === 'DRIVER_ASSIGNED' && !o.pickedUpAt),
  );

  return (
    <>
      <AppHeader showSearch={false} />
      <main className="page-shell py-6">
        <Link
          href="/orders"
          className="-ml-2 mb-3 inline-flex items-center gap-1 text-sm font-semibold text-gray-600 hover:text-gray-900"
        >
          <ChevronLeft className="h-4 w-4" />
          All orders
        </Link>

        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Your order across {data.orders.length} store
              {data.orders.length === 1 ? '' : 's'}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
              <span>#{data.id.slice(-8).toUpperCase()}</span>
              <span aria-hidden>·</span>
              <span>{rupees(data.total)} total · single delivery</span>
              <span aria-hidden>·</span>
              <OrderStatusBadge status={data.status as Parameters<typeof OrderStatusBadge>[0]['status']} />
            </div>
          </div>
          {anyCancellable ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCancelOpen(true)}
              disabled={cancelMutation.isPending}
              className="text-destructive hover:bg-destructive/5"
            >
              <XCircle className="h-4 w-4" />
              Cancel order
            </Button>
          ) : null}
        </header>

        {/* Group OTP card — surfaces ONE delivery code for the whole
            basket as soon as any leg is picked up. The customer used
            to see N OTPs (one per leg) which was confusing; the
            split-create path now assigns every child the same OTP so
            this single card is the source of truth. (B-5 in the
            2026-06-04 audit.) */}
        {(() => {
          const anyPickedUp = data.orders.some((o) => o.pickedUpAt);
          const fullyDelivered = data.orders.every(
            (o) => o.status === 'DELIVERED' || o.status === 'CANCELLED',
          );
          if (!anyPickedUp || fullyDelivered) return null;
          // Every leg carries the same OTP — pull from the first one
          // that has it.
          const otp = data.orders.find((o) => o.dropoffOtp)?.dropoffOtp;
          if (!otp) return null;
          return (
            <Card className="mb-4 border-primary/30 bg-primary/5">
              <CardContent className="space-y-1 p-5 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
                  Your delivery code (one code for the whole basket)
                </p>
                <p className="font-mono text-3xl font-bold tracking-widest text-gray-900">
                  {otp}
                </p>
                <p className="text-xs text-gray-500">
                  Share this with the driver at the door to confirm delivery.
                </p>
              </CardContent>
            </Card>
          );
        })()}

        {/* Aggregate summary card — what the customer is actually paying. */}
        <Card className="mb-4">
          <CardContent className="space-y-2 p-5">
            <Row label="Items subtotal" value={rupees(data.subtotal)} />
            <Row label="Delivery fee" value={rupees(data.deliveryFee)} />
            <Separator />
            <Row label="Total" value={rupees(data.total)} bold />
            <p className="pt-2 text-xs text-gray-500">
              One driver picks up from each store and brings everything to
              you in a single delivery. Pickup ETAs may differ; the final
              delivery happens once all pickups are complete.
            </p>
          </CardContent>
        </Card>

        {/* Per-store legs */}
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Per-store status
        </h2>
        <div className="space-y-3">
          {data.orders.map((leg) => (
            <Link
              key={leg.id}
              href={`/orders/${leg.id}`}
              className="block transition hover:no-underline"
            >
              <Card className="hover:border-gray-300 hover:shadow-md">
                <CardContent className="flex items-center gap-4 p-4 sm:p-5">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
                    <StoreIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900">
                        {leg.store?.name ?? 'Store'}
                      </p>
                      <OrderStatusBadge
                        status={leg.status as Parameters<typeof OrderStatusBadge>[0]['status']}
                      />
                      {/* Rating affordance per leg. Tapping the row
                          already deep-links to the per-leg detail
                          where the existing rate form lives, so the
                          chip is informational + a CTA hint. */}
                      {leg.status === 'DELIVERED' ? (
                        leg.rating ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            ✓ {leg.rating.storeRating}★
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                            Tap to rate
                          </span>
                        )
                      ) : null}
                    </div>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                      <MapPin className="h-3 w-3" />
                      {leg.store?.city ?? '—'}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">
                      {leg.items?.length ?? 0} item
                      {(leg.items?.length ?? 0) === 1 ? '' : 's'} ·{' '}
                      {rupees(leg.subtotal)}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </main>

      {/* Cancel-all confirmation. We surface the leg-by-leg breakdown
          so the customer knows exactly how many pickups will be aborted
          and how much they'll be refunded — picked-up / delivered legs
          are explicitly excluded. */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this multi-store order?</DialogTitle>
            <DialogDescription>
              We'll cancel every leg that hasn't been picked up yet. The
              proportional share of your delivery fee will be refunded to
              your wallet. Legs that have already been picked up can't be
              cancelled — contact support if you need help with those.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason (optional)"
              rows={2}
              maxLength={500}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setCancelOpen(false)}
              disabled={cancelMutation.isPending}
            >
              Keep order
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              Cancel order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className={bold ? 'font-semibold text-gray-900' : 'text-gray-600'}>
        {label}
      </span>
      <span className={bold ? 'text-lg font-bold text-gray-900' : 'text-gray-900'}>
        {value}
      </span>
    </div>
  );
}
