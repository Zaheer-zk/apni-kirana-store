'use client';

/**
 * Shared "You are here" marker + geolocation hook for every Leaflet map in
 * the web apps (customer-web, store-web, driver-web, admin).
 *
 * Why a shared module:
 *   - The exact same "blue pulsing dot at GPS" UX is needed on every map
 *     (tracking, delivery view, pickers, zone editor, store detail).
 *   - Putting the divIcon CSS + watchPosition lifecycle in one place keeps
 *     the styling consistent and the geolocation prompt behaviour identical
 *     across all apps.
 *
 * Exports
 *   - `useCurrentLocation()` — headless hook for callers that just want the
 *     coords (e.g. a "Use my location" button on a picker).
 *   - `<CurrentLocationMarker />` — drops a Leaflet Marker as a child of
 *     `<MapContainer>`. Returns `null` until a fix lands or if the user
 *     denied permission, so it never spams an error.
 *
 * Peer deps: `react-leaflet` + `leaflet`. Both are declared optional peers
 * on `@aks/ui` because not every app uses maps. To stay SSR-safe (Next App
 * Router) the file lazy-imports both modules at runtime — never at module
 * scope — so consumers can use it without wrapping in `next/dynamic` (the
 * component just renders nothing on the server).
 */

import { useEffect, useRef, useState } from 'react';

export type LatLng = { lat: number; lng: number };

export type GeolocationStatus =
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unavailable';

export interface UseCurrentLocationResult {
  coords: LatLng | null;
  status: GeolocationStatus;
  /** Last error message, if any. Cleared on the next successful fix. */
  error: string | null;
}

interface UseCurrentLocationOptions {
  /** Update every time the browser pushes a new fix. Default true. */
  watch?: boolean;
  /** Forwarded to `navigator.geolocation.*`. */
  enableHighAccuracy?: boolean;
  /** Forwarded to `navigator.geolocation.*`. Default 5min stale window. */
  maximumAge?: number;
  /** Forwarded to `navigator.geolocation.*`. Default 10s. */
  timeout?: number;
}

/**
 * Subscribe to the browser's current GPS.
 *
 * - Uses `watchPosition` by default so the dot follows you as you walk; pass
 *   `watch: false` for a one-shot read.
 * - Silently no-ops if the browser doesn't expose geolocation or the user
 *   denies permission — `status` reflects the state so callers can render
 *   a hint if they want.
 * - Cleans up the watcher on unmount.
 */
export function useCurrentLocation(
  options: UseCurrentLocationOptions = {},
): UseCurrentLocationResult {
  const { watch = true, enableHighAccuracy = true, maximumAge = 5 * 60_000, timeout = 10_000 } =
    options;

  const [coords, setCoords] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<GeolocationStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setStatus('unavailable');
      return;
    }

    let cancelled = false;
    let watchId: number | null = null;

    const handleSuccess = (pos: GeolocationPosition) => {
      if (cancelled) return;
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setStatus('granted');
      setError(null);
    };

    const handleError = (err: GeolocationPositionError) => {
      if (cancelled) return;
      if (err.code === err.PERMISSION_DENIED) {
        setStatus('denied');
      } else {
        // POSITION_UNAVAILABLE / TIMEOUT — leave 'requesting' if we never
        // had a fix, otherwise keep the last one and surface the error.
        setStatus((prev) => (prev === 'granted' ? 'granted' : 'unavailable'));
      }
      setError(err.message || null);
    };

    setStatus('requesting');
    const opts: PositionOptions = { enableHighAccuracy, maximumAge, timeout };

    if (watch) {
      watchId = navigator.geolocation.watchPosition(handleSuccess, handleError, opts);
    } else {
      navigator.geolocation.getCurrentPosition(handleSuccess, handleError, opts);
    }

    return () => {
      cancelled = true;
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [watch, enableHighAccuracy, maximumAge, timeout]);

  return { coords, status, error };
}

interface CurrentLocationMarkerProps {
  /**
   * Tooltip / popup text. Defaults to "You are here". Pass `null` to omit
   * the popup entirely.
   */
  label?: string | null;
  /** Diameter of the inner dot, in pixels. Default 14. */
  size?: number;
  /** Marker accent colour. Default `#1d4ed8` (blue-700). */
  color?: string;
  /** Forwarded to `useCurrentLocation` — defaults to watching position. */
  watch?: boolean;
  /**
   * Drawn z-index. Default 600 so it sits above tracking pins (~400) but
   * below floating UI buttons (1000+).
   */
  zIndexOffset?: number;
}

interface LeafletModule {
  divIcon: typeof import('leaflet').divIcon;
}

interface ReactLeafletModule {
  Marker: typeof import('react-leaflet').Marker;
  Popup: typeof import('react-leaflet').Popup;
}

interface LoadedRefs {
  L: LeafletModule;
  RL: ReactLeafletModule;
}

// CSS for the pulsing blue dot. Injected once per document — calling
// `injectStyles()` repeatedly is a no-op. Avoids the consumer needing to add
// CSS to every app's global stylesheet.
const STYLE_ID = 'aks-current-location-marker-style';

function injectStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .aks-current-location-marker { background: transparent !important; border: 0 !important; }
    .aks-current-location-dot {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .aks-current-location-dot .aks-pulse {
      position: absolute;
      inset: 0;
      border-radius: 9999px;
      background: var(--aks-loc-color, #1d4ed8);
      opacity: 0.35;
      animation: aks-loc-pulse 1.8s ease-out infinite;
    }
    .aks-current-location-dot .aks-core {
      position: relative;
      width: 60%;
      height: 60%;
      border-radius: 9999px;
      background: var(--aks-loc-color, #1d4ed8);
      box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.95),
        0 1px 4px rgba(0, 0, 0, 0.35);
    }
    @keyframes aks-loc-pulse {
      0%   { transform: scale(0.6); opacity: 0.55; }
      80%  { transform: scale(2.2); opacity: 0;   }
      100% { transform: scale(2.2); opacity: 0;   }
    }
    @media (prefers-reduced-motion: reduce) {
      .aks-current-location-dot .aks-pulse { animation: none; opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Renders a Leaflet `<Marker>` at the user's current GPS as a pulsing blue
 * dot. MUST be rendered as a direct child of `<MapContainer>` so the
 * react-leaflet context can register it.
 *
 * Returns `null` (no marker) when:
 *   - The component is rendering on the server,
 *   - the leaflet / react-leaflet bundles haven't loaded yet,
 *   - the browser has no geolocation API,
 *   - the user denied permission, or
 *   - no fix has landed yet.
 *
 * In every "no marker" case we silently degrade — never log errors that the
 * map embedding page would treat as crashes.
 */
export function CurrentLocationMarker({
  label = 'You are here',
  size = 14,
  color = '#1d4ed8',
  watch = true,
  zIndexOffset = 600,
}: CurrentLocationMarkerProps = {}) {
  const { coords, status } = useCurrentLocation({ watch });
  const [modules, setModules] = useState<LoadedRefs | null>(null);
  const iconRef = useRef<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [L, RL] = await Promise.all([
          import('leaflet'),
          import('react-leaflet'),
        ]);
        if (cancelled) return;
        injectStyles();
        setModules({ L, RL });
      } catch {
        // Peer deps missing — render nothing, no console spam.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!modules || !coords || status === 'denied' || status === 'unavailable') {
    return null;
  }

  // Rebuild the icon when the colour / size props change. The icon object
  // is stable across coord updates so Leaflet doesn't re-create the DOM
  // node every position tick.
  const wrapSize = Math.max(12, size * 2.2);
  const html = `
    <div class="aks-current-location-dot" style="width:${wrapSize}px;height:${wrapSize}px;--aks-loc-color:${color}">
      <div class="aks-pulse"></div>
      <div class="aks-core"></div>
    </div>
  `;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Marker = modules.RL.Marker as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Popup = modules.RL.Popup as any;
  iconRef.current = modules.L.divIcon({
    className: 'aks-current-location-marker',
    html,
    iconSize: [wrapSize, wrapSize],
    iconAnchor: [wrapSize / 2, wrapSize / 2],
  });

  return (
    <Marker
      position={[coords.lat, coords.lng]}
      icon={iconRef.current}
      zIndexOffset={zIndexOffset}
      // Don't intercept clicks — pickers + tracking maps need the user to be
      // able to click through to whatever is below.
      interactive={!!label}
      keyboard={false}
    >
      {label ? <Popup>{label}</Popup> : null}
    </Marker>
  );
}
