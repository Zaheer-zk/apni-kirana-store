import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { AuthScaffold, authStyles } from '@/components/AuthScaffold';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { OtpInput } from '@/components/OtpInput';
import { api } from '@/lib/api';
import { persistSession } from '@/lib/session';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { useStorePortalStore } from '@/store/store.store';
import { colors, spacing } from '@/constants/theme';
import type { StoreProfile, UserProfile } from '@aks/shared';

interface AuthResponse {
  user: UserProfile;
  accessToken: string;
  refreshToken: string;
  hasAddress: boolean;
  mustChangePassword?: boolean;
  storeProfile?: StoreProfile | null;
}

type Mode = 'password' | 'otp';

export default function StoreLoginScreen() {
  const [mode, setMode] = useState<Mode>('password');

  // Password login
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  // OTP login
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function showError(message: string) {
    setError(message);
    setTimeout(() => setError(null), 4500);
  }

  function errMessage(err: unknown, fallback: string) {
    if (typeof err === 'object' && err && 'response' in err) {
      const e = err as { response?: { data?: { error?: string } } };
      if (e.response?.data?.error) return e.response.data.error;
    }
    return err instanceof Error ? err.message : fallback;
  }

  /**
   * Resolves the destination after a successful store-owner login. If the
   * owner has no store yet → store registration form; otherwise → dashboard.
   * Returns the destination route so `mustChangePassword` can forward to it.
   */
  async function resolveStoreDestination(
    user: UserProfile,
    storeProfile: StoreProfile | null,
  ): Promise<string> {
    let profile = storeProfile;
    if (!profile) {
      try {
        const meRes = await api.get<{ data?: StoreProfile } | StoreProfile>('/api/v1/stores/me');
        profile =
          (meRes.data as { data?: StoreProfile })?.data ?? (meRes.data as StoreProfile) ?? null;
      } catch {
        // 404 — owner without a store; fall through to store registration
        profile = null;
      }
    }
    if (profile && profile.id) {
      await SecureStore.setItemAsync(STORAGE_KEYS.storeProfile, JSON.stringify(profile));
      useStorePortalStore.getState().setStoreProfile(profile);
      return '/(tabs)/dashboard';
    }
    // No store yet — send the owner to the store-detail creation step.
    return '/(auth)/register';
  }

  /** Routes onward after a successful login / OTP verify. */
  async function completeAuth(payload: AuthResponse) {
    await persistSession(
      payload.user,
      payload.accessToken,
      payload.refreshToken,
      payload.storeProfile ?? null,
    );

    const destination = await resolveStoreDestination(
      payload.user,
      payload.storeProfile ?? null,
    );

    if (payload.mustChangePassword) {
      router.replace(`/(auth)/change-password?next=${encodeURIComponent(destination)}`);
      return;
    }
    router.replace(destination as never);
  }

  async function handlePasswordLogin() {
    if (!identifier.trim() || !password) {
      showError('Enter your username/mobile number and password');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ success: boolean; data: AuthResponse; error?: string }>(
        '/api/v1/auth/login',
        { identifier: identifier.trim(), password, role: 'STORE_OWNER' },
      );
      const payload = res.data?.data;
      if (!payload?.accessToken) throw new Error(res.data?.error ?? 'Login failed');
      await completeAuth(payload);
    } catch (err: unknown) {
      showError(errMessage(err, 'Login failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleSendOtp() {
    if (phone.length !== 10) {
      showError('Enter a valid 10-digit mobile number');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.post('/api/v1/auth/send-otp', { phone });
      setOtpSent(true);
    } catch (err: unknown) {
      showError(errMessage(err, 'Could not send OTP. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (otp.length !== 6) {
      showError('Enter the complete 6-digit OTP');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ success: boolean; data: AuthResponse; error?: string }>(
        '/api/v1/auth/verify-otp',
        { phone, otp, role: 'STORE_OWNER' },
      );
      const payload = res.data?.data;
      if (!payload?.accessToken) throw new Error(res.data?.error ?? 'Verification failed');
      await completeAuth(payload);
    } catch (err: unknown) {
      showError(errMessage(err, 'Invalid OTP. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScaffold>
      <Text style={authStyles.title}>Welcome back</Text>
      <Text style={authStyles.subtitle}>Log in to manage your store</Text>

      {/* Mode switch */}
      <View style={authStyles.segment}>
        <TouchableOpacity
          style={[authStyles.segmentBtn, mode === 'password' && authStyles.segmentBtnActive]}
          onPress={() => {
            setMode('password');
            setError(null);
          }}
        >
          <Text style={[authStyles.segmentText, mode === 'password' && authStyles.segmentTextActive]}>
            Password
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[authStyles.segmentBtn, mode === 'otp' && authStyles.segmentBtnActive]}
          onPress={() => {
            setMode('otp');
            setError(null);
          }}
        >
          <Text style={[authStyles.segmentText, mode === 'otp' && authStyles.segmentTextActive]}>
            OTP
          </Text>
        </TouchableOpacity>
      </View>

      {mode === 'password' ? (
        <>
          <Input
            label="Username or mobile number"
            value={identifier}
            onChangeText={setIdentifier}
            placeholder="e.g. sharma or 9876543210"
            autoCapitalize="none"
            leftIcon="person-outline"
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            secureTextEntry
            leftIcon="lock-closed-outline"
            returnKeyType="done"
            onSubmitEditing={handlePasswordLogin}
          />
          <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')}>
            <Text style={[authStyles.linkText, { textAlign: 'right', marginTop: spacing.xs }]}>
              Forgot password?
            </Text>
          </TouchableOpacity>
          <Button
            title="Log in"
            onPress={handlePasswordLogin}
            loading={loading}
            disabled={!identifier.trim() || !password}
            fullWidth
            size="lg"
            style={{ marginTop: spacing.lg }}
          />
        </>
      ) : !otpSent ? (
        <>
          <Input
            label="Mobile number"
            value={phone}
            onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, 10))}
            placeholder="10-digit number"
            keyboardType="number-pad"
            leftIcon="call-outline"
          />
          <Button
            title="Send OTP"
            onPress={handleSendOtp}
            loading={loading}
            disabled={phone.length !== 10}
            fullWidth
            size="lg"
            style={{ marginTop: spacing.lg }}
          />
        </>
      ) : (
        <>
          <Text style={authStyles.subtitle}>OTP sent to +91 {phone}</Text>
          <OtpInput value={otp} onChange={setOtp} />
          <Button
            title="Verify & log in"
            onPress={handleVerifyOtp}
            loading={loading}
            disabled={otp.length !== 6}
            fullWidth
            size="lg"
            style={{ marginTop: spacing.lg }}
          />
          <TouchableOpacity
            style={authStyles.link}
            onPress={() => {
              setOtpSent(false);
              setOtp('');
            }}
          >
            <Ionicons name="arrow-back" size={16} color={colors.primary} />
            <Text style={authStyles.linkText}>Change number</Text>
          </TouchableOpacity>
        </>
      )}

      {error ? (
        <View style={authStyles.errorBox}>
          <Ionicons name="alert-circle" size={18} color={colors.error} />
          <Text style={authStyles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={authStyles.footerRow}>
        <Text style={authStyles.footerMuted}>New store owner? </Text>
        <Link href="/(auth)/register" asChild>
          <TouchableOpacity>
            <Text style={authStyles.linkText}>Register your store</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </AuthScaffold>
  );
}
