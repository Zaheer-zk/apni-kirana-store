'use client';

/**
 * Shared LocationMap wrapper used by every web app (customer-web, store-web,
 * driver-web) when a user needs to pick a point on a map.
 *
 * Contract:
 *   - On mount the component asks the browser for `navigator.geolocation`
 *     **before any tile layer is rendered** (the map remains hidden behind a
 *     placeholder spinner). Once the position arrives the map is mounted at
 *     that lat/lng.
 *   - If geolocation is denied or unavailable AND `fallback` is provided we
 *     use that. Otherwise we use Delhi centre (28.6315, 77.2167) — kept in
 *     sync with the Indian fallback the rest of the codebase uses.
 *   - The map is a draggable Leaflet map; the centre of the map *is* the
 *     pinned location. A fixed crosshair pin is overlayed on top so the user
 *     can see where they're pinning. As they drag, `onChange(lat, lng)` is
 *     called with the new centre after `moveend`.
 *   - A "Use my current location" button re-fetches GPS on demand.
 *
 * Why a wrapper: `react-leaflet` (and Leaflet's CSS) can only run on the
 * client, and Next's App Router defaults to server components. Consumers
 * therefore wrap this in `next/dynamic` with `{ ssr: false }`. The wrapper
 * lives in `@aks/ui` (not each app) so customer-web / store-web / driver-web
 * all get the current-location default and the contract for free.
 *
 * Peer deps: requires `leaflet` and `react-leaflet` installed in the
 * consuming app. They are declared as *optional* peers in `@aks/ui`'s
 * package.json so apps that don't use the map (e.g. a pure form) don't have
 * to pay the bundle cost.
 */

import { useEffect, useRef, useState } from 'react';
import { Loader2, Locate } from 'lucide-react';
import { Button } from './button';
import { cn } from '../lib/utils';
import { CurrentLocationMarker } from './current-location-marker';

// Leaflet's bundler-asset URLs don't resolve in webpack/Turbopack without
// help, so we point at the CDN once.
const DEFAULT_ICON_URLS = {
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
};

// Indian centre — keeps the matching-engine seed data visible if geolocation
// fails (same fallback used by `apps/customer-web/lib/use-location.ts`).
const INDIA_FALLBACK = { lat: 28.6315, lng: 77.2167 };

export interface LocationMapProps {
  /**
   * Last-saved coordinates for the entity (store / customer address etc).
   * Used as the fallback when the user denies geolocation. When `null`, we
   * fall back to India centre.
   */
  fallback?: { lat: number; lng: number } | null;
  /**
   * Called whenever the map centre stops moving. Consumers persist the
   * value into form state.
   */
  onChange?: (coords: { lat: number; lng: number }) => void;
  /** Initial zoom level. 15 ≈ neighbourhood. */
  zoom?: number;
  /** Inline height — defaults to 280px so it matches the store-portal map. */
  heightClass?: string;
  /**
   * Skip the geolocation prompt on mount — useful when the consumer already
   * has fresh coords (e.g. editing an existing record). The user can still
   * tap "Use my current location" to override.
   */
  skipInitialGeolocate?: boolean;
}

interface MapRefs {
  L: typeof import('leaflet');
  ReactLeaflet: typeof import('react-leaflet');
}

export function LocationMap({
  fallback,
  onChange,
  zoom = 15,
  heightClass = 'h-72',
  skipInitialGeolocate = false,
}: LocationMapProps) {
  // We have to defer `import 'leaflet/dist/leaflet.css'` and the
  // `react-leaflet` imports to runtime so SSR doesn't choke on the absence
  // of `window`. Once both have loaded we store the modules in state and
  // render the actual map.
  const [refs, setRefs] = useState<MapRefs | null>(null);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mapInstanceRef = useRef<unknown>(null);

  // Load the leaflet bundle + stylesheet once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [L, ReactLeaflet] = await Promise.all([
          import('leaflet'),
          import('react-leaflet'),
        ]);
        // Inject leaflet's stylesheet; safe to call repeatedly because the
        // CSS module side-effects against a singleton document.
        await import('leaflet/dist/leaflet.css' as string).catch(() => undefined);
        // Patch the default-marker icon URLs.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const proto = (L.Icon.Default as any).prototype;
        delete proto._getIconUrl;
        L.Icon.Default.mergeOptions(DEFAULT_ICON_URLS);
        if (!cancelled) setRefs({ L, ReactLeaflet });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load map');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Resolve the initial centre — GPS first, then fallback. We never block
  // the render: `center` stays `null` until GPS resolves OR the fallback is
  // applied, and the placeholder spinner covers that window.
  useEffect(() => {
    let cancelled = false;
    const applyFallback = () => {
      if (cancelled) return;
      const next = fallback ?? INDIA_FALLBACK;
      setCenter(next);
      onChange?.(next);
    };

    if (skipInitialGeolocate) {
      applyFallback();
      return () => {
        cancelled = true;
      };
    }

    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      applyFallback();
      return () => {
        cancelled = true;
      };
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCenter(next);
        onChange?.(next);
        setLocating(false);
      },
      () => {
        applyFallback();
        setLocating(false);
      },
      { timeout: 6_000, maximumAge: 5 * 60_000 },
    );
    return () => {
      cancelled = true;
    };
    // We intentionally only run this on mount — onChange is allowed to
    // change between renders and we don't want to re-fetch GPS for that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recenterToGps = () => {
    if (!('geolocation' in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCenter(next);
        onChange?.(next);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapInstanceRef.current as any)?.flyTo?.([next.lat, next.lng], zoom, {
          duration: 0.4,
        });
        setLocating(false);
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Permission denied. Pan the map manually, or enable location in your browser settings.'
            : 'Could not get your current location. Pan the map manually.',
        );
        setLocating(false);
      },
      { timeout: 6_000, maximumAge: 0 },
    );
  };

  // Loading placeholder — shown until both refs and centre are resolved.
  if (!refs || !center) {
    return (
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-md border border-gray-200 bg-gray-100',
          heightClass,
        )}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-xs">
            {locating ? 'Locating you…' : 'Loading map…'}
          </span>
        </div>
      </div>
    );
  }

  const { MapContainer, TileLayer, useMap } = refs.ReactLeaflet;

  // Bridge component — captured by react-leaflet inside MapContainer to
  // expose the imperative map handle + listen for moveend.
  function MapBridge() {
    const map = useMap();
    useEffect(() => {
      mapInstanceRef.current = map;
      const handler = () => {
        const c = map.getCenter();
        const next = { lat: c.lat, lng: c.lng };
        setCenter(next);
        onChange?.(next);
      };
      map.on('moveend', handler);
      return () => {
        map.off('moveend', handler);
      };
    }, [map]);
    return null;
  }

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-md border border-gray-200 bg-gray-100',
        heightClass,
      )}
    >
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <MapBridge />
        {/* "You are here" dot. The picker pin itself is a fixed crosshair
            overlay (rendered below) so showing the user's GPS as a
            distinct blue dot helps them see how far they're moving the
            pin from their actual position. */}
        <CurrentLocationMarker />
      </MapContainer>

      {/* Fixed crosshair pin — the centre of the map IS the picked point */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden
      >
        <div className="-mt-5 text-3xl drop-shadow-md" role="img" aria-label="Map pin">
          📍
        </div>
      </div>

      {/* "Use my current location" floating button */}
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={recenterToGps}
        disabled={locating}
        className="absolute bottom-3 right-3 z-[400] h-10 w-10 rounded-full bg-white shadow-md"
        aria-label="Use my current location"
      >
        {locating ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        ) : (
          <Locate className="h-4 w-4 text-primary" />
        )}
      </Button>

      {error ? (
        <div className="absolute left-3 right-16 top-3 z-[400] rounded-md bg-white/90 px-3 py-1.5 text-xs text-red-600 shadow">
          {error}
        </div>
      ) : null}
    </div>
  );
}
