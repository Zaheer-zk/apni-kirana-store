import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Header } from '@/components/Header';
import { Input } from '@/components/Input';
import { apiClient } from '@/lib/api';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';
import type { Address } from '@aks/shared';

async function fetchAddresses(): Promise<Address[]> {
  const res = await apiClient.get('/api/v1/addresses');
  const data = res.data;
  if (Array.isArray(data)) return data as Address[];
  if (data && typeof data === 'object') {
    const o = data as { data?: unknown };
    if (Array.isArray(o.data)) return o.data as Address[];
  }
  return [];
}

export default function EditAddressScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();

  const addressesQuery = useQuery({
    queryKey: ['addresses'],
    queryFn: fetchAddresses,
  });

  const address = (addressesQuery.data ?? []).find((a) => a.id === id) ?? null;

  const [label, setLabel] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [region, setRegion] = useState<Region | null>(null);
  const [isDefault, setIsDefault] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mapRef = useRef<MapView>(null);
  const initializedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!address || initializedRef.current) return;
    initializedRef.current = true;
    setLabel(address.label);
    setStreet(address.street);
    setCity(address.city);
    setState(address.state);
    setPincode(address.pincode);
    setIsDefault(address.isDefault);
    setRegion({
      latitude: address.lat,
      longitude: address.lng,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
  }, [address]);

  function handleRegionChange(r: Region) {
    setRegion(r);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        setResolving(true);
        const results = await Location.reverseGeocodeAsync({
          latitude: r.latitude,
          longitude: r.longitude,
        });
        const parts = results[0];
        if (parts) {
          const streetParts = [parts.name, parts.street, parts.district].filter(Boolean);
          const newStreet =
            streetParts.join(', ') || parts.formattedAddress?.split(',')[0] || street;
          setStreet(newStreet.slice(0, 200));
          if (parts.city || parts.subregion) setCity(parts.city || parts.subregion || city);
          if (parts.region) setState(parts.region);
          if (parts.postalCode) {
            const pc = parts.postalCode.replace(/\D/g, '').slice(0, 6);
            if (pc.length === 6) setPincode(pc);
          }
        }
      } catch (err) {
        console.warn('[EditAddress] reverse geocode failed', err);
      } finally {
        setResolving(false);
      }
    }, 600);
  }

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!region) throw new Error('No location selected');
      if (!/^\d{6}$/.test(pincode)) throw new Error('Pincode must be 6 digits');
      await apiClient.put(`/api/v1/addresses/${id}`, {
        label: label.trim(),
        street: street.trim(),
        city: city.trim(),
        state: state.trim(),
        pincode,
        lat: region.latitude,
        lng: region.longitude,
        isDefault,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['addresses'] });
      qc.invalidateQueries({ queryKey: ['me'] });
      router.back();
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Failed to update address');
    },
  });

  if (addressesQuery.isLoading || !address || !region) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Header title="Edit address" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header title="Edit address" />
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
              onRegionChangeComplete={handleRegionChange}
            >
              <Marker coordinate={{ latitude: region.latitude, longitude: region.longitude }} />
            </MapView>
            {resolving ? (
              <View style={styles.resolving}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.resolvingText}>Updating address…</Text>
              </View>
            ) : null}
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
              label="Street / building"
              value={street}
              onChangeText={setStreet}
              placeholder="Flat, building, street"
              maxLength={200}
              multiline
            />
            <View style={{ height: spacing.md }} />
            <Input
              label="City"
              value={city}
              onChangeText={setCity}
              maxLength={100}
            />
            <View style={{ height: spacing.md }} />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Input
                  label="State"
                  value={state}
                  onChangeText={setState}
                  maxLength={100}
                />
              </View>
              <View style={{ width: 120 }}>
                <Input
                  label="Pincode"
                  value={pincode}
                  onChangeText={(t) => setPincode(t.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                />
              </View>
            </View>

            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Make this my default address</Text>
                <Text style={styles.toggleHint}>Used by default at checkout</Text>
              </View>
              <Switch
                value={isDefault}
                onValueChange={setIsDefault}
                trackColor={{ false: colors.gray300, true: colors.primary }}
                thumbColor={colors.white}
              />
            </View>
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
            title="Save changes"
            onPress={() => {
              setError(null);
              updateMutation.mutate();
            }}
            loading={updateMutation.isPending}
            fullWidth
            size="lg"
            icon="checkmark"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const MAP_HEIGHT = 280;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingBottom: spacing.xxxl,
  },
  mapWrap: {
    height: MAP_HEIGHT,
    backgroundColor: colors.gray100,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  resolving: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resolvingText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  formCard: {
    margin: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.small,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.md,
  },
  toggleLabel: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  toggleHint: {
    marginTop: 2,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  errorBox: {
    marginHorizontal: spacing.lg,
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
