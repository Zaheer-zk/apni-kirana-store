'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, TileLayer, Circle, useMap, useMapEvents } from 'react-leaflet';
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
  radiusKm: number;
  onChange: (next: { lat: number; lng: number }) => void;
  height?: number;
}

function ClickToMove({ onChange }: { onChange: (p: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click(e) {
      onChange({ lat: e.latlng.lat, lng: e.latlng.lng });
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

export default function ZoneMapPicker({ lat, lng, radiusKm, onChange, height = 320 }: Props) {
  // Sanitize inputs — Leaflet rejects NaN
  const safeLat = Number.isFinite(lat) ? lat : 28.6315;
  const safeLng = Number.isFinite(lng) ? lng : 77.2167;
  const safeRadiusM = Math.max(50, (Number.isFinite(radiusKm) ? radiusKm : 5) * 1000);

  const center = useMemo<[number, number]>(() => [safeLat, safeLng], [safeLat, safeLng]);

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-gray-200"
      style={{ height }}
    >
      <MapContainer
        center={center}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <ClickToMove onChange={onChange} />
        <FitToMarker lat={safeLat} lng={safeLng} />
        <Marker
          position={center}
          draggable
          icon={DEFAULT_ICON}
          eventHandlers={{
            dragend: (e) => {
              const m = e.target as L.Marker;
              const p = m.getLatLng();
              onChange({ lat: p.lat, lng: p.lng });
            },
          }}
        />
        <Circle
          center={center}
          radius={safeRadiusM}
          pathOptions={{ color: '#16A34A', fillColor: '#16A34A', fillOpacity: 0.12, weight: 2 }}
        />
      </MapContainer>
      <div className="pointer-events-none absolute bottom-2 left-2 z-[1000] rounded-md bg-white/95 px-2 py-1 text-xs font-mono text-gray-700 shadow">
        {safeLat.toFixed(5)}, {safeLng.toFixed(5)} · radius {(safeRadiusM / 1000).toFixed(1)} km
      </div>
    </div>
  );
}
