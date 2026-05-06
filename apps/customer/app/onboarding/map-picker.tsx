import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Header } from '@/components/Header';
import { Input } from '@/components/Input';
import { apiClient } from '@/lib/api';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';

const DEFAULT_REGION: Region = {
  latitude: 28.6315,
  longitude: 77.2167,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
};

interface ResolvedAddress {
  street: string;
  city: string;
  state: string;
  pincode: string;
}

function geocodeToAddress(parts: Location.LocationGeocodedAddress | undefined): ResolvedAddress {
  if (!parts) {
    return { street: '', city: '', state: '', pincode: '' };
  }
  const streetParts = [parts.name, parts.street, parts.district].filter(Boolean);
  const street = streetParts.join(', ') || parts.formattedAddress?.split(',')[0] || '';
  return {
    street: street.slice(0, 200),
    city: parts.city || parts.subregion || '',
    state: parts.region || '',
    pincode: (parts.postalCode || '').replace(/\D/g, '').slice(0, 6),
  };
}

export default function MapPickerScreen() {
  const params = useLocalSearchParams<{ onboarding?: string; lat?: string; lng?: string }>();
  const isOnboarding = params.onboarding === '1';

  const initialLat = params.lat ? parseFloat(params.lat) : null;
  const initialLng = params.lng ? parseFloat(params.lng) : null;

  const [region, setRegion] = useState<Region>(() => {
    if (initialLat != null && initialLng != null && !isNaN(initialLat) && !isNaN(initialLng)) {
      return {
        latitude: initialLat,
        longitude: initialLng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
    }
    return DEFAULT_REGION;
  });
  const [resolved, setResolved] = useState<ResolvedAddress>({
    street: '',
    city: '',
    state: '',
    pincode: '',
  });
  const [resolving, setResolving] = useState(false);
  const [label, setLabel] = useState('Home');
  const [extra, setExtra] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mapRef = useRef<MapView>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Try to grab GPS location once on mount (unless caller passed coordinates)
  useEffect(() => {
    if (initialLat != null && initialLng != null) return;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
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
        mapRef.current?.animateToRegion(next, 400);
      } catch {
        // ignore — fall back to default region
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reverse-geocode the centre after the user stops moving the map
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        setResolving(true);
        const results = await Location.reverseGeocodeAsync({
          latitude: region.latitude,
          longitude: region.longitude,
        });
        setResolved(geocodeToAddress(results[0]));
      } catch (err) {
        console.warn('[MapPicker] reverse geocode failed', err);
      } finally {
        setResolving(false);
      }
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [region.latitude, region.longitude]);

  async function handleRecenter() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission denied');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const next: Region = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      setRegion(next);
      mapRef.current?.animateToRegion(next, 400);
    } catch {
      setError('Could not fetch your current location');
    }
  }

  async function handleConfirm() {
    setError(null);

    const street = (extra ? `${extra}, ` : '') + (resolved.street || 'Pinned location');
    const city = resolved.city || 'Unknown';
    const state = resolved.state || 'Unknown';
    const pincode = resolved.pincode && /^\d{6}$/.test(resolved.pincode)
      ? resolved.pincode
      : '000000';

    if (!label.trim()) {
      setError('Please add a label (e.g., Home, Work)');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post('/api/v1/addresses', {
        label: label.trim(),
        street: street.slice(0, 200),
        city: city.slice(0, 100),
        state: state.slice(0, 100),
        pincode,
        lat: region.latitude,
        lng: region.longitude,
        isDefault: isOnboarding,
      });

      if (isOnboarding) {
        router.replace('/(tabs)/home');
      } else if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/account/addresses');
      }
    } catch (err) {
      console.error('[MapPicker] save error:', err);
      setError('Failed to save address. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header title="Set delivery location" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={20}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.mapWrap}>
            <MapView
              ref={mapRef}
              style={styles.map}
              initialRegion={region}
              onRegionChangeComplete={(r) => setRegion(r)}
              showsUserLocation
              showsMyLocationButton={false}
            />
            <View pointerEvents="none" style={styles.crosshair}>
              <Text style={styles.pinEmoji}>📍</Text>
            </View>
            <TouchableOpacity
              style={styles.recenterBtn}
              activeOpacity={0.8}
              onPress={handleRecenter}
            >
              <Ionicons name="locate" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.addressCard}>
            <View style={styles.addressHead}>
              <Ionicons name="location" size={18} color={colors.primary} />
              <Text style={styles.addressTitle}>Delivery to</Text>
              {resolving ? <ActivityIndicator size="small" color={colors.primary} /> : null}
            </View>
            <Text style={styles.addressStreet} numberOfLines={2}>
              {resolved.street || 'Move map to pick a location'}
            </Text>
            {resolved.city || resolved.state || resolved.pincode ? (
              <Text style={styles.addressMeta}>
                {[resolved.city, resolved.state, resolved.pincode].filter(Boolean).join(', ')}
              </Text>
            ) : null}
            <Text style={styles.coords}>
              {region.latitude.toFixed(5)}, {region.longitude.toFixed(5)}
            </Text>
          </View>

          <View style={styles.formCard}>
            <Input
              label="Label"
              value={label}
              onChangeText={setLabel}
              placeholder="Home, Work, Other"
              maxLength={50}
            />
            <View style={{ height: spacing.md }} />
            <Input
              label="Flat / building / landmark"
              value={extra}
              onChangeText={setExtra}
              placeholder="e.g., Flat 4B, Sun Apartments"
              maxLength={120}
            />
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={{ height: spacing.xxl }} />
        </ScrollView>

        <View style={styles.bottomBar}>
          <Button
            title="Confirm location"
            onPress={handleConfirm}
            loading={submitting}
            fullWidth
            size="lg"
            icon="checkmark-circle"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const MAP_HEIGHT = 360;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    paddingBottom: spacing.xxxl,
  },
  mapWrap: {
    height: MAP_HEIGHT,
    position: 'relative',
    backgroundColor: colors.gray100,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
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
    right: spacing.lg,
    bottom: spacing.lg,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.medium,
  },
  addressCard: {
    margin: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
    ...shadow.small,
  },
  addressHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  addressTitle: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  addressStreet: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 22,
  },
  addressMeta: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  coords: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  formCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.small,
  },
  errorBox: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorLight,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  errorText: {
    flex: 1,
    color: colors.error,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  bottomBar: {
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
