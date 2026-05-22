import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import MapView, { Region } from 'react-native-maps';
import { api } from '@/lib/api';
import { useStorePortalStore } from '@/store/store.store';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

// Delhi fallback — used only when the store has no coordinates and GPS fails.
const DEFAULT_REGION: Region = {
  latitude: 28.6315,
  longitude: 77.2167,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
};

// Pull street/city/state/pincode out of a reverse-geocode result.
function geocodeAddress(parts: Location.LocationGeocodedAddress | undefined) {
  if (!parts) return { street: '', city: '', state: '', pincode: '' };
  const streetParts = [parts.name, parts.street, parts.district].filter(Boolean);
  const street =
    streetParts.join(', ') || parts.formattedAddress?.split(',')[0] || '';
  return {
    street: street.slice(0, 200),
    city: parts.city || parts.subregion || '',
    state: parts.region || '',
    pincode: (parts.postalCode || '').replace(/\D/g, '').slice(0, 6),
  };
}

export default function EditStoreProfileScreen() {
  const { storeProfile, setStoreProfile } = useStorePortalStore();
  // Use real header height instead of hardcoded 100 — Android's bar height differs from iOS
  const headerHeight = useHeaderHeight();

  // Self-heal: if the in-memory profile is missing (fresh login / cleared
  // SecureStore) fetch it from the backend so we always have a store id to
  // save against — otherwise the update mutation throws "Store id missing".
  useQuery({
    queryKey: ['storeProfile'],
    enabled: !storeProfile?.id,
    queryFn: async () => {
      const res = await api.get<{ data?: unknown } | unknown>('/api/v1/stores/me');
      const store = (res.data as { data?: unknown }).data ?? res.data;
      if (store) setStoreProfile(store as never);
      return store;
    },
  });

  const addr = (storeProfile as any)?.address;
  const initialAddress =
    typeof addr === 'object' && addr !== null
      ? addr
      : { street: '', city: '', state: '', pincode: '' };

  const [name, setName] = useState<string>(storeProfile?.name ?? '');
  const [description, setDescription] = useState<string>(
    (storeProfile as any)?.description ?? ''
  );
  const [street, setStreet] = useState<string>(initialAddress.street ?? '');
  const [city, setCity] = useState<string>(initialAddress.city ?? '');
  const [stateName, setStateName] = useState<string>(initialAddress.state ?? '');
  const [pincode, setPincode] = useState<string>(initialAddress.pincode ?? '');

  // Map picker — the pinned centre of the map IS the store's lat/lng.
  const initialLat = (storeProfile as any)?.lat;
  const initialLng = (storeProfile as any)?.lng;
  const hasInitialCoords =
    typeof initialLat === 'number' && typeof initialLng === 'number';
  const [region, setRegion] = useState<Region>(
    hasInitialCoords
      ? {
          latitude: initialLat,
          longitude: initialLng,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }
      : DEFAULT_REGION
  );
  // Whether the store has a real (non-fallback) location pinned.
  const [hasLocation, setHasLocation] = useState<boolean>(hasInitialCoords);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);
  const mapRef = useRef<MapView>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Skip the very first reverse-geocode pass so we don't clobber the saved
  // address with whatever the existing coordinates resolve to.
  const skipNextGeocode = useRef<boolean>(hasInitialCoords);

  const [errors, setErrors] = useState<{
    name?: string;
    pincode?: string;
    location?: string;
  }>({});

  // If the store has no coordinates yet, seed the map from device GPS once.
  useEffect(() => {
    if (hasInitialCoords) return;
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        const next: Region = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        };
        setRegion(next);
        setHasLocation(true);
        mapRef.current?.animateToRegion(next, 400);
      } catch {
        // ignore — fall back to the default Delhi region
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reverse-geocode the pinned centre after the user stops moving the map and
  // keep the address fields in sync. The first pass (existing coords) is
  // skipped so we don't overwrite the saved address on mount.
  useEffect(() => {
    if (skipNextGeocode.current) {
      skipNextGeocode.current = false;
      return undefined;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        setResolving(true);
        const results = await Location.reverseGeocodeAsync({
          latitude: region.latitude,
          longitude: region.longitude,
        });
        const resolved = geocodeAddress(results[0]);
        // Auto-fill but keep fields editable — only overwrite when resolved.
        if (resolved.street) setStreet(resolved.street);
        if (resolved.city) setCity(resolved.city);
        if (resolved.state) setStateName(resolved.state);
        if (resolved.pincode) {
          setPincode(resolved.pincode);
          setErrors((e) => ({ ...e, pincode: undefined }));
        }
      } catch (err) {
        console.warn('[EditStore] reverse geocode failed', err);
      } finally {
        setResolving(false);
      }
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region.latitude, region.longitude]);

  const validate = (): boolean => {
    const next: { name?: string; pincode?: string; location?: string } = {};
    if (!name.trim()) next.name = 'Store name is required';
    // Backend's z.string().regex(/^\d{6}$/) rejects empty strings AND non-6-digit
    // values. Surface a clear message rather than letting backend 400 us.
    if (!/^\d{6}$/.test(pincode.trim())) {
      next.pincode = 'Pincode must be exactly 6 digits';
    }
    // Coordinates are required for the dispatch engine to find this store.
    if (!hasLocation) {
      next.location = 'Pan the map onto your store, or tap "Use current location"';
    } else if (
      region.latitude < 6 ||
      region.latitude > 38 ||
      region.longitude < 68 ||
      region.longitude > 98
    ) {
      next.location = 'Map pin looks invalid (must be inside India)';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  async function captureCurrentLocation() {
    setLocating(true);
    setErrors((e) => ({ ...e, location: undefined }));
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Location permission denied',
          'Allow location access in settings, or pan the map onto your store manually.',
        );
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const next: Region = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      setRegion(next);
      setHasLocation(true);
      mapRef.current?.animateToRegion(next, 400);
    } catch (err) {
      Alert.alert('Could not get location', (err as Error).message);
    } finally {
      setLocating(false);
    }
  }

  const updateMutation = useMutation({
    mutationFn: async () => {
      const id = storeProfile?.id;
      if (!id) throw new Error('Store id missing');
      const body: Record<string, any> = {
        name: name.trim(),
        description: description.trim(),
        street: street.trim(),
        city: city.trim(),
        state: stateName.trim(),
        pincode: pincode.trim(),
        lat: region.latitude,
        lng: region.longitude,
      };
      const res = await api.put(`/api/v1/stores/${id}`, body);
      return res.data;
    },
    onSuccess: (data) => {
      const next = {
        ...(storeProfile as any),
        ...(data ?? {}),
        name: name.trim(),
        description: description.trim(),
        lat: region.latitude,
        lng: region.longitude,
        address: {
          ...(typeof (storeProfile as any)?.address === 'object'
            ? (storeProfile as any).address
            : {}),
          street: street.trim(),
          city: city.trim(),
          state: stateName.trim(),
          pincode: pincode.trim(),
        },
      };
      setStoreProfile(next);
      Alert.alert('Saved', 'Store profile updated');
      router.back();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const onSave = () => {
    if (!validate()) return;
    updateMutation.mutate();
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: headerHeight + spacing.md }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Store details</Text>
        <View style={styles.formGroup}>
          <Input
            label="Store name *"
            value={name}
            onChangeText={(v) => {
              setName(v);
              if (errors.name) setErrors({ ...errors, name: undefined });
            }}
            placeholder="e.g. Sharma General Store"
            error={errors.name}
            leftIcon="storefront-outline"
          />
          <Input
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Tell customers about your store"
            multiline
            numberOfLines={4}
          />
        </View>

        <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>
          Store location *
        </Text>
        <Text style={styles.locationHelp}>
          Pan the map so the pin sits exactly on your store. Customers within
          ~5 km of this pin will see you. We&apos;ll auto-fill the address below.
        </Text>
        <View style={styles.mapWrap}>
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={region}
            onRegionChangeComplete={(r) => {
              setRegion(r);
              setHasLocation(true);
              if (errors.location) setErrors((e) => ({ ...e, location: undefined }));
            }}
            showsUserLocation
            showsMyLocationButton={false}
          />
          <View pointerEvents="none" style={styles.crosshair}>
            <Text style={styles.pinEmoji}>📍</Text>
          </View>
          <TouchableOpacity
            style={styles.recenterBtn}
            activeOpacity={0.8}
            onPress={captureCurrentLocation}
            disabled={locating}
          >
            {locating ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={styles.recenterText}>◎</Text>
            )}
          </TouchableOpacity>
        </View>
        <View style={styles.coordsRow}>
          <Text style={styles.coords}>
            {region.latitude.toFixed(5)}, {region.longitude.toFixed(5)}
          </Text>
          {resolving ? <ActivityIndicator size="small" color={colors.primary} /> : null}
        </View>
        <View style={styles.formGroup}>
          <Button
            title={locating ? 'Getting location…' : 'Use current location'}
            icon="locate-outline"
            onPress={captureCurrentLocation}
            loading={locating}
            disabled={locating}
            variant="outline"
            fullWidth
          />
          {errors.location ? (
            <Text style={styles.locationError}>{errors.location}</Text>
          ) : hasLocation ? (
            <Text style={styles.locationOk}>
              ✓ Pinned at {region.latitude.toFixed(4)}, {region.longitude.toFixed(4)}
            </Text>
          ) : null}
        </View>

        <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Address</Text>
        <View style={styles.formGroup}>
          <Input
            label="Street"
            value={street}
            onChangeText={setStreet}
            placeholder="House no., street, area"
            leftIcon="home-outline"
          />
          <Input
            label="City"
            value={city}
            onChangeText={setCity}
            placeholder="City"
          />
          <Input
            label="State"
            value={stateName}
            onChangeText={setStateName}
            placeholder="State"
          />
          <Input
            label="Pincode"
            value={pincode}
            onChangeText={(v) => {
              setPincode(v);
              if (errors.pincode) setErrors({ ...errors, pincode: undefined });
            }}
            placeholder="6-digit pincode"
            keyboardType="number-pad"
            maxLength={6}
            error={errors.pincode}
            leftIcon="map-outline"
          />
        </View>

        <Button
          title="Save changes"
          icon="save-outline"
          onPress={onSave}
          loading={updateMutation.isPending}
          disabled={updateMutation.isPending}
          fullWidth
          size="lg"
          style={{ marginTop: spacing.lg }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const MAP_HEIGHT = 280;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  // paddingTop is set dynamically (header height + spacing); was hardcoded 100 which double-stacks on Android
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.md,
  },
  formGroup: {
    gap: spacing.lg,
  },
  locationHelp: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  mapWrap: {
    height: MAP_HEIGHT,
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: colors.gray100,
    marginBottom: spacing.sm,
  },
  map: { ...StyleSheet.absoluteFillObject },
  crosshair: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinEmoji: {
    fontSize: 44,
    // Offset so the tip of the pin sits on the centre of the map
    transform: [{ translateY: -16 }],
  },
  recenterBtn: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  recenterText: { fontSize: 22, color: colors.primary, fontWeight: '700' },
  coordsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  coords: { fontSize: fontSize.xs, color: colors.textSecondary },
  locationError: {
    fontSize: fontSize.sm,
    color: colors.error,
    fontWeight: '600',
  },
  locationOk: {
    fontSize: fontSize.sm,
    color: colors.success,
    fontWeight: '600',
  },
});
