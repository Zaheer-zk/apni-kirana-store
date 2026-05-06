import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useDriverStore } from '@/store/driver.store';
import type { UserProfile, DriverProfile } from '@aks/shared';

interface SendOtpResponse {
  message: string;
}

interface VerifyOtpResponse {
  accessToken: string;
  user: UserProfile;
  driverProfile: DriverProfile | null;
}

export default function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const { setAuth } = useDriverStore();

  const sendOtpMutation = useMutation<SendOtpResponse, Error, string>({
    mutationFn: (phoneNumber: string) =>
      api.post<SendOtpResponse>('/api/v1/auth/send-otp', { phone: phoneNumber }).then((r) => r.data),
    onSuccess: () => setOtpSent(true),
    onError: (err) => Alert.alert('Error', err.message || 'Failed to send OTP'),
  });

  const verifyOtpMutation = useMutation<VerifyOtpResponse, Error, { phone: string; otp: string }>({
    mutationFn: async (payload) => {
      const res = await api.post<{ success: boolean; data: VerifyOtpResponse; error?: string }>(
        '/api/v1/auth/verify-otp',
        { ...payload, role: 'DRIVER' },
      );
      // Backend wraps as { success, data, message } — unwrap to the inner payload
      const inner = (res.data as { data?: VerifyOtpResponse }).data ?? (res.data as VerifyOtpResponse);
      if (!inner?.accessToken || !inner?.user) {
        throw new Error(res.data?.error ?? 'Invalid response from server');
      }
      return inner;
    },
    onSuccess: async (data) => {
      await SecureStore.setItemAsync('accessToken', data.accessToken);
      await SecureStore.setItemAsync('user', JSON.stringify(data.user));
      if (data.driverProfile) {
        await SecureStore.setItemAsync('driverProfile', JSON.stringify(data.driverProfile));
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
    onError: (err) => Alert.alert('Error', err.message || 'Invalid OTP'),
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <View style={styles.header}>
          <Text style={styles.logo}>🚴</Text>
          <Text style={styles.title}>AKS Driver</Text>
          <Text style={styles.subtitle}>Apni Kirana Store — Delivery Partner</Text>
        </View>

        <View style={styles.form}>
          {!otpSent ? (
            <>
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
                style={[styles.button, sendOtpMutation.isPending && styles.buttonDisabled]}
                onPress={handleSendOtp}
                disabled={sendOtpMutation.isPending}
              >
                {sendOtpMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Send OTP</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
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
                style={[styles.button, verifyOtpMutation.isPending && styles.buttonDisabled]}
                onPress={handleVerifyOtp}
                disabled={verifyOtpMutation.isPending}
              >
                {verifyOtpMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Verify OTP</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setOtpSent(false)} style={styles.backLink}>
                <Text style={styles.backLinkText}>Change number</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <TouchableOpacity onPress={() => router.push('/(auth)/register')} style={styles.registerLink}>
          <Text style={styles.registerLinkText}>New driver? Register here</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  header: { alignItems: 'center', marginBottom: 40 },
  logo: { fontSize: 56, marginBottom: 8 },
  title: { fontSize: 28, fontWeight: '700', color: '#DC2626' },
  subtitle: { fontSize: 14, color: '#6B7280', marginTop: 4 },
  form: { gap: 12 },
  label: { fontSize: 14, color: '#374151', fontWeight: '500' },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 52,
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
  },
  button: {
    backgroundColor: '#DC2626',
    borderRadius: 10,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  backLink: { alignItems: 'center', marginTop: 8 },
  backLinkText: { color: '#DC2626', fontSize: 14 },
  registerLink: { alignItems: 'center', marginTop: 32 },
  registerLinkText: { color: '#DC2626', fontSize: 15, fontWeight: '600' },
});
