import { useEffect, useRef } from 'react';
import { TextInput, View } from 'react-native';
import { authStyles } from '@/components/AuthScaffold';

/**
 * Six-box OTP entry. `value` is the joined 0–6 digit string; `onChange`
 * receives the updated joined string. Handles paste, auto-advance and
 * backspace-to-previous.
 */
export function OtpInput({
  value,
  onChange,
  autoFocus = true,
}: {
  value: string;
  onChange: (otp: string) => void;
  autoFocus?: boolean;
}) {
  const refs = useRef<Array<TextInput | null>>([]);
  const digits = value.padEnd(6, ' ').slice(0, 6).split('').map((c) => (c === ' ' ? '' : c));

  useEffect(() => {
    if (autoFocus) {
      const t = setTimeout(() => refs.current[0]?.focus(), 200);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);

  function setAt(index: number, raw: string) {
    const sanitized = raw.replace(/\D/g, '');
    const next = [...digits];

    if (sanitized.length > 1) {
      const chars = sanitized.slice(0, 6 - index).split('');
      chars.forEach((ch, i) => {
        next[index + i] = ch;
      });
      onChange(next.join('').trimEnd());
      refs.current[Math.min(index + chars.length, 5)]?.focus();
      return;
    }

    next[index] = sanitized;
    onChange(next.join('').replace(/\s/g, ''));
    if (sanitized && index < 5) refs.current[index + 1]?.focus();
  }

  function onKey(index: number, key: string) {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  }

  return (
    <View style={authStyles.otpRow}>
      {digits.map((digit, idx) => (
        <TextInput
          key={idx}
          ref={(r) => {
            refs.current[idx] = r;
          }}
          style={[authStyles.otpBox, digit ? authStyles.otpBoxFilled : null]}
          keyboardType="number-pad"
          maxLength={1}
          value={digit}
          onChangeText={(t) => setAt(idx, t)}
          onKeyPress={({ nativeEvent }) => onKey(idx, nativeEvent.key)}
          selectTextOnFocus
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
        />
      ))}
    </View>
  );
}
