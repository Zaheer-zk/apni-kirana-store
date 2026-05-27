'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from '@aks/ui/components/sonner';
import { isAuthenticated } from '@/lib/auth';
import { getSocket, subscribeToOffers } from '@/lib/socket';
import { playNewDeliveryChime } from '@/lib/sound';
import { OfferDialog } from './OfferDialog';

interface ActiveOffer {
  orderId: string;
  distanceKm?: number;
}

/**
 * Global socket listener that pops the `OfferDialog` whenever the backend
 * pushes an `order:assigned` (or legacy `order:offered`) event to the
 * driver's user-room.
 *
 * Mounted once at the root via `Providers`. The connect-once `getSocket()`
 * singleton ensures we don't open a second socket from other consumers
 * (e.g. the active-delivery page's `subscribeToOrder`).
 *
 * Suppressed while the driver is on /login, /pending, /register or the
 * `/deliveries/new` standalone page so the modal doesn't fight with full-
 * page UI showing the same content.
 */
export function OfferProvider() {
  const pathname = usePathname();
  const [offer, setOffer] = useState<ActiveOffer | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Open the socket eagerly when the driver is authenticated so an offer
  // pushed in the first 5s of a session isn't missed. `getSocket()` is a
  // singleton, safe to call repeatedly.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isAuthenticated()) return;
    getSocket();
  }, [pathname]);

  // Auth-aware suppress list — never even open a socket on these routes
  // because the user isn't a driver yet (or doesn't care about offers).
  const suppress = !pathname || isSuppressedRoute(pathname);

  useEffect(() => {
    if (suppress) return;
    if (typeof window === 'undefined') return;
    if (!isAuthenticated()) return;

    const unsub = subscribeToOffers(
      ({ orderId, distanceKm }) => {
        setOffer({ orderId, distanceKm });
        setDialogOpen(true);
        // Audible cue — gets the driver's attention even if they're not
        // looking at the screen. Silently no-ops if the browser's audio
        // context hasn't been unlocked yet (driver never tapped anything).
        playNewDeliveryChime();
      },
      ({ orderId }) => {
        // Another driver beat us to it — silently close the dialog if it's
        // showing this exact order.
        setOffer((current) => {
          if (current?.orderId === orderId) {
            setDialogOpen(false);
            toast.info('That delivery was taken by another driver.');
            return null;
          }
          return current;
        });
      },
    );
    return unsub;
  }, [suppress]);

  const handleAutoDecline = useCallback(() => {
    // We do NOT POST decline here — the backend's own timer (`driverQueue`
    // job `broadcast-driver-timeout`) already reassigns when the window
    // elapses. We only close the UI so the driver can keep working.
    setDialogOpen(false);
    setOffer(null);
    toast.info('Offer timed out.');
  }, []);

  return (
    <OfferDialog
      orderId={offer?.orderId ?? null}
      open={dialogOpen}
      onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) setOffer(null);
      }}
      distanceKm={offer?.distanceKm}
      onAutoDecline={handleAutoDecline}
    />
  );
}

function isSuppressedRoute(pathname: string): boolean {
  return (
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/pending') ||
    pathname.startsWith('/deliveries/new')
  );
}
