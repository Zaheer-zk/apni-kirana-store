'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Leaflet's default marker icons rely on bundler asset URLs that Next.js doesn't
// resolve out of the box. Point them at the CDN so the marker actually renders.
const DEFAULT_ICON = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface Props {
  lat: number;
  lng: number;
  /** When provided the map is a picker (draggable marker + click-to-move). */
  onChange?: (lat: number, lng: number) => void;
  height?: number;
}

function ClickToMove({ onChange }: { onChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FitToMarker({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom(), { animate: true });
  }, [lat, lng, map]);
  return null;
}

/**
 * Reusable Leaflet map. Picker mode when `onChange` is given (draggable marker +
 * click-to-move); read-only otherwise. Mirrors ZoneMapPicker's SSR-safe setup.
 */
export default function LocationMap({ lat, lng, onChange, height = 280 }: Props) {
  // Sanitize inputs — Leaflet rejects NaN. Fall back to central Delhi.
  const safeLat = Number.isFinite(lat) ? lat : 28.6315;
  const safeLng = Number.isFinite(lng) ? lng : 77.2167;
  const center = useMemo<[number, number]>(() => [safeLat, safeLng], [safeLat, safeLng]);
  const isPicker = typeof onChange === 'function';

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-gray-200"
      style={{ height }}
    >
      <MapContainer
        center={center}
        zoom={14}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <FitToMarker lat={safeLat} lng={safeLng} />
        {isPicker && onChange && <ClickToMove onChange={onChange} />}
        <Marker
          position={center}
          draggable={isPicker}
          icon={DEFAULT_ICON}
          eventHandlers={
            isPicker && onChange
              ? {
                  dragend: (e) => {
                    const m = e.target as L.Marker;
                    const p = m.getLatLng();
                    onChange(p.lat, p.lng);
                  },
                }
              : undefined
          }
        />
      </MapContainer>
      <div className="pointer-events-none absolute bottom-2 left-2 z-[1000] rounded-md bg-white/95 px-2 py-1 text-xs font-mono text-gray-700 shadow">
        {safeLat.toFixed(5)}, {safeLng.toFixed(5)}
        {isPicker && <span className="ml-1 text-gray-400">· tap or drag to move</span>}
      </div>
    </div>
  );
}
