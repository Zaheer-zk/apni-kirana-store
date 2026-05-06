import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Props {
  orderId: string;
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const OTP_LENGTH = 4;

export function DropoffOtpSheet({ orderId, visible, onClose, onSuccess }: Props) {
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<Array<TextInput | null>>([]);

  const otp = digits.join('');
  const otpComplete = otp.length === OTP_LENGTH && digits.every((d) => d !== '');

  // Reset internal state every time the sheet opens fresh.
  useEffect(() => {
    if (visible) {
      setDigits(Array(OTP_LENGTH).fill(''));
      setError(null);
      // Focus the first input after a frame so the modal has mounted.
      const t = setTimeout(() => inputs.current[0]?.focus(), 200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [visible]);

  const verifyMutation = useMutation({
    mutationFn: (dropoffOtp: string) =>
      api
        .put(`/api/v1/drivers/orders/${orderId}/deliver`, { dropoffOtp })
        .then((r) => r.data),
    onSuccess: () => {
      setError(null);
      onSuccess();
    },
    onError: (err: Error) => {
      const msg = err.message || 'Could not verify OTP';
      if (/incorrect.*otp|otp.*incorrect|wrong/i.test(msg)) {
        setError('Incorrect OTP. Please ask the customer and try again.');
      } else {
        setError(msg);
      }
      // Clear digits so driver can re-enter cleanly.
      setDigits(Array(OTP_LENGTH).fill(''));
      setTimeout(() => inputs.current[0]?.focus(), 50);
    },
  });

  const handleChange = (text: string, idx: number) => {
    // Allow only digits. If user pasted multiple, distribute them.
    const cleaned = text.replace(/[^0-9]/g, '');
    if (!cleaned) {
      const next = [...digits];
      next[idx] = '';
      setDigits(next);
      return;
    }
    if (cleaned.length === 1) {
      const next = [...digits];
      next[idx] = cleaned;
      setDigits(next);
      if (idx < OTP_LENGTH - 1) inputs.current[idx + 1]?.focus();
    } else {
      // Pasted full code
      const next = [...digits];
      const chars = cleaned.slice(0, OTP_LENGTH).split('');
      for (let i = 0; i < OTP_LENGTH; i++) {
        next[i] = chars[i] ?? '';
      }
      setDigits(next);
      inputs.current[Math.min(chars.length, OTP_LENGTH - 1)]?.focus();
    }
    if (error) setError(null);
  };

  const handleKeyPress = (key: string, idx: number) => {
    if (key === 'Backspace' && !digits[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus();
      const next = [...digits];
      next[idx - 1] = '';
      setDigits(next);
    }
  };

  const handleSubmit = () => {
    if (!otpComplete || verifyMutation.isPending) return;
    verifyMutation.mutate(otp);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.backdrop} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconWrap}>
                <Ionicons name="lock-closed" size={20} color="#DC2626" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Confirm Delivery</Text>
                <Text style={styles.subtitle}>
                  Ask the customer for their 4-digit OTP
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={12}
              disabled={verifyMutation.isPending}
            >
              <Ionicons name="close" size={26} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <View style={styles.otpRow}>
            {digits.map((d, idx) => (
              <TextInput
                key={idx}
                ref={(el) => {
                  inputs.current[idx] = el;
                }}
                style={[
                  styles.otpInput,
                  error ? styles.otpInputError : null,
                  d ? styles.otpInputFilled : null,
                ]}
                value={d}
                onChangeText={(t) => handleChange(t, idx)}
                onKeyPress={(e) => handleKeyPress(e.nativeEvent.key, idx)}
                keyboardType="number-pad"
                maxLength={1}
                returnKeyType="done"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                editable={!verifyMutation.isPending}
                selectTextOnFocus
              />
            ))}
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[
              styles.submitButton,
              (!otpComplete || verifyMutation.isPending) && styles.submitButtonDisabled,
            ]}
            disabled={!otpComplete || verifyMutation.isPending}
            onPress={handleSubmit}
          >
            {verifyMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Verify & complete</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.helperText}>
            Without the customer's OTP, you can't mark this order as delivered.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 14,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E5E7EB',
    marginBottom: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  otpInput: {
    flex: 1,
    height: 64,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    textAlign: 'center',
    fontSize: 26,
    fontWeight: '700',
    color: '#111827',
    backgroundColor: '#F9FAFB',
  },
  otpInputFilled: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  otpInputError: { borderColor: '#DC2626', backgroundColor: '#FEE2E2' },
  errorText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 4,
    textAlign: 'center',
  },
  submitButton: {
    marginTop: 18,
    height: 54,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: { backgroundColor: '#FCA5A5' },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  helperText: {
    marginTop: 12,
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 17,
  },
});

export default DropoffOtpSheet;
