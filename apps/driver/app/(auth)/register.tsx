import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { EmptyState } from '@/components/EmptyState';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';
import type { VehicleType, UserProfile } from '@aks/shared';

interface VehicleOption {
  label: string;
  value: VehicleType;
  icon: keyof typeof Ionicons.glyphMap;
}

const VEHICLE_OPTIONS: VehicleOption[] = [
  { label: 'Bike', value: 'BIKE', icon: 'bicycle' },
  { label: 'Scooter', value: 'SCOOTER', icon: 'bicycle-outline' },
  { label: 'Car', value: 'CAR', icon: 'car' },
];

const OTP_LENGTH = 6;

interface RegisterPayload {
  vehicleType: VehicleType;
  vehicleNumber: string;
  licenseNumber: string;
}

interface RegisterResponse {
  message: string;
  driverId: string;
}

interface SendOtpResponse {
  message: string;
}

interface VerifyOtpResponse {
  accessToken: string;
  refreshToken?: string;
  user: UserProfile;
}

export default function DriverRegisterScreen() {
  // Step 1 — phone verification
  const [step, setStep] = useState<'phone' | 'otp' | 'form'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [error, setError] = useState<string | null>(null);
  const otpRefs = useRef<Array<TextInput | null>>([]);

  // Step 2 — registration form
  const [vehicleType, setVehicleType] = useState<VehicleType>('BIKE');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<{ vehicle?: string; license?: string }>({});

  const otpString = otp.join('');
  const isValidPhone = phone.length === 10 && /^\d+$/.test(phone);
  const isValidOtp = otpString.length === OTP_LENGTH && /^\d+$/.test(otpString);

  useEffect(() => {
    if (step === 'otp') {
      const t = setTimeout(() => otpRefs.current[0]?.focus(), 200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [step]);

  function showError(message: string) {
    setError(message);
    setTimeout(() => setError(null), 4000);
  }

  function handleOtpChange(index: number, value: string) {
    const sanitized = value.replaceAll(/\D/g, '');

    if (sanitized.length > 1) {
      const chars = sanitized.slice(0, OTP_LENGTH - index).split('');
      const next = [...otp];
      chars.forEach((ch, i) => {
        next[index + i] = ch;
      });
      setOtp(next);
      const lastIndex = Math.min(index + chars.length, OTP_LENGTH - 1);
      otpRefs.current[lastIndex]?.focus();
      return;
    }

    const next = [...otp];
    next[index] = sanitized;
    setOtp(next);

    if (sanitized && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKey(index: number, key: string) {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  const sendOtpMutation = useMutation<SendOtpResponse, Error, string>({
    mutationFn: (phoneNumber: string) =>
      api
        .post<SendOtpResponse>('/api/v1/auth/send-otp', { phone: phoneNumber })
        .then((r) => r.data),
    onSuccess: () => setStep('otp'),
    onError: (err) => showError(err.message || 'Failed to send OTP'),
  });

  // Verify OTP with NO role field — backend auto-creates a CUSTOMER account
  // and returns a token. The /drivers/register call below then promotes the
  // role to DRIVER.
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
      await SecureStore.setItemAsync('accessToken', data.accessToken);
      if (data.refreshToken) {
        await SecureStore.setItemAsync('refreshToken', data.refreshToken);
      }
      await SecureStore.setItemAsync('user', JSON.stringify(data.user));
      setStep('form');
    },
    onError: (err) => showError(err.message || 'Invalid OTP'),
  });

  const registerMutation = useMutation<RegisterResponse, Error, RegisterPayload>({
    mutationFn: (payload) =>
      api
        .post<RegisterResponse>('/api/v1/drivers/register', payload)
        .then((r) => r.data),
    onSuccess: () => setSubmitted(true),
    onError: (err) =>
      Alert.alert('Registration failed', err.message || 'Please try again'),
  });

  const handleSendOtp = () => {
    if (!isValidPhone) {
      showError('Please enter a valid 10-digit phone number');
      return;
    }
    setError(null);
    sendOtpMutation.mutate(phone);
  };

  const handleVerifyOtp = () => {
    if (!isValidOtp) {
      showError('Please enter the complete 6-digit OTP');
      return;
    }
    setError(null);
    verifyOtpMutation.mutate({ phone, otp: otpString });
  };

  const handleChangeNumber = () => {
    setStep('phone');
    setOtp(Array(OTP_LENGTH).fill(''));
    setError(null);
  };

  const handleSubmit = () => {
    const nextErrors: { vehicle?: string; license?: string } = {};
    if (!vehicleNumber.trim()) nextErrors.vehicle = 'Vehicle number is required';
    if (!licenseNumber.trim()) nextErrors.license = 'License number is required';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    registerMutation.mutate({
      vehicleType,
      vehicleNumber: vehicleNumber.trim().toUpperCase(),
      licenseNumber: licenseNumber.trim().toUpperCase(),
    });
  };

  if (submitted) {
    return (
      // Android: full edges so success state isn't clipped by system bars
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.pendingContainer}>
          <EmptyState
            icon="time-outline"
            title="Application submitted!"
            subtitle={
              "Your driver application is under review. Our admin team will verify your documents and approve your account within 24-48 hours. You'll get a notification once approved."
            }
            actionLabel="Back to Login"
            onAction={() => router.replace('/(auth)/login')}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    // Android: include left/right edges so content respects horizontal insets
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              if (step === 'form') {
                handleChangeNumber();
                setStep('phone');
              } else {
                router.back();
              }
            }}
            style={styles.backBtn}
            hitSlop={10}
          >
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.backBtn} />
        </View>

        <View style={styles.headerHero}>
          <View style={styles.heroIconWrap}>
            <Ionicons name="bicycle" size={32} color={colors.primary} />
          </View>
          <Text style={styles.title}>Become a driver</Text>
          <Text style={styles.subtitle}>
            {step === 'form'
              ? 'Tell us about your vehicle to get started'
              : 'Verify your phone number to begin'}
          </Text>
        </View>

        {step === 'phone' ? (
          <>
            <Text style={styles.sectionLabel}>Phone number</Text>
            <View style={styles.phoneRow}>
              <View style={styles.prefixBox}>
                <Text style={styles.prefixText}>+91</Text>
              </View>
              <TextInput
                style={styles.phoneInput}
                placeholder="Enter your phone number"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={10}
                value={phone}
                onChangeText={(t) => setPhone(t.replaceAll(/\D/g, ''))}
                autoFocus
              />
            </View>

            <Button
              title="Send OTP"
              onPress={handleSendOtp}
              loading={sendOtpMutation.isPending}
              disabled={!isValidPhone}
              fullWidth
              size="lg"
              style={{ marginTop: spacing.lg }}
            />

            <View style={styles.infoBox}>
              <Ionicons name="shield-checkmark" size={18} color={colors.info} />
              <Text style={styles.infoText}>
                We'll send a 6-digit code to verify your number.
              </Text>
            </View>
          </>
        ) : null}

        {step === 'otp' ? (
          <>
            <Text style={styles.sectionLabel}>Enter OTP</Text>
            <Text style={styles.otpHint}>OTP sent to +91 {phone}</Text>
            <View style={styles.otpRow}>
              {otp.map((digit, idx) => (
                <TextInput
                  key={idx}
                  ref={(r) => {
                    otpRefs.current[idx] = r;
                  }}
                  style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
                  keyboardType="number-pad"
                  maxLength={1}
                  value={digit}
                  onChangeText={(t) => handleOtpChange(idx, t)}
                  onKeyPress={({ nativeEvent }) =>
                    handleOtpKey(idx, nativeEvent.key)
                  }
                  selectTextOnFocus
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                />
              ))}
            </View>

            <Button
              title="Verify & Continue"
              onPress={handleVerifyOtp}
              loading={verifyOtpMutation.isPending}
              disabled={!isValidOtp}
              fullWidth
              size="lg"
              style={{ marginTop: spacing.lg }}
            />

            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.changeNumberBtn}
              onPress={handleChangeNumber}
            >
              <Ionicons name="arrow-back" size={16} color={colors.primary} />
              <Text style={styles.changeNumberText}>Change number</Text>
            </TouchableOpacity>
          </>
        ) : null}

        {step === 'form' ? (
          <>
            {/* Vehicle Type Picker */}
            <Text style={styles.sectionLabel}>Vehicle Type</Text>
            <View style={styles.vehiclePicker}>
              {VEHICLE_OPTIONS.map((opt) => {
                const selected = vehicleType === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    activeOpacity={0.7}
                    style={[
                      styles.vehicleOption,
                      selected && styles.vehicleOptionSelected,
                    ]}
                    onPress={() => setVehicleType(opt.value)}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={28}
                      color={selected ? colors.primary : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.vehicleOptionText,
                        selected && styles.vehicleOptionTextSelected,
                      ]}
                    >
                      {opt.label}
                    </Text>
                    {selected ? (
                      <View style={styles.vehicleCheck}>
                        <Ionicons
                          name="checkmark-circle"
                          size={18}
                          color={colors.primary}
                        />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Form fields */}
            <View style={styles.formGap} />
            <Input
              label="Vehicle number"
              placeholder="e.g. MH01AB1234"
              autoCapitalize="characters"
              value={vehicleNumber}
              onChangeText={(t) => {
                setVehicleNumber(t);
                if (errors.vehicle) setErrors((e) => ({ ...e, vehicle: undefined }));
              }}
              leftIcon="card-outline"
              error={errors.vehicle}
              containerStyle={{ marginBottom: spacing.lg }}
            />

            <Input
              label="Driving license number"
              placeholder="e.g. MH0120200012345"
              autoCapitalize="characters"
              value={licenseNumber}
              onChangeText={(t) => {
                setLicenseNumber(t);
                if (errors.license) setErrors((e) => ({ ...e, license: undefined }));
              }}
              leftIcon="document-text-outline"
              error={errors.license}
            />

            <Button
              title="Submit Application"
              icon="paper-plane"
              iconPosition="right"
              onPress={handleSubmit}
              loading={registerMutation.isPending}
              fullWidth
              size="lg"
              style={{ marginTop: spacing.xxl }}
            />

            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={18} color={colors.info} />
              <Text style={styles.infoText}>
                Your details will be reviewed by our team. We approve most
                drivers within 24-48 hours.
              </Text>
            </View>
          </>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  contentContainer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl + spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  headerHero: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  heroIconWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadow.small,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  phoneRow: {
    flexDirection: 'row',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  prefixBox: {
    backgroundColor: colors.gray100,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    borderRightWidth: 1.5,
    borderRightColor: colors.border,
  },
  prefixText: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  phoneInput: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    minHeight: 52,
  },
  otpHint: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  otpBox: {
    flex: 1,
    height: 56,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
    textAlign: 'center',
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  otpBoxFilled: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
  },
  changeNumberBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
  changeNumberText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  vehiclePicker: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  vehicleOption: {
    flex: 1,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    gap: spacing.sm,
    position: 'relative',
  },
  vehicleOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
  },
  vehicleOptionText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  vehicleOptionTextSelected: { color: colors.primary, fontWeight: '700' },
  vehicleCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  formGap: { height: spacing.xl },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.infoLight,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.xl,
  },
  infoText: {
    flex: 1,
    color: colors.infoDark,
    fontSize: fontSize.xs,
    fontWeight: '500',
    lineHeight: 18,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorLight,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.lg,
  },
  errorText: {
    flex: 1,
    color: colors.error,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  pendingContainer: {
    flex: 1,
    justifyContent: 'center',
  },
});

