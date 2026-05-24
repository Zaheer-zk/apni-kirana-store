'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Bike, Inbox } from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Card, CardContent } from '@aks/ui/components/card';
import { AppHeader } from '@/components/AppHeader';
import { OfferDialog } from '@/components/OfferDialog';
import { RequireAuth } from '@/components/RequireAuth';
import { subscribeToOffers } from '@/lib/socket';

/**
 * Standalone landing page for an incoming delivery offer. Used in two
 * flows:
 *
 * 1. Push-notification deep link — `notification.url = "/deliveries/new?orderId=<id>"`
 *    so tapping the FCM/Expo Push notification while the PWA is closed lands
 *    the driver straight on the offer screen.
 * 2. Standalone "next offer" room while the driver waits. The global
 *    OfferProvider is suppressed on this route (see OfferProvider's
 *    `isSuppressedRoute`) so the same component isn't rendered twice — the
 *    inline OfferDialog below takes over.
 */
export default function NewDeliveryOfferPage() {
  return (
    <RequireAuth>
      <AppHeader />
      <main className="page-shell py-6">
        <NewOffer />
      </main>
    </RequireAuth>
  );
}

function NewOffer() {
  const router = useRouter();
  const params = useSearchParams();
  const queryOrderId = params?.get('orderId') ?? null;

  const [orderId, setOrderId] = useState<string | null>(queryOrderId);
  const [open, setOpen] = useState<boolean>(!!queryOrderId);

  // If we landed without an orderId, listen for the next live offer and
  // auto-open the dialog when one arrives.
  useEffect(() => {
    if (queryOrderId) return;
    const unsub = subscribeToOffers(
      ({ orderId }) => {
        setOrderId(orderId);
        setOpen(true);
      },
      ({ orderId: rescindedId }) => {
        setOrderId((current) => {
          if (current === rescindedId) {
            setOpen(false);
            return null;
          }
          return current;
        });
      },
    );
    return unsub;
  }, [queryOrderId]);

  function handleAutoDecline() {
    setOpen(false);
    setOrderId(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <p className="text-xs font-semibold text-gray-500">Deliveries</p>
          <h1 className="text-2xl font-bold text-gray-900">New delivery offer</h1>
        </div>
      </div>

      {orderId ? (
        <Card className="border-primary-200 bg-primary-50">
          <CardContent className="flex items-center gap-3 p-4">
            <Bike className="h-6 w-6 text-primary" />
            <div>
              <p className="text-sm font-bold text-gray-900">Offer #{orderId.slice(-8).toUpperCase()}</p>
              <p className="text-xs text-gray-700">
                Review the offer in the popup — tap Accept to start the delivery.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500">
              <Inbox className="h-6 w-6" />
            </div>
            <p className="text-sm font-bold text-gray-900">Waiting for the next offer</p>
            <p className="max-w-sm text-xs text-gray-500">
              You'll see new delivery offers here as soon as the matching engine sends
              one to your account. Keep this tab open and stay online.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/">Back to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <OfferDialog
        orderId={orderId}
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setOrderId(null);
        }}
        onAutoDecline={handleAutoDecline}
      />
    </div>
  );
}
