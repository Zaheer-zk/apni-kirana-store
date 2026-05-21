import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import MapView, { Region } from 'react-native-maps';
import { useMutation } from '@tanstack/react-query';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { api } from '@/lib/api';
import type { StoreCategory, UserProfile } from '@aks/shared';

const CATEGORIES: { label: string; value: StoreCategory }[] = [
  { label: 'Grocery', value: 'GROCERY' },
  { label: 'Pharmacy', value: 'PHARMACY' },
  { label: 'General Store', value: 'GENERAL' },
  { label: 'Restaurant', value: 'RESTAURANT' },
];

// Delhi fallback — matching engine expects stores near seeded data
const DEFAULT_REGION: Region = {
  latitude: 28.6315,
  longitude: 77.2167,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
};

interface RegisterPayload {
  name: string;
  description: string;
  category: StoreCategory;
  lat: number;
  lng: number;
  street: string;
  city: string;
  state: string;
  pincode: string;
  openTime: string;
  closeTime: string;
}

interface RegisterResponse {
  message: string;
  storeId: string;
}

interface SendOtpResponse {
  message: string;
}

interface VerifyOtpResponse {
  accessToken: string;
  refreshToken?: string;
  user: UserProfile;
}

function geocodePincode(parts: Location.LocationGeocodedAddress | undefined) {
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

export default function StoreRegisterScreen() {
  // Step 1 — phone verification
  const [step, setStep] = useState<'phone' | 'otp' | 'form'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');

  // Step 2 — registration form
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<StoreCategory>('GROCERY');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [openTime, setOpenTime] = useState('09:00');
  const [closeTime, setCloseTime] = useState('21:00');
  const [submitted, setSubmitted] = useState(false);

  // Map picker
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [resolving, setResolving] = useState(false);
  const mapRef = useRef<MapView>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seed the map with the device GPS location once the form step opens
  useEffect(() => {
    if (step !== 'form') return;
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
        mapRef.current?.animateToRegion(next, 400);
      } catch {
        // ignore — fall back to default region
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step]);

  // Reverse-geocode the pinned centre after the user stops moving the map
  useEffect(() => {
    if (step !== 'form') return undefined;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        setResolving(true);
        const results = await Location.reverseGeocodeAsync({
          latitude: region.latitude,
          longitude: region.longitude,
        });
        const addr = geocodePincode(results[0]);
        // Auto-fill but keep fields editable — only overwrite when we resolved something
        if (addr.street) setStreet(addr.street);
        if (addr.city) setCity(addr.city);
        if (addr.state) setState(addr.state);
        if (addr.pincode) setPincode(addr.pincode);
      } catch (err) {
        console.warn('[StoreRegister] reverse geocode failed', err);
      } finally {
        setResolving(false);
      }
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region.latitude, region.longitude, step]);

  const sendOtpMutation = useMutation<SendOtpResponse, Error, string>({
    mutationFn: (phoneNumber) =>
      api
        .post<SendOtpResponse>('/api/v1/auth/send-otp', { phone: phoneNumber })
        .then((r) => r.data),
    onSuccess: () => setStep('otp'),
    onError: (err) => Alert.alert('Error', err.message || 'Failed to send OTP'),
  });

  // Verify OTP with NO role field — backend auto-creates a CUSTOMER account
  // and returns a token. The /stores/register call then promotes the role to
  // STORE_OWNER.
  const verifyOtpMutation = useMutation<
    VerifyOtpResponse,
    Error,
    { phone: string; otp: string }
  >({
    mutationFn: async (payload) => {
      const res = await api.post<{
        success: boolean;
        data: VerifyOtpResponse;
        error?: string;
      }>('/api/v1/auth/verify-otp', payload);
      const inner =
        (res.data as { data?: VerifyOtpResponse }).data ??
        (res.data as VerifyOtpResponse);
      if (!inner?.accessToken || !inner?.user) {
        throw new Error(res.data?.error ?? 'Invalid response from server');
      }
      return inner;
    },
    onSuccess: async (data) => {
      await SecureStore.setItemAsync(STORAGE_KEYS.accessToken, data.accessToken);
      if (data.refreshToken) {
        await SecureStore.setItemAsync(STORAGE_KEYS.refreshToken, data.refreshToken);
      }
      await SecureStore.setItemAsync(STORAGE_KEYS.user, JSON.stringify(data.user));
      setStep('form');
    },
    onError: (err) => Alert.alert('Error', err.message || 'Invalid OTP'),
  });

  const registerMutation = useMutation<RegisterResponse, Error, RegisterPayload>({
    mutationFn: (payload) =>
      api.post<RegisterResponse>('/api/v1/stores/register', payload).then((r) => r.data),
    onSuccess: () => setSubmitted(true),
    onError: (err) => Alert.alert('Registration Failed', err.message || 'Please try again'),
  });

  const handleSendOtp = () => {
    const trimmed = phone.trim();
    if (trimmed.length < 10) {
      Alert.alert('Validation', 'Enter a valid 10-digit phone number');
      return;
    }
    sendOtpMutation.mutate(trimmed);
  };

  const handleVerifyOtp = () => {
    if (otp.trim().length !== 6) {
      Alert.alert('Validation', 'Enter the 6-digit OTP');
      return;
    }
    verifyOtpMutation.mutate({ phone: phone.trim(), otp: otp.trim() });
  };

  async function handleRecenter() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location', 'Location permission denied');
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
      Alert.alert('Location', 'Could not fetch your current location');
    }
  }

  const handleSubmit = () => {
    if (name.trim().length < 2) return Alert.alert('Validation', 'Store name is required');
    if (street.trim().length < 2) return Alert.alert('Validation', 'Street address is required');
    if (city.trim().length < 2) return Alert.alert('Validation', 'City is required');
    if (state.trim().length < 2) return Alert.alert('Validation', 'State is required');
    if (!/^\d{6}$/.test(pincode.trim()))
      return Alert.alert('Validation', 'Enter a valid 6-digit pincode');
    if (!/^\d{2}:\d{2}$/.test(openTime.trim()))
      return Alert.alert('Validation', 'Opening time must be in HH:MM format');
    if (!/^\d{2}:\d{2}$/.test(closeTime.trim()))
      return Alert.alert('Validation', 'Closing time must be in HH:MM format');

    registerMutation.mutate({
      name: name.trim(),
      description: description.trim(),
      category,
      lat: region.latitude,
      lng: region.longitude,
      street: street.trim(),
      city: city.trim(),
      state: state.trim(),
      pincode: pincode.trim(),
      openTime: openTime.trim(),
      closeTime: closeTime.trim(),
    });
  };

  if (submitted) {
    return (
      // SafeAreaView so the success screen respects Android status bar
      <SafeAreaView style={styles.pendingContainer} edges={['top', 'left', 'right', 'bottom']}>
        <Text style={styles.pendingIcon}>⏳</Text>
        <Text style={styles.pendingTitle}>Store Registered!</Text>
        <Text style={styles.pendingDesc}>
          Your store application is pending admin approval. You'll be able to start accepting orders
          once approved. This usually takes 24–48 hours.
        </Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/(auth)/login')}>
          <Text style={styles.backButtonText}>Back to Login</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    // SafeAreaView prevents content under Android status bar; KeyboardAvoidingView uses 'height' on Android
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            onPress={() => {
              if (step === 'otp') setStep('phone');
              else if (step === 'form') setStep('phone');
              else router.back();
            }}
            style={styles.backArrow}
          >
            <Text style={styles.backArrowText}>← Back</Text>
          </TouchableOpacity>

          {step === 'phone' ? (
            <>
              <Text style={styles.title}>Register Your Store</Text>
              <Text style={styles.subtitle}>Verify your phone number to get started</Text>

              <Text style={styles.label}>Phone Number</Text>
              <View style={styles.phoneRow}>
                <Text style={styles.countryCode}>+91</Text>
                <TextInput
                  style={styles.phoneInput}
                  placeholder="Enter your phone number"
                  keyboardType="phone-pad"
                  maxLength={10}
                  value={phone}
                  onChangeText={setPhone}
                  autoFocus
                />
              </View>
              <TouchableOpacity
                style={[styles.submitButton, sendOtpMutation.isPending && styles.submitButtonDisabled]}
                onPress={handleSendOtp}
                disabled={sendOtpMutation.isPending}
              >
                {sendOtpMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>Send OTP</Text>
                )}
              </TouchableOpacity>
            </>
          ) : null}

          {step === 'otp' ? (
            <>
              <Text style={styles.title}>Verify Your Number</Text>
              <Text style={styles.subtitle}>Enter the 6-digit code we sent you</Text>

              <Text style={styles.label}>Enter OTP sent to +91 {phone}</Text>
              <TextInput
                style={styles.otpInput}
                placeholder="6-digit OTP"
                keyboardType="number-pad"
                maxLength={6}
                value={otp}
                onChangeText={setOtp}
                autoFocus
              />
              <TouchableOpacity
                style={[styles.submitButton, verifyOtpMutation.isPending && styles.submitButtonDisabled]}
                onPress={handleVerifyOtp}
                disabled={verifyOtpMutation.isPending}
              >
                {verifyOtpMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>Verify OTP</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setStep('phone')} style={styles.backLink}>
                <Text style={styles.backLinkText}>Change number</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {step === 'form' ? (
            <>
              <Text style={styles.title}>Register Your Store</Text>
              <Text style={styles.subtitle}>Fill in your store details to get started</Text>

              {/* Store Info */}
              <Text style={styles.sectionHeader}>Store Information</Text>

              <Text style={styles.label}>Store Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Sharma Kirana Store"
                value={name}
                onChangeText={setName}
              />

              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Brief description of your store..."
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
              />

              <Text style={styles.label}>Category *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat.value}
                    style={[styles.categoryChip, category === cat.value && styles.categoryChipSelected]}
                    onPress={() => setCategory(cat.value)}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        category === cat.value && styles.categoryChipTextSelected,
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Location — drag the map so the pin sits on your store */}
              <Text style={styles.sectionHeader}>Store Location</Text>
              <Text style={styles.hint}>
                Pan the map so the pin sits exactly on your store. We use this to send you nearby
                orders.
              </Text>

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
                  <Text style={styles.recenterText}>◎</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.coordsRow}>
                <Text style={styles.coords}>
                  {region.latitude.toFixed(5)}, {region.longitude.toFixed(5)}
                </Text>
                {resolving ? <ActivityIndicator size="small" color="#2563EB" /> : null}
              </View>

              {/* Address — auto-filled from the pin, still editable */}
              <Text style={styles.sectionHeader}>Address</Text>

              <Text style={styles.label}>Street Address *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Shop number, building, street name"
                value={street}
                onChangeText={setStreet}
                multiline
                numberOfLines={2}
              />

              <View style={styles.row}>
                <View style={styles.rowField}>
                  <Text style={styles.label}>City *</Text>
                  <TextInput style={styles.input} placeholder="City" value={city} onChangeText={setCity} />
                </View>
                <View style={styles.rowField}>
                  <Text style={styles.label}>State *</Text>
                  <TextInput style={styles.input} placeholder="State" value={state} onChangeText={setState} />
                </View>
              </View>

              <Text style={styles.label}>Pincode *</Text>
              <TextInput
                style={styles.input}
                placeholder="6-digit pincode"
                keyboardType="number-pad"
                maxLength={6}
                value={pincode}
                onChangeText={setPincode}
              />

              {/* Operating Hours */}
              <Text style={styles.sectionHeader}>Operating Hours</Text>

              <View style={styles.row}>
                <View style={styles.rowField}>
                  <Text style={styles.label}>Opening Time</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="HH:MM"
                    value={openTime}
                    onChangeText={setOpenTime}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
                <View style={styles.rowField}>
                  <Text style={styles.label}>Closing Time</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="HH:MM"
                    value={closeTime}
                    onChangeText={setCloseTime}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.submitButton, registerMutation.isPending && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={registerMutation.isPending}
              >
                {registerMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>Submit Registration</Text>
                )}
              </TouchableOpacity>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const MAP_HEIGHT = 280;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  contentContainer: { padding: 24, paddingBottom: 48 },
  backArrow: { marginBottom: 20 },
  backArrowText: { color: '#2563EB', fontSize: 16, fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '700', color: '#111827', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#6B7280', marginBottom: 24 },
  sectionHeader: { fontSize: 15, fontWeight: '700', color: '#2563EB', marginTop: 20, marginBottom: 12 },
  hint: { fontSize: 13, color: '#6B7280', marginBottom: 12, lineHeight: 18 },
  label: { fontSize: 14, color: '#374151', fontWeight: '500', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 50,
    fontSize: 15,
    color: '#111827',
    marginBottom: 16,
  },
  textArea: { height: 80, paddingTop: 12, textAlignVertical: 'top' },
  categoryScroll: { marginBottom: 16 },
  categoryChip: {
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: '#F9FAFB',
  },
  categoryChipSelected: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  categoryChipText: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
  categoryChipTextSelected: { color: '#2563EB' },
  row: { flexDirection: 'row', gap: 12 },
  rowField: { flex: 1 },
  mapWrap: {
    height: MAP_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#F3F4F6',
    marginBottom: 8,
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
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  recenterText: { fontSize: 22, color: '#2563EB', fontWeight: '700' },
  coordsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  coords: { fontSize: 12, color: '#6B7280' },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 52,
    marginBottom: 16,
  },
  countryCode: { fontSize: 16, color: '#374151', marginRight: 8, fontWeight: '600' },
  phoneInput: { flex: 1, fontSize: 16, color: '#111827' },
  otpInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 16,
    height: 52,
    fontSize: 22,
    letterSpacing: 8,
    textAlign: 'center',
    color: '#111827',
    marginBottom: 16,
  },
  backLink: { alignItems: 'center', marginTop: 8 },
  backLinkText: { color: '#2563EB', fontSize: 14 },
  submitButton: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  pendingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#fff',
  },
  pendingIcon: { fontSize: 64, marginBottom: 16 },
  pendingTitle: { fontSize: 24, fontWeight: '700', color: '#111827', marginBottom: 12 },
  pendingDesc: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  backButton: { backgroundColor: '#2563EB', borderRadius: 10, paddingHorizontal: 32, paddingVertical: 14 },
  backButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

