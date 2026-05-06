import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiClient } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import type { UserProfile } from '@aks/shared';

interface SendOtpResponse {
  message: string;
}

interface VerifyOtpResponse {
  user: UserProfile;
  accessToken: string;
  refreshToken: string;
}

export default function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();

  const isValidPhone = phone.length === 10 && /^\d+$/.test(phone);
  const isValidOtp = otp.length === 6 && /^\d+$/.test(otp);

  async function handleSendOtp() {
    if (!isValidPhone) {
      Alert.alert('Invalid Phone', 'Please enter a valid 10-digit phone number.');
      return;
    }
    setLoading(true);
    try {
      await apiClient.post<SendOtpResponse>('/api/v1/auth/send-otp', { phone: `+91${phone}` });
      setOtpSent(true);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to send OTP. Please try again.';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (!isValidOtp) {
      Alert.alert('Invalid OTP', 'Please enter the 6-digit OTP.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiClient.post<VerifyOtpResponse>('/api/v1/auth/verify-otp', {
        phone: `+91${phone}`,
        otp,
      });
      const { user, accessToken, refreshToken } = res.data;
      await SecureStore.setItemAsync('accessToken', accessToken);
      await SecureStore.setItemAsync('refreshToken', refreshToken);
      await SecureStore.setItemAsync('user', JSON.stringify(user));
      setAuth(user, accessToken);
      router.replace('/(tabs)/home');
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Invalid OTP. Please try again.';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.inner}>
          {/* Brand */}
          <View style={styles.brandContainer}>
            <Text style={styles.brandEmoji}>🛒</Text>
            <Text style={styles.brandName}>Apni Kirana</Text>
            <Text style={styles.brandTagline}>Your neighbourhood store, delivered.</Text>
          </View>

          {/* Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{otpSent ? 'Enter OTP' : 'Login / Sign Up'}</Text>

            {/* Phone input */}
            <View style={styles.phoneRow}>
              <View style={styles.phonePrefix}>
                <Text style={styles.phonePrefixText}>+91</Text>
              </View>
              <TextInput
                style={styles.phoneInput}
                placeholder="10-digit mobile number"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
                maxLength={10}
                value={phone}
                onChangeText={(t) => setPhone(t.replace(/\D/g, ''))}
                editable={!otpSent}
              />
            </View>

            {/* OTP input */}
            {otpSent && (
              <View style={styles.otpContainer}>
                <Text style={styles.otpHint}>
                  OTP sent to +91 {phone}
                </Text>
                <TextInput
                  style={styles.otpInput}
                  placeholder="6-digit OTP"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                  maxLength={6}
                  value={otp}
                  onChangeText={(t) => setOtp(t.replace(/\D/g, ''))}
                  autoFocus
                />
              </View>
            )}

            {/* Primary button */}
            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
              onPress={otpSent ? handleVerifyOtp : handleSendOtp}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {otpSent ? 'Verify OTP' : 'Send OTP'}
                </Text>
              )}
            </TouchableOpacity>

            {/* Change number */}
            {otpSent && (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => {
                  setOtpSent(false);
                  setOtp('');
                }}
              >
                <Text style={styles.secondaryButtonText}>Change number</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.disclaimer}>
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F0FDF4',
  },
  container: {
    flex: 1,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 24,
  },
  brandContainer: {
    alignItems: 'center',
    gap: 6,
  },
  brandEmoji: {
    fontSize: 56,
  },
  brandName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#16A34A',
    letterSpacing: -0.5,
  },
  brandTagline: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    gap: 16,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  phoneRow: {
    flexDirection: 'row',
    borderWidth: 1.5,
    borderColor: '#D1FAE5',
    borderRadius: 10,
    overflow: 'hidden',
  },
  phonePrefix: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRightWidth: 1.5,
    borderRightColor: '#D1FAE5',
  },
  phonePrefixText: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '500',
  },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111827',
  },
  otpContainer: {
    gap: 8,
  },
  otpHint: {
    fontSize: 13,
    color: '#6B7280',
  },
  otpInput: {
    borderWidth: 1.5,
    borderColor: '#D1FAE5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 20,
    color: '#111827',
    letterSpacing: 8,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#16A34A',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: '#86EFAC',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: '#16A34A',
    fontSize: 14,
    fontWeight: '500',
  },
  disclaimer: {
    textAlign: 'center',
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 18,
  },
});
