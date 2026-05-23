// Map.tsx — native (iOS / Android) implementation backed by react-native-maps.
// The web target is served by Map.web.tsx (Leaflet) via Metro's platform-suffix
// resolution. Both files MUST export the same component + props so callers stay
// platform-agnostic. Whenever you add a prop here, add it to Map.web.tsx too.

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';

export interface MapMarker {
  /** Stable id — used as React key */
  id: string;
  lat: number;
  lng: number;
  /** Hover/tap title */
  title?: string;
  /** Logical role — translated to a colored pin on native, custom div on web */
  kind?: 'customer' | 'store' | 'driver' | 'pin';
}

export interface MapHandle {
  /**
   * Smoothly animate the visible area to the requested region.
   * Both platforms honour the same "lower latitudeDelta == higher zoom" idea;
   * on web we map it onto a Leaflet zoom level.
   */
  animateToRegion: (region: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  }) => void;
}

export interface MapProps {
  /** Initial centre + zoom; uncontrolled. Use ref.animateToRegion to recenter. */
  initialRegion: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  /** Fires when the user finishes panning/zooming (debounced by the platform). */
  onRegionChangeComplete?: (region: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  }) => void;
  /** Static markers. Leave empty for a centre-pin / picker style screen. */
  markers?: MapMarker[];
  /** Disable all user interaction (used for read-only minimaps). */
  interactive?: boolean;
  /** Show the platform "blue dot" for the user's current location. */
  showsUserLocation?: boolean;
  /** Style applied to the map container. */
  style?: ViewStyle;
}

const PIN_COLORS: Record<NonNullable<MapMarker['kind']>, string> = {
  customer: '#16A34A',
  store: '#F59E0B',
  driver: '#2563EB',
  pin: '#EF4444',
};

export const Map = forwardRef<MapHandle, MapProps>(function Map(
  {
    initialRegion,
    onRegionChangeComplete,
    markers,
    interactive = true,
    showsUserLocation,
    style,
  },
  ref,
) {
  const mapRef = useRef<MapView>(null);

  useImperativeHandle(
    ref,
    () => ({
      animateToRegion(region) {
        mapRef.current?.animateToRegion(region as Region, 400);
      },
    }),
    [],
  );

  return (
    <View style={[styles.wrap, style]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion as Region}
        onRegionChangeComplete={(r) =>
          onRegionChangeComplete?.({
            latitude: r.latitude,
            longitude: r.longitude,
            latitudeDelta: r.latitudeDelta,
            longitudeDelta: r.longitudeDelta,
          })
        }
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        pitchEnabled={interactive}
        rotateEnabled={interactive}
        showsUserLocation={showsUserLocation}
        showsMyLocationButton={false}
      >
        {(markers ?? []).map((m) => (
          <Marker
            key={m.id}
            coordinate={{ latitude: m.lat, longitude: m.lng }}
            title={m.title}
            pinColor={PIN_COLORS[m.kind ?? 'pin']}
          />
        ))}
      </MapView>
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
