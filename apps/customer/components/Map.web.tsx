// Map.web.tsx — web implementation backed by Leaflet via react-leaflet.
// Metro picks this file over Map.tsx when bundling for the web platform.
//
// Mirrors apps/admin/components/LocationMap.tsx but exposes the same API as
// Map.tsx so RN callers can stay platform-agnostic. Whenever you add a prop
// to Map.tsx, mirror it here.

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapHandle, MapProps } from './Map';

// Leaflet's default marker icons rely on bundler asset URLs that Metro doesn't
// resolve out of the box — point them at the CDN so pins actually render.
const DEFAULT_ICON_URLS = {
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
} as const;

const PIN_COLORS = {
  customer: '#16A34A',
  store: '#F59E0B',
  driver: '#2563EB',
  pin: '#EF4444',
} as const;

function colorIcon(kind: keyof typeof PIN_COLORS): L.DivIcon {
  const color = PIN_COLORS[kind];
  return L.divIcon({
    className: 'aks-map-pin',
    html: `<div style="
      width: 22px; height: 22px;
      border-radius: 50%;
      background: ${color};
      border: 3px solid #fff;
      box-shadow: 0 1px 4px rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function defaultIcon(): L.Icon {
  return L.icon({
    ...DEFAULT_ICON_URLS,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });
}

// latitudeDelta -> Leaflet zoom approximation. 0.04 ≈ 14, 0.01 ≈ 16, 0.002 ≈ 18.
function deltaToZoom(latDelta: number): number {
  if (!Number.isFinite(latDelta) || latDelta <= 0) return 14;
  // Empirically: zoom = log2(360 / latDelta).  Clamp to a sane range.
  const z = Math.log2(360 / latDelta);
  return Math.max(3, Math.min(19, Math.round(z)));
}

function zoomToDelta(zoom: number): number {
  return 360 / Math.pow(2, zoom);
}

/** Bridges imperative animateToRegion calls into Leaflet's flyTo. */
function MapBridge({
  onMapReady,
  onRegionChangeComplete,
}: {
  onMapReady: (m: L.Map) => void;
  onRegionChangeComplete?: MapProps['onRegionChangeComplete'];
}) {
  const map = useMap();

  useEffect(() => {
    onMapReady(map);
    if (!onRegionChangeComplete) return;
    const handler = () => {
      const c = map.getCenter();
      const zoom = map.getZoom();
      const delta = zoomToDelta(zoom);
      onRegionChangeComplete({
        latitude: c.lat,
        longitude: c.lng,
        latitudeDelta: delta,
        longitudeDelta: delta,
      });
    };
    map.on('moveend', handler);
    map.on('zoomend', handler);
    return () => {
      map.off('moveend', handler);
      map.off('zoomend', handler);
    };
  }, [map, onMapReady, onRegionChangeComplete]);

  return null;
}

export const Map = forwardRef<MapHandle, MapProps>(function MapWeb(
  { initialRegion, onRegionChangeComplete, markers, interactive = true, style },
  ref,
) {
  const mapInstanceRef = useRef<L.Map | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      animateToRegion(region) {
        const map = mapInstanceRef.current;
        if (!map) return;
        map.flyTo([region.latitude, region.longitude], deltaToZoom(region.latitudeDelta), {
          duration: 0.4,
        });
      },
    }),
    [],
  );

  const center = useMemo<[number, number]>(
    () => [initialRegion.latitude, initialRegion.longitude],
    // We only honour the initial region (uncontrolled), mirroring native MapView.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const zoom = useMemo(
    () => deltaToZoom(initialRegion.latitudeDelta),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const defaultPin = useMemo(defaultIcon, []);

  return (
    <View style={[styles.wrap, style]}>
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={interactive}
        dragging={interactive}
        doubleClickZoom={interactive}
        zoomControl={interactive}
        touchZoom={interactive}
        keyboard={interactive}
        boxZoom={interactive}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <MapBridge
          onMapReady={(m) => {
            mapInstanceRef.current = m;
          }}
          onRegionChangeComplete={onRegionChangeComplete}
        />
        {(markers ?? []).map((m) => (
          <Marker
            key={m.id}
            position={[m.lat, m.lng]}
            icon={m.kind ? colorIcon(m.kind) : defaultPin}
            title={m.title}
          />
        ))}
      </MapContainer>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
});

export default Map;
