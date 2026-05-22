import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { AuthScaffold, authStyles } from '@/components/AuthScaffold';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { OtpInput } from '@/components/OtpInput';
import { apiClient } from '@/lib/api';
import { persistSession } from '@/lib/session';
import { useTransitionStore } from '@/store/transition.store';
import { colors, spacing } from '@/constants/theme';
import type { UserProfile } from '@aks/shared';

interface AuthResponse {
  user: UserProfile;
  accessToken: string;
  refreshToken: string;
  hasAddress: boolean;
}

export default function RegisterScreen() {
  const [step, setStep] = useState<'form' | 'otp'>('form');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function showError(message: string) {
    setError(message);
    setTimeout(() => setError(null), 5000);
  }

  function errMessage(err: unknown, fallback: string) {
    if (typeof err === 'object' && err && 'response' in err) {
      const e = err as { response?: { data?: { error?: string } } };
      if (e.response?.data?.error) return e.response.data.error;
    }
    return err instanceof Error ? err.message : fallback;
  }

  async function handleRegister() {
    if (name.trim().length < 2) return showError('Enter your full name');
    if (phone.length !== 10) return showError('Enter a valid 10-digit mobile number');
    if (!/^\S+@\S+\.\S+$/.test(email)) return showError('Enter a valid email address');
    if (username.trim().length < 3) return showError('Username must be at least 3 characters');
    if (password.length < 8) return showError('Password must be at least 8 characters');

    setLoading(true);
    setError(null);
    try {
      await apiClient.post('/api/v1/auth/register', {
        name: name.trim(),
        phone,
        email: email.trim(),
        username: username.trim(),
        password,
        role: 'CUSTOMER',
      });
      setStep('otp');
    } catch (err: unknown) {
      showError(errMessage(err, 'Registration failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    if (otp.length !== 6) return showError('Enter the complete 6-digit OTP');
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.post<{ success: boolean; data: AuthResponse; error?: string }>(
        '/api/v1/auth/verify-otp',
        { phone, otp, role: 'CUSTOMER' },
      );
      const payload = res.data?.data;
      if (!payload?.accessToken) throw new Error(res.data?.error ?? 'Verification failed');
      await persistSession(payload.user, payload.accessToken, payload.refreshToken);
      const firstName = (payload.user.name ?? '').split(' ')[0];
      useTransitionStore
        .getState()
        .showTransition(firstName ? `Welcome aboard, ${firstName}!` : 'Welcome aboard!', 2000);
      router.replace(payload.hasAddress ? '/(tabs)/home' : '/onboarding/location');
    } catch (err: unknown) {
      showError(errMessage(err, 'Invalid OTP. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    setError(null);
    try {
      await apiClient.post('/api/v1/auth/send-otp', { phone });
      showError('A new OTP has been sent to your number');
    } catch {
      showError('Could not resend the OTP');
    }
  }

  return (
    <AuthScaffold>
      {step === 'form' ? (
        <>
          <Text style={authStyles.title}>Create your account</Text>
          <Text style={authStyles.subtitle}>
            We&apos;ll send a one-time code to verify your mobile number.
          </Text>

          <Input
            label="Full name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Anita Sharma"
            autoCapitalize="words"
            leftIcon="person-outline"
          />
          <Input
            label="Mobile number"
            value={phone}
            onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, 10))}
            placeholder="10-digit number"
            keyboardType="number-pad"
            leftIcon="call-outline"
          />
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            leftIcon="mail-outline"
          />
          <Input
            label="Username"
            value={username}
            onChangeText={(t) => setUsername(t.replace(/\s/g, ''))}
            placeholder="Used to log in"
            autoCapitalize="none"
            leftIcon="at-outline"
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            secureTextEntry
            leftIcon="lock-closed-outline"
          />

          <Button
            title="Create account"
            onPress={handleRegister}
            loading={loading}
            fullWidth
            size="lg"
            style={{ marginTop: spacing.lg }}
          />

          <View style={authStyles.footerRow}>
            <Text style={authStyles.footerMuted}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
              <Text style={authStyles.linkText}>Log in</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <Text style={authStyles.title}>Verify your number</Text>
          <Text style={authStyles.subtitle}>Enter the 6-digit OTP sent to +91 {phone}</Text>

          <OtpInput value={otp} onChange={setOtp} />

          <Button
            title="Verify & continue"
            onPress={handleVerify}
            loading={loading}
            disabled={otp.length !== 6}
            fullWidth
            size="lg"
            style={{ marginTop: spacing.lg }}
          />

          <TouchableOpacity style={authStyles.link} onPress={handleResendOtp}>
            <Ionicons name="refresh" size={16} color={colors.primary} />
            <Text style={authStyles.linkText}>Resend OTP</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={authStyles.link}
            onPress={() => {
              setStep('form');
              setOtp('');
            }}
          >
            <Ionicons name="arrow-back" size={16} color={colors.primary} />
            <Text style={authStyles.linkText}>Edit details</Text>
          </TouchableOpacity>
        </>
      )}

      {error ? (
        <View style={authStyles.errorBox}>
          <Ionicons name="alert-circle" size={18} color={colors.error} />
          <Text style={authStyles.errorText}>{error}</Text>
        </View>
      ) : null}
    </AuthScaffold>
  );
}
