'use client';

import { useEffect } from 'react';
import { toast } from '@aks/ui/components/sonner';
import { pushLocationUpdate } from '@/lib/socket';

/**
 * While the driver is ONLINE, share browser geolocation with the backend so
 * the matching engine can actually find them. Without this push,
 * Driver.currentLat/Lng stays null and the candidate scan skips the driver —
 * no orders are ever offered.
 *
 * Uses `navigator.geolocation.watchPosition` (continuous) with a 15s throttle
 * on the actual socket push, balancing engine freshness vs. socket noise.
 * Cleans up the watcher when going offline or unmounting.
 *
 * This hook is shared between `HeaderOnlineToggle` (top bar pill, hidden on
 * small screens) and `OnlineToggle` (hero card on the dashboard). Drivers
 * who toggle online via either surface get the same GPS push — earlier the
 * hero toggle had no watcher, so drivers using a small viewport were
 * silently invisible to the engine.
 */
export function useOnlineLocation(isOnline: boolean): void {
  useEffect(() => {
    if (!isOnline) return;
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return;

    let lastPush = 0;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        // Throttle to ~once every 15s — fast enough for the matching
        // engine, slow enough to not flood the socket.
        const now = Date.now();
        if (now - lastPush < 15_000) return;
        lastPush = now;
        pushLocationUpdate(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        console.warn('[useOnlineLocation] geolocation error', err);
        if (err.code === err.PERMISSION_DENIED) {
          toast.error(
            'Location access is required so customers near you can place orders. Enable it in your browser settings.',
          );
        }
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
    );

    return () => navigator.geolocation.clearWatch(id);
  }, [isOnline]);
}
