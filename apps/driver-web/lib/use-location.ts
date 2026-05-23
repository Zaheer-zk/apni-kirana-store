'use client';

import { useEffect, useState } from 'react';

/**
 * Resolves a coarse user location for the driver app. Identical contract to
 * `apps/customer-web/lib/use-location.ts` so the two surfaces behave
 * predictably.
 *
 * Strategy (cheapest → most accurate):
 *   1. Cached value in sessionStorage (no flicker between pages)
 *   2. Browser geolocation if granted
 *   3. Fallback to Delhi centre (28.6315, 77.2167)
 *
 * The driver web app is profile / earnings / history only — no background
 * GPS, no live tracking. This hook exists for any future map widget that
 * needs an initial centre.
 */
const FALLBACK: LatLng = { lat: 28.6315, lng: 77.2167 };
const CACHE_KEY = 'aks_driver_loc';

export interface LatLng {
  lat: number;
  lng: number;
}

interface LocationState {
  coords: LatLng;
  status: 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable';
  source: 'cache' | 'geo' | 'fallback';
}

export function useLocation(): LocationState {
  const [state, setState] = useState<LocationState>({
    coords: FALLBACK,
    status: 'idle',
    source: 'fallback',
  });

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as LatLng;
        if (Number.isFinite(cached.lat) && Number.isFinite(cached.lng)) {
          setState({ coords: cached, status: 'granted', source: 'cache' });
        }
      }
    } catch {
      /* corrupted cache; ignore */
    }

    if (!('geolocation' in navigator)) {
      setState((s) => ({ ...s, status: 'unavailable' }));
      return;
    }

    setState((s) => ({ ...s, status: 'requesting' }));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(coords));
        setState({ coords, status: 'granted', source: 'geo' });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setState((s) => ({ ...s, status: 'denied' }));
        } else {
          setState((s) => ({ ...s, status: 'unavailable' }));
        }
      },
      { timeout: 6_000, maximumAge: 5 * 60_000 },
    );
  }, []);

  return state;
}
