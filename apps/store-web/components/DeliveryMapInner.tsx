'use client';

import { useEffect, useState } from 'react';

/**
 * Read-only Leaflet map that pins the store, the driver (if known) and the
 * delivery point. Lazy-loads `leaflet` + `react-leaflet` so server bundles
 * stay free of `window`-touching modules.
 *
 * Consumed via `DeliveryMap.tsx` which wraps this in `next/dynamic` to
 * disable SSR. See packages/ui/src/components/location-map.tsx for the
 * canonical lazy-load pattern.
 */

const DEFAULT_ICON_URLS = {
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
};

interface MapRefs {
  L: typeof import('leaflet');
  ReactLeaflet: typeof import('react-leaflet');
}

export interface DeliveryMapInnerProps {
  store?: { lat: number; lng: number; name?: string } | null;
  driver?: { lat: number; lng: number; name?: string } | null;
  dropoff?: { lat: number; lng: number; label?: string } | null;
  heightClass?: string;
}

export default function DeliveryMapInner({
  store,
  driver,
  dropoff,
  heightClass = 'h-72',
}: DeliveryMapInnerProps) {
  const [refs, setRefs] = useState<MapRefs | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [L, ReactLeaflet] = await Promise.all([
        import('leaflet'),
        import('react-leaflet'),
      ]);
      await import('leaflet/dist/leaflet.css' as string).catch(() => undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const proto = (L.Icon.Default as any).prototype;
      delete proto._getIconUrl;
      L.Icon.Default.mergeOptions(DEFAULT_ICON_URLS);
      if (!cancelled) setRefs({ L, ReactLeaflet });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!refs) {
    return (
      <div
        className={`flex w-full items-center justify-center rounded-md border border-gray-200 bg-gray-100 ${heightClass}`}
      >
        <span className="text-xs text-gray-500">Loading map…</span>
      </div>
    );
  }

  const { MapContainer, TileLayer, Marker, Popup } = refs.ReactLeaflet;
  const L = refs.L;

  // Pick the centre as the driver if available, then store, then dropoff.
  const center = driver ?? store ?? dropoff;
  if (!center) {
    return (
      <div
        className={`flex w-full items-center justify-center rounded-md border border-gray-200 bg-gray-100 ${heightClass}`}
      >
        <span className="text-xs text-gray-500">No coordinates available for this order yet.</span>
      </div>
    );
  }

  // Custom coloured circle markers — quicker to read at a glance than the
  // default blue pin three times over.
  function divIcon(emoji: string, bg: string) {
    return L.divIcon({
      className: 'aks-delivery-marker',
      html:
        `<div style="background:${bg};width:34px;height:34px;border-radius:9999px;` +
        `display:flex;align-items:center;justify-content:center;border:2px solid white;` +
        `box-shadow:0 1px 4px rgba(0,0,0,0.25);font-size:18px;line-height:1">${emoji}</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });
  }

  // Pad the bounds slightly so markers aren't flush against the edge.
  const points: [number, number][] = [];
  if (store) points.push([store.lat, store.lng]);
  if (driver) points.push([driver.lat, driver.lng]);
  if (dropoff) points.push([dropoff.lat, dropoff.lng]);

  return (
    <div className={`overflow-hidden rounded-md border border-gray-200 ${heightClass}`}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={14}
        scrollWheelZoom={false}
        bounds={points.length > 1 ? (points as never) : undefined}
        boundsOptions={{ padding: [30, 30] }}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        {store ? (
          <Marker position={[store.lat, store.lng]} icon={divIcon('🏪', '#10b981')}>
            <Popup>{store.name ?? 'Your store'}</Popup>
          </Marker>
        ) : null}
        {dropoff ? (
          <Marker position={[dropoff.lat, dropoff.lng]} icon={divIcon('🏠', '#0ea5e9')}>
            <Popup>{dropoff.label ?? 'Delivery point'}</Popup>
          </Marker>
        ) : null}
        {driver ? (
          <Marker position={[driver.lat, driver.lng]} icon={divIcon('🛵', '#ea580c')}>
            <Popup>{driver.name ?? 'Driver'}</Popup>
          </Marker>
        ) : null}
      </MapContainer>
    </div>
  );
}
