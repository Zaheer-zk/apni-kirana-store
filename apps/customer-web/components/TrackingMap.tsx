'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { CurrentLocationMarker } from '@aks/ui/components/current-location-marker';

/**
 * Read-only Leaflet map used by the order-tracking page. Renders up to three
 * markers (store, customer, driver) and auto-fits the viewport so all three
 * are visible. As driver location updates stream in via socket.io, the
 * component re-fits the bounds with a short animation.
 *
 * Why not use the shared `LocationMap`: that one is a single-point picker
 * with a centred crosshair. Tracking needs distinct markers and a fit-bounds
 * behaviour. Keeping this customer-web local since the other web apps don't
 * need tracking yet.
 */
export interface TrackingMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  kind: 'store' | 'customer' | 'driver';
}

interface TrackingMapProps {
  markers: TrackingMarker[];
  heightClass?: string;
}

type MapModules = {
  L: typeof import('leaflet');
  ReactLeaflet: typeof import('react-leaflet');
};

const MARKER_COLOR: Record<TrackingMarker['kind'], string> = {
  store: '#16A34A', // primary green
  customer: '#2563EB', // blue
  driver: '#F59E0B', // amber
};

export function TrackingMap({ markers, heightClass = 'h-72' }: TrackingMapProps) {
  const [modules, setModules] = useState<MapModules | null>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [L, ReactLeaflet] = await Promise.all([
        import('leaflet'),
        import('react-leaflet'),
      ]);
      await import('leaflet/dist/leaflet.css' as string).catch(() => undefined);
      if (!cancelled) setModules({ L, ReactLeaflet });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-fit whenever marker set changes (e.g. driver moves).
  useEffect(() => {
    if (!modules || !mapRef.current || markers.length === 0) return;
    if (markers.length === 1) {
      mapRef.current.setView([markers[0]!.lat, markers[0]!.lng], 15, { animate: true });
      return;
    }
    const bounds = modules.L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number]));
    mapRef.current.fitBounds(bounds.pad(0.25), { animate: true });
  }, [modules, markers]);

  if (!modules) {
    return (
      <div
        className={`relative w-full overflow-hidden rounded-md border border-gray-200 bg-gray-100 ${heightClass}`}
      >
        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const { MapContainer, TileLayer, Marker, Popup, useMap } = modules.ReactLeaflet;
  const { L } = modules;

  // Tiny inline-svg "pin" so we don't need bundled image assets.
  const iconFor = (kind: TrackingMarker['kind']) => {
    const color = MARKER_COLOR[kind];
    const html = `<div style="
      width:28px;height:28px;border-radius:14px;background:${color};
      border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);
      display:flex;align-items:center;justify-content:center;
      color:white;font-weight:800;font-size:11px;font-family:system-ui;
    ">${kind === 'store' ? 'S' : kind === 'driver' ? 'D' : 'U'}</div>`;
    return L.divIcon({
      html,
      className: 'aks-tracking-marker',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  };

  const center: [number, number] = markers.length
    ? [markers[0]!.lat, markers[0]!.lng]
    : [28.6315, 77.2167]; // Delhi fallback

  function MapHandle() {
    const map = useMap();
    useEffect(() => {
      mapRef.current = map;
    }, [map]);
    return null;
  }

  return (
    <div
      className={`relative w-full overflow-hidden rounded-md border border-gray-200 bg-gray-100 ${heightClass}`}
    >
      <MapContainer
        center={center}
        zoom={14}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <MapHandle />
        {markers.map((m) => (
          <Marker key={m.id} position={[m.lat, m.lng]} icon={iconFor(m.kind)}>
            <Popup>{m.label}</Popup>
          </Marker>
        ))}
        {/* "You are here" — pulsing blue dot at the browser's GPS. Sits
            on top of the store/driver/customer pins without interfering
            with fitBounds (we deliberately don't include it in `markers`
            because the auto-fit should frame the order, not the user). */}
        <CurrentLocationMarker />
      </MapContainer>
    </div>
  );
}
