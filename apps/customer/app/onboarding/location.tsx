import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { apiClient } from '@/lib/api';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';

interface ReverseGeocodeResult {
  street: string;
  city: string;
  state: string;
  pincode: string;
}

function formatGeocode(parts: Location.LocationGeocodedAddress | undefined): ReverseGeocodeResult {
  if (!parts) {
    return { street: 'Unknown street', city: 'Unknown', state: 'Unknown', pincode: '000000' };
  }
  const streetParts = [parts.name, parts.street, parts.district].filter(Boolean);
  const street = streetParts.join(', ') || parts.formattedAddress?.split(',')[0] || 'Unknown street';
  return {
    street: street.slice(0, 200),
    city: parts.city || parts.subregion || 'Unknown',
    state: parts.region || 'Unknown',
    pincode: (parts.postalCode || '000000').replace(/\D/g, '').padEnd(6, '0').slice(0, 6),
  };
}

export default function OnboardingLocation() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUseCurrentLocation() {
    setError(null);
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission denied. Please pick on map instead.');
        setLoading(false);
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = position.coords;

      const reverse = await Location.reverseGeocodeAsync({ latitude, longitude });
      const formatted = formatGeocode(reverse[0]);

      await apiClient.post('/api/v1/addresses', {
        label: 'Home',
        street: formatted.street,
        city: formatted.city,
        state: formatted.state,
        pincode: formatted.pincode,
        lat: latitude,
        lng: longitude,
        isDefault: true,
      });

      router.replace('/(tabs)/home');
    } catch (err) {
      console.error('[Onboarding] use current location error:', err);
      setError('Could not detect your location. Try picking on a map.');
    } finally {
      setLoading(false);
    }
  }

  function handlePickOnMap() {
    router.push('/onboarding/map-picker');
  }

  function handleSkip() {
    router.replace('/(tabs)/home');
  }

  return (
    // Modal-style screen with no native header — apply all four edges so content stays inside the safe area on Android too
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.illustrationWrap}>
          <View style={styles.iconCircle}>
            <Ionicons name="location" size={80} color={colors.primary} />
          </View>
          <View style={styles.dotRing} />
        </View>

        <Text style={styles.title}>Where should we deliver?</Text>
        <Text style={styles.subtitle}>
          We need your location to show stores near you
        </Text>

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button
            title="Use my current location"
            icon="navigate"
            onPress={handleUseCurrentLocation}
            loading={loading}
            fullWidth
            size="lg"
          />
          <Button
            title="Pin location on map"
            icon="map"
            variant="outline"
            onPress={handlePickOnMap}
            disabled={loading}
            fullWidth
            size="lg"
          />
        </View>

        {loading ? (
          <View style={styles.loadingHint}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>Detecting your location…</Text>
          </View>
        ) : null}
      </View>

      <TouchableOpacity
        style={styles.skipBtn}
        activeOpacity={0.7}
        onPress={handleSkip}
        disabled={loading}
      >
        <Text style={styles.skipText}>Skip for now</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxxl,
    alignItems: 'center',
  },
  illustrationWrap: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxl,
  },
  iconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.medium,
  },
  dotRing: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: colors.primary,
    opacity: 0.15,
    borderStyle: 'dashed',
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    lineHeight: 20,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorLight,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.xl,
    width: '100%',
  },
  errorText: {
    flex: 1,
    color: colors.error,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  actions: {
    width: '100%',
    marginTop: spacing.xxxl,
    gap: spacing.md,
  },
  loadingHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  loadingText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  skipBtn: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  skipText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
  },
});
