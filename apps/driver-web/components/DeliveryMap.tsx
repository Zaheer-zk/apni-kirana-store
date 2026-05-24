'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { CurrentLocationMarker } from '@aks/ui/components/current-location-marker';

// Leaflet's bundler-asset URLs don't resolve in webpack/Turbopack without
// help, so we point at the CDN once (same trick used by the shared
// LocationMap component in @aks/ui).
const ICON_URLS = {
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
};

export interface DeliveryMapProps {
  /** Pickup pin (store). When missing the marker is hidden. */
  pickup?: { lat?: number | null; lng?: number | null; label?: string | null } | null;
  /** Drop-off pin (customer address). */
  dropoff?: { lat?: number | null; lng?: number | null; label?: string | null } | null;
  /**
   * Live driver position from `navigator.geolocation.watchPosition`. May be
   * null if geolocation is denied / unavailable — the map still renders the
   * pickup + drop pins.
   */
  driver?: { lat: number; lng: number } | null;
  heightClass?: string;
}

interface MapRefs {
  L: typeof import('leaflet');
  ReactLeaflet: typeof import('react-leaflet');
}

/**
 * Renders pickup, drop-off and (optionally) live-driver pins on a Leaflet
 * map. Used by the active-delivery detail page so the driver can see all
 * three points at a glance without context-switching to a navigation app.
 *
 * Lifts in leaflet + react-leaflet at runtime via dynamic import so SSR
 * doesn't choke on the absence of `window`. Consumers can additionally wrap
 * this in next/dynamic with `{ ssr: false }` if they want zero leaflet code
 * in the initial bundle.
 */
export function DeliveryMap({
  pickup,
  dropoff,
  driver,
  heightClass = 'h-72',
}: DeliveryMapProps) {
  const [refs, setRefs] = useState<MapRefs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mapInstanceRef = useRef<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await import('leaflet/dist/leaflet.css');
        const L = await import('leaflet');
        const ReactLeaflet = await import('react-leaflet');
        // Configure default icons once. Without this Leaflet emits broken
        // /marker-icon.png URLs that 404 in production builds.
        const proto = L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown };
        delete proto._getIconUrl;
        L.Icon.Default.mergeOptions(ICON_URLS);
        if (!cancelled) setRefs({ L, ReactLeaflet });
      } catch (err) {
        console.warn('[DeliveryMap] failed to load leaflet bundle', err);
        if (!cancelled) setError('Map failed to load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div
        className={`flex w-full items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 text-xs text-gray-500 ${heightClass}`}
      >
        {error}
      </div>
    );
  }

  if (!refs) {
    return (
      <div
        className={`flex w-full items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 ${heightClass}`}
      >
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" aria-hidden />
      </div>
    );
  }

  const { L, ReactLeaflet } = refs;
  const { MapContainer, TileLayer, Marker, Popup } = ReactLeaflet;

  // Build the list of points we care about so we can centre + fit bounds.
  const points: Array<{ lat: number; lng: number; kind: 'pickup' | 'drop' | 'driver'; label?: string }> = [];
  if (typeof pickup?.lat === 'number' && typeof pickup?.lng === 'number') {
    points.push({ lat: pickup.lat, lng: pickup.lng, kind: 'pickup', label: pickup.label ?? 'Pickup' });
  }
  if (typeof dropoff?.lat === 'number' && typeof dropoff?.lng === 'number') {
    points.push({ lat: dropoff.lat, lng: dropoff.lng, kind: 'drop', label: dropoff.label ?? 'Drop-off' });
  }
  if (driver && Number.isFinite(driver.lat) && Number.isFinite(driver.lng)) {
    points.push({ lat: driver.lat, lng: driver.lng, kind: 'driver', label: 'You' });
  }

  if (points.length === 0) {
    return (
      <div
        className={`flex w-full items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 text-xs text-gray-500 ${heightClass}`}
      >
        No coordinates for this delivery
      </div>
    );
  }

  // Centre: midpoint of the bounding box.
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const centre: [number, number] = [(minLat + maxLat) / 2, (minLng + maxLng) / 2];
  const bounds: [[number, number], [number, number]] = [
    [minLat, minLng],
    [maxLat, maxLng],
  ];

  function iconFor(kind: 'pickup' | 'drop' | 'driver'): unknown {
    const color = kind === 'pickup' ? '#2563EB' : kind === 'drop' ? '#16A34A' : '#F59E0B';
    const html = `
      <div style="width:28px;height:28px;border-radius:9999px;background:${color};
                  border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.25);
                  display:flex;align-items:center;justify-content:center;
                  color:#fff;font-weight:700;font-size:11px;line-height:1;">
        ${kind === 'pickup' ? 'P' : kind === 'drop' ? 'D' : '•'}
      </div>`;
    return L.divIcon({
      className: 'driver-web-pin',
      html,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  }

  return (
    <div className={`relative w-full overflow-hidden rounded-xl ${heightClass}`}>
      <MapContainer
        center={centre}
        bounds={points.length > 1 ? bounds : undefined}
        boundsOptions={{ padding: [40, 40] }}
        zoom={points.length === 1 ? 15 : undefined}
        style={{ width: '100%', height: '100%' }}
        scrollWheelZoom={false}
        ref={(instance: unknown) => {
          mapInstanceRef.current = instance;
        }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((p, i) => (
          <Marker
            key={`${p.kind}-${i}`}
            position={[p.lat, p.lng]}
            icon={iconFor(p.kind) as never}
          >
            <Popup>
              <div className="text-xs font-semibold">{p.label}</div>
            </Popup>
          </Marker>
        ))}
        {/* "You are here" — pulsing blue dot using the browser's GPS.
            Driver-web already has the amber "driver" pin (`points` with
            kind: 'driver') sourced from the same geolocation watcher, so
            this primarily helps when the driver pin is hidden (e.g. they
            scrolled the map). Cheap, harmless overlay. */}
        <CurrentLocationMarker />
      </MapContainer>
    </div>
  );
}
