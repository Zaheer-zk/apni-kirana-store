import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { apiClient } from '@/lib/api';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

// Reset-password deep link handler. The customer-web emails a link of the
// form `https://quickeasymart.com/reset-password?token=…`. The Expo app
// has a deep link scheme `apni-kirana://reset-password?token=…` and uses
// universal links for the same web URL, both of which open this screen.
//
// Mirrors apps/customer-web/app/reset-password/page.tsx — same backend
// endpoints (/auth/reset-password/validate and /auth/reset-password).

type Stage = 'checking' | 'invalid' | 'form' | 'done';

function unwrap<T>(payload: unknown): T | null {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return (payload as T) ?? null;
}

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const token = useMemo(() => (params.token ?? '').toString(), [params.token]);

  const [stage, setStage] = useState<Stage>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setStage('invalid');
      return;
    }
    apiClient
      .get(
        `/api/v1/auth/reset-password/validate?token=${encodeURIComponent(token)}`,
      )
      .then((res) => {
        if (cancelled) return;
        const data = unwrap<{ valid: boolean }>(res.data);
        setStage(data?.valid ? 'form' : 'invalid');
      })
      .catch(() => {
        if (!cancelled) setStage('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit() {
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post('/api/v1/auth/reset-password', {
        token,
        newPassword: password,
      });
      setStage('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reset your password');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Reset password' }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {stage === 'checking' ? (
            <Card style={styles.center}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.centerText}>Checking your reset link…</Text>
            </Card>
          ) : null}

          {stage === 'invalid' ? (
            <Card style={styles.center}>
              <View style={styles.iconWrap}>
                <Ionicons name="close-circle" size={36} color={colors.error} />
              </View>
              <Text style={styles.headlineError}>Link expired</Text>
              <Text style={styles.centerText}>
                Reset links expire after 1 hour. Request a new one and try again.
              </Text>
              <Button
                variant="primary"
                title="Request a new link"
                onPress={() => router.replace('/(auth)/forgot-password' as never)}
                style={{ marginTop: spacing.md }}
              />
            </Card>
          ) : null}

          {stage === 'form' ? (
            <Card style={styles.formCard}>
              <View style={styles.iconWrap}>
                <Ionicons name="lock-closed" size={32} color={colors.primary} />
              </View>
              <Text style={styles.headline}>Choose a new password</Text>
              <Text style={styles.centerText}>
                Make it at least 8 characters. You&apos;ll be signed in after the reset.
              </Text>

              <View style={styles.field}>
                <Text style={styles.label}>New password</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  placeholderTextColor={colors.textMuted}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Confirm password</Text>
                <TextInput
                  style={styles.input}
                  value={confirm}
                  onChangeText={setConfirm}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="new-password"
                  placeholder="Re-type your new password"
                  placeholderTextColor={colors.textMuted}
                />
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Button
                variant="primary"
                title="Reset password"
                fullWidth
                loading={submitting}
                disabled={submitting}
                onPress={handleSubmit}
                style={{ marginTop: spacing.md }}
              />
            </Card>
          ) : null}

          {stage === 'done' ? (
            <Card style={styles.center}>
              <View style={[styles.iconWrap, { backgroundColor: colors.successLight }]}>
                <Ionicons name="checkmark-circle" size={36} color={colors.success} />
              </View>
              <Text style={styles.headline}>Password updated</Text>
              <Text style={styles.centerText}>
                You can now sign in with your new password.
              </Text>
              <Button
                variant="primary"
                title="Continue to sign in"
                onPress={() => router.replace('/(auth)/login' as never)}
                style={{ marginTop: spacing.md }}
              />
            </Card>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg, paddingTop: spacing.xxxl },
  center: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  centerText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  headline: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  headlineError: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.error,
    textAlign: 'center',
  },
  formCard: { padding: spacing.xl, gap: spacing.md, alignItems: 'stretch' },
  field: { gap: 6 },
  label: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textSecondary },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    backgroundColor: colors.white,
  },
  errorText: {
    fontSize: fontSize.xs,
    color: colors.error,
    marginTop: -spacing.sm,
    textAlign: 'center',
  },
});
