import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useDriverStore } from '@/store/driver.store';
import { Button } from '@/components/Button';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';
import type { UserProfile, DriverProfile } from '@aks/shared';

interface SendOtpResponse {
  message: string;
}

interface VerifyOtpResponse {
  accessToken: string;
  user: UserProfile;
  driverProfile: DriverProfile | null;
}

const OTP_LENGTH = 6;

export default function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [error, setError] = useState<string | null>(null);
  const otpRefs = useRef<Array<TextInput | null>>([]);
  const { setAuth } = useDriverStore();

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
      }>('/api/v1/auth/verify-otp', { ...payload, role: 'DRIVER' });
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
      await SecureStore.setItemAsync('user', JSON.stringify(data.user));
      if (data.driverProfile) {
        await SecureStore.setItemAsync(
          'driverProfile',
          JSON.stringify(data.driverProfile),
        );
      }
      setAuth(data.accessToken, data.user, data.driverProfile);

      if (!data.driverProfile && data.user.role !== 'DRIVER') {
        router.replace('/(auth)/register');
        return;
      }

      if (data.driverProfile?.status === 'PENDING_APPROVAL') {
        router.replace('/(auth)/pending');
        return;
      }

      router.replace('/(tabs)/dashboard');
    },
    onError: (err) => showError(err.message || 'Invalid OTP'),
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

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {/* Android: include left/right so hero respects horizontal insets too */}
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.heroSafe}>
        <View style={styles.hero}>
          <View style={styles.logoBadge}>
            <Ionicons name="bicycle" size={40} color={colors.white} />
          </View>
          <Text style={styles.brand}>AKS Driver</Text>
          <Text style={styles.tagline}>Deliver smart, earn more</Text>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        style={styles.sheetWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={20}
      >
        <ScrollView
          style={styles.sheet}
          contentContainerStyle={styles.sheetContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.handle} />

          {step === 'phone' ? (
            <>
              <Text style={styles.title}>Welcome back</Text>
              <Text style={styles.subtitle}>
                Enter your phone number to continue
              </Text>

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

              <View style={styles.hintBox}>
                <Ionicons name="shield-checkmark" size={16} color={colors.info} />
                <Text style={styles.hintText}>
                  We'll send a 6-digit code to verify your number
                </Text>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.title}>Verify OTP</Text>
              <Text style={styles.subtitle}>OTP sent to +91 {phone}</Text>

              <View style={styles.otpRow}>
                {otp.map((digit, idx) => (
                  <TextInput
                    key={idx}
                    ref={(r) => {
                      otpRefs.current[idx] = r;
                    }}
                    style={[
                      styles.otpBox,
                      digit ? styles.otpBoxFilled : null,
                    ]}
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
          )}

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.registerLink}
            onPress={() => router.push('/(auth)/register')}
          >
            <Text style={styles.registerLinkMuted}>New driver?</Text>
            <Text style={styles.registerLinkText}>Apply to drive</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.primary} />
          </TouchableOpacity>

          <Text style={styles.disclaimer}>
            By continuing you agree to our Terms of Service and Privacy Policy.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  heroSafe: { backgroundColor: colors.primary },
  hero: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxxl + spacing.lg,
    paddingHorizontal: spacing.xxl,
  },
  logoBadge: {
    width: 88,
    height: 88,
    borderRadius: radius.xl,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    ...shadow.large,
  },
  brand: {
    color: colors.white,
    fontSize: fontSize.xxl,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  tagline: {
    marginTop: spacing.xs,
    color: colors.primaryLight,
    fontSize: fontSize.sm,
  },
  sheetWrap: { flex: 1 },
  sheet: {
    flex: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  sheetContent: {
    padding: spacing.xxl,
    paddingBottom: spacing.xxxl,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray200,
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
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
  hintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.infoLight,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.lg,
  },
  hintText: {
    flex: 1,
    color: colors.infoDark,
    fontSize: fontSize.xs,
    fontWeight: '600',
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
  registerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.xxl,
  },
  registerLinkMuted: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  registerLinkText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  disclaimer: {
    marginTop: spacing.xl,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
