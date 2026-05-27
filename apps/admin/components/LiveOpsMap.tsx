'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Link from 'next/link';

// Map of every active order + every online driver. Markers are styled per
// entity type so admin can spot at a glance: orange = PENDING (needs
// attention), blue = accepted, violet = driver assigned, green = picked up,
// blue dot = online driver, gray dot = offline driver with recent location.

type LiveOrder = {
  id: string;
  status: 'PENDING' | 'STORE_ACCEPTED' | 'DRIVER_ASSIGNED' | 'PICKED_UP';
  store: { id: string; name: string; lat: number; lng: number };
  driver: { id: string; currentLat: number | null; currentLng: number | null; user: { name: string | null } } | null;
  deliveryAddress: { lat: number; lng: number; street: string; city: string };
  customer: { name: string | null };
  total: number;
};

type LiveDriver = {
  id: string;
  status: 'ONLINE' | 'OFFLINE';
  currentLat: number;
  currentLng: number;
  user: { id: string; name: string | null; phone: string | null };
};

interface ZoneCircle {
  id: string;
  name: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
}

interface Props {
  orders: LiveOrder[];
  drivers: LiveDriver[];
  /** When non-null, draws a translucent radius circle and recenters on it. */
  zone?: ZoneCircle | null;
}

const STATUS_COLOR: Record<LiveOrder['status'], string> = {
  PENDING: '#f59e0b',
  STORE_ACCEPTED: '#3b82f6',
  DRIVER_ASSIGNED: '#8b5cf6',
  PICKED_UP: '#10b981',
};

function pinIcon(color: string, label: string): L.DivIcon {
  return L.divIcon({
    className: 'live-ops-pin',
    html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};box-shadow:0 1px 3px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);color:white;font-size:11px;font-weight:bold">${label}</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
}

function driverIcon(online: boolean): L.DivIcon {
  const color = online ? '#10b981' : '#9ca3af';
  return L.divIcon({
    className: 'live-ops-driver',
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 0 0 1px ${color}, 0 1px 3px rgba(0,0,0,.4)${online ? ';animation:pulse 1.6s infinite' : ''}"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

// Auto-fit to all markers on data change.
function FitToMarkers({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  const prevSig = useRef('');
  useEffect(() => {
    if (points.length === 0) return;
    // Don't re-fit if the marker set hasn't materially changed (avoids the
    // map flying around every 5s on every poll).
    const sig = points
      .map(([a, b]) => `${a.toFixed(3)},${b.toFixed(3)}`)
      .sort()
      .join('|');
    if (sig === prevSig.current) return;
    prevSig.current = sig;
    const bounds = L.latLngBounds(points.map(([a, b]) => [a, b]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [points, map]);
  return null;
}

export default function LiveOpsMap({ orders, drivers, zone }: Props) {
  // Collect every coord we know about, so the map can fit them all on first render.
  const allPoints = useMemo<Array<[number, number]>>(() => {
    const pts: Array<[number, number]> = [];
    // If a zone is scoped, anchor the fit on its center too so even when
    // no entities are in the zone yet, the map still snaps to the area.
    if (zone) pts.push([zone.centerLat, zone.centerLng]);
    for (const o of orders) {
      if (Number.isFinite(o.store.lat) && Number.isFinite(o.store.lng)) {
        pts.push([o.store.lat, o.store.lng]);
      }
      if (Number.isFinite(o.deliveryAddress.lat) && Number.isFinite(o.deliveryAddress.lng)) {
        pts.push([o.deliveryAddress.lat, o.deliveryAddress.lng]);
      }
      if (o.driver?.currentLat && o.driver?.currentLng) {
        pts.push([o.driver.currentLat, o.driver.currentLng]);
      }
    }
    for (const d of drivers) {
      pts.push([d.currentLat, d.currentLng]);
    }
    return pts;
  }, [orders, drivers, zone]);

  // If a zone is selected, default the center to it; otherwise central Delhi.
  const center: [number, number] = zone
    ? [zone.centerLat, zone.centerLng]
    : (allPoints[0] ?? [28.6139, 77.209]);

  return (
    <MapContainer center={center} zoom={12} className="h-full w-full" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitToMarkers points={allPoints} />

      {/* Zone radius — visual context for what's being filtered */}
      {zone ? (
        <Circle
          center={[zone.centerLat, zone.centerLng]}
          radius={zone.radiusKm * 1000}
          pathOptions={{
            color: '#16A34A',
            weight: 2,
            fillColor: '#16A34A',
            fillOpacity: 0.06,
            dashArray: '6 6',
          }}
        >
          <Popup>
            <div className="text-xs">
              <p className="font-semibold">{zone.name}</p>
              <p className="text-gray-500">Radius {zone.radiusKm} km</p>
            </div>
          </Popup>
        </Circle>
      ) : null}

      {/* Store pin per active order (deduplicated by store id below in the legend) */}
      {orders.map((o) => (
        <Marker
          key={`store-${o.id}`}
          position={[o.store.lat, o.store.lng]}
          icon={pinIcon(STATUS_COLOR[o.status], 'S')}
        >
          <Popup>
            <div className="text-xs">
              <p className="font-semibold">{o.store.name}</p>
              <p className="text-gray-500">Order #{o.id.slice(-6)} · {o.status}</p>
              <Link href={`/orders/${o.id}`} className="mt-1 inline-block font-semibold text-primary">
                Open order →
              </Link>
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Drop-off pin per active order */}
      {orders.map((o) => (
        <Marker
          key={`drop-${o.id}`}
          position={[o.deliveryAddress.lat, o.deliveryAddress.lng]}
          icon={pinIcon('#475569', 'D')}
        >
          <Popup>
            <div className="text-xs">
              <p className="font-semibold">{o.customer.name ?? 'Customer'}</p>
              <p className="text-gray-500">{o.deliveryAddress.street}, {o.deliveryAddress.city}</p>
              <p className="text-gray-500">₹{o.total.toFixed(0)} · {o.status}</p>
              <Link href={`/orders/${o.id}`} className="mt-1 inline-block font-semibold text-primary">
                Open order →
              </Link>
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Online/offline drivers */}
      {drivers.map((d) => (
        <Marker
          key={`driver-${d.id}`}
          position={[d.currentLat, d.currentLng]}
          icon={driverIcon(d.status === 'ONLINE')}
        >
          <Popup>
            <div className="text-xs">
              <p className="font-semibold">{d.user.name ?? 'Driver'}</p>
              <p className="text-gray-500">{d.status} · {d.user.phone}</p>
              <Link href={`/drivers`} className="mt-1 inline-block font-semibold text-primary">
                Drivers →
              </Link>
            </div>
          </Popup>
        </Marker>
      ))}

      <style jsx global>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.5); }
          70% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
          100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
      `}</style>
    </MapContainer>
  );
}
