import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { apiClient } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { useTransitionStore } from '@/store/transition.store';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';
import type { UserProfile } from '@aks/shared';

interface VerifyOtpResponse {
  user: UserProfile;
  accessToken: string;
  refreshToken: string;
  hasAddress: boolean;
}

export default function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [name, setName] = useState('');
  const [step, setStep] = useState<'phone' | 'otp' | 'register'>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const otpRefs = useRef<Array<TextInput | null>>([]);
  const setAuth = useAuthStore((s) => s.setAuth);

  const isValidPhone = phone.length === 10 && /^\d+$/.test(phone);
  const otpString = otp.join('');
  const isValidOtp = otpString.length === 6 && /^\d+$/.test(otpString);

  useEffect(() => {
    if (step === 'otp') {
      const t = setTimeout(() => otpRefs.current[0]?.focus(), 200);
      return () => clearTimeout(t);
    }
  }, [step]);

  function showError(message: string) {
    setError(message);
    setTimeout(() => setError(null), 4000);
  }

  function handleOtpChange(index: number, value: string) {
    const sanitized = value.replace(/\D/g, '');

    if (sanitized.length > 1) {
      const chars = sanitized.slice(0, 6 - index).split('');
      const next = [...otp];
      chars.forEach((ch, i) => {
        next[index + i] = ch;
      });
      setOtp(next);
      const lastIndex = Math.min(index + chars.length, 5);
      otpRefs.current[lastIndex]?.focus();
      return;
    }

    const next = [...otp];
    next[index] = sanitized;
    setOtp(next);

    if (sanitized && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKey(index: number, key: string) {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  async function handleSendOtp() {
    if (!isValidPhone) {
      showError('Please enter a valid 10-digit phone number');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiClient.post('/api/v1/auth/send-otp', { phone });
      setStep('otp');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to send OTP. Please try again.';
      showError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(submittedName?: string) {
    if (!isValidOtp) {
      showError('Please enter the complete 6-digit OTP');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.post<{ success: boolean; data: VerifyOtpResponse; error?: string }>(
        '/api/v1/auth/verify-otp',
        {
          phone,
          otp: otpString,
          role: 'CUSTOMER',
          ...(submittedName ? { name: submittedName } : {}),
        }
      );
      const payload = res.data?.data;
      if (!payload?.accessToken || !payload?.refreshToken || !payload?.user) {
        throw new Error(res.data?.error ?? 'Invalid response from server');
      }
      const { user, accessToken, refreshToken, hasAddress } = payload;

      // First-time customer with no name yet → ask them to register.
      if (!user.name && !submittedName) {
        setStep('register');
        setLoading(false);
        return;
      }

      // Show the global redirect overlay BEFORE we navigate. Lives at the
      // root layout, so it survives across the route change and stays up
      // until the destination screen has had time to mount.
      const friendlyName = (user.name ?? submittedName ?? '').split(' ')[0];
      const message = hasAddress
        ? friendlyName
          ? `Welcome back, ${friendlyName}!`
          : 'Welcome back!'
        : friendlyName
          ? `Welcome aboard, ${friendlyName}!`
          : 'Setting up your account…';
      useTransitionStore.getState().showTransition(message, 2000);

      // Set in-memory auth + parallel SecureStore writes (don't block on disk)
      setAuth(user, accessToken);
      await Promise.all([
        SecureStore.setItemAsync('accessToken', accessToken),
        SecureStore.setItemAsync('refreshToken', refreshToken),
        SecureStore.setItemAsync('user', JSON.stringify(user)),
      ]);

      // hasAddress comes back from verify-otp now — no separate /addresses round-trip
      router.replace(hasAddress ? '/(tabs)/home' : '/onboarding/location');
    } catch (err: unknown) {
      // Roll back the global overlay if something blew up after we showed it
      useTransitionStore.getState().hideTransition();
      const message =
        err instanceof Error ? err.message : 'Invalid OTP. Please try again.';
      showError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCompleteRegistration() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      showError('Please enter your full name');
      return;
    }
    await handleVerifyOtp(trimmed);
  }

  function handleChangeNumber() {
    setStep('phone');
    setOtp(['', '', '', '', '', '']);
    setName('');
    setError(null);
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {/* Android: include left/right edges so content respects display cutouts on landscape/foldables */}
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.heroSafe}>
        <View style={styles.hero}>
          <View style={styles.logoBadge}>
            <Ionicons name="basket" size={40} color={colors.white} />
          </View>
          <Text style={styles.brand}>Apni Kirana Store</Text>
          <Text style={styles.tagline}>Daily essentials, delivered fast</Text>
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

          {step === 'register' ? (
            <>
              <Text style={styles.title}>Welcome aboard</Text>
              <Text style={styles.subtitle}>
                Tell us your name so we can personalize your experience
              </Text>

              <Input
                label="Full name"
                value={name}
                onChangeText={setName}
                placeholder="e.g. Anita Sharma"
                autoFocus
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={handleCompleteRegistration}
              />

              <Button
                title="Create my account"
                onPress={handleCompleteRegistration}
                loading={loading}
                disabled={name.trim().length < 2}
                fullWidth
                size="lg"
                style={{ marginTop: spacing.lg }}
              />

              <TouchableOpacity
                style={styles.changeNumberBtn}
                activeOpacity={0.7}
                onPress={handleChangeNumber}
              >
                <Ionicons name="arrow-back" size={16} color={colors.primary} />
                <Text style={styles.changeNumberText}>Use a different number</Text>
              </TouchableOpacity>
            </>
          ) : step === 'phone' ? (
            <>
              <Text style={styles.title}>Welcome</Text>
              <Text style={styles.subtitle}>
                Enter your phone number to continue
              </Text>

              <View style={styles.phoneRow}>
                <View style={styles.prefixBox}>
                  <Text style={styles.prefixText}>+91</Text>
                </View>
                <TextInput
                  style={styles.phoneInput}
                  placeholder="9999966661"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={10}
                  value={phone}
                  onChangeText={(t) => setPhone(t.replace(/\D/g, ''))}
                  autoFocus
                />
              </View>

              <Button
                title="Send OTP"
                onPress={handleSendOtp}
                loading={loading}
                disabled={!isValidPhone}
                fullWidth
                size="lg"
                style={{ marginTop: spacing.lg }}
              />

              <View style={styles.hintBox}>
                <Ionicons name="information-circle" size={16} color={colors.info} />
                <Text style={styles.hintText}>
                  Use 9999966661 to test as customer
                </Text>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.title}>Verify OTP</Text>
              <Text style={styles.subtitle}>
                OTP sent to +91 {phone}
              </Text>

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
                    onKeyPress={({ nativeEvent }) => handleOtpKey(idx, nativeEvent.key)}
                    selectTextOnFocus
                  />
                ))}
              </View>

              <Button
                title="Verify & Continue"
                onPress={() => handleVerifyOtp()}
                loading={loading}
                disabled={!isValidOtp}
                fullWidth
                size="lg"
                style={{ marginTop: spacing.lg }}
              />

              <TouchableOpacity
                style={styles.changeNumberBtn}
                activeOpacity={0.7}
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
  heroSafe: {
    backgroundColor: colors.primary,
  },
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
  sheetWrap: {
    flex: 1,
  },
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
    minHeight: 50,
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
    color: colors.info,
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
    aspectRatio: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    backgroundColor: colors.white,
  },
  otpBoxFilled: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  changeNumberBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  changeNumberText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '700',
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
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  disclaimer: {
    marginTop: spacing.xxl,
    textAlign: 'center',
    fontSize: fontSize.xs,
    color: colors.textMuted,
    lineHeight: 18,
  },
});
