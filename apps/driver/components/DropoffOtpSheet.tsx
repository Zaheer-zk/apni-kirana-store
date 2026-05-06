import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/Button';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';

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
      const t = setTimeout(() => inputs.current[0]?.focus(), 200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [visible]);

  // Backend contract: PUT /drivers/orders/:id/deliver with { dropoffOtp }
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
      setDigits(Array(OTP_LENGTH).fill(''));
      setTimeout(() => inputs.current[0]?.focus(), 50);
    },
  });

  const handleChange = (text: string, idx: number) => {
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
        <TouchableOpacity
          activeOpacity={1}
          style={styles.backdrop}
          onPress={onClose}
        />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconWrap}>
                <Ionicons name="lock-closed" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Confirm delivery</Text>
                <Text style={styles.subtitle}>
                  Ask the customer for their 4-digit OTP
                </Text>
              </View>
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onClose}
              hitSlop={12}
              disabled={verifyMutation.isPending}
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={26} color={colors.textSecondary} />
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
                  d ? styles.otpInputFilled : null,
                  error ? styles.otpInputError : null,
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

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Button
            variant="primary"
            size="lg"
            title="Verify & complete"
            icon="checkmark-circle"
            fullWidth
            onPress={handleSubmit}
            disabled={!otpComplete}
            loading={verifyMutation.isPending}
            style={styles.submitButton}
          />

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
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
    ...shadow.large,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.gray200,
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xxl,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  subtitle: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  otpInput: {
    flex: 1,
    height: 64,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    textAlign: 'center',
    fontSize: 26,
    fontWeight: '700',
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  otpInputFilled: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
  },
  otpInputError: { borderColor: colors.error, backgroundColor: colors.errorLight },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorLight,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  errorText: {
    flex: 1,
    color: colors.error,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  submitButton: { marginTop: spacing.lg },
  helperText: {
    marginTop: spacing.md,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 17,
  },
});

export default DropoffOtpSheet;
