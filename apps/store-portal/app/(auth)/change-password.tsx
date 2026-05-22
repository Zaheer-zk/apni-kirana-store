import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { AuthScaffold, authStyles } from '@/components/AuthScaffold';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { api } from '@/lib/api';
import { colors, spacing } from '@/constants/theme';

/**
 * Force-password-change screen. Admin-created accounts log in with a temporary
 * password and land here (`mustChangePassword`) before reaching the app.
 * `next` is the route to continue to once the password is set.
 */
export default function ChangePasswordScreen() {
  const { next } = useLocalSearchParams<{ next?: string }>();

  const [current, setCurrent] = useState('');
  const [next1, setNext1] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function showError(message: string) {
    setError(message);
    setTimeout(() => setError(null), 4500);
  }

  async function handleSubmit() {
    if (!current) return showError('Enter your current (temporary) password');
    if (next1.length < 8) return showError('New password must be at least 8 characters');
    if (next1 !== confirm) return showError('The two passwords do not match');

    setLoading(true);
    setError(null);
    try {
      await api.post('/api/v1/auth/change-password', {
        currentPassword: current,
        newPassword: next1,
      });
      router.replace(((next as string) || '/(tabs)/dashboard') as never);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      showError(e.response?.data?.error ?? 'Could not change your password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScaffold>
      <Text style={authStyles.title}>Set a new password</Text>
      <Text style={authStyles.subtitle}>
        For your security, please replace your temporary password before continuing.
      </Text>

      <Input
        label="Current password"
        value={current}
        onChangeText={setCurrent}
        placeholder="Temporary password"
        secureTextEntry
        leftIcon="lock-closed-outline"
      />
      <Input
        label="New password"
        value={next1}
        onChangeText={setNext1}
        placeholder="At least 8 characters"
        secureTextEntry
        leftIcon="key-outline"
      />
      <Input
        label="Confirm new password"
        value={confirm}
        onChangeText={setConfirm}
        placeholder="Re-enter the new password"
        secureTextEntry
        leftIcon="key-outline"
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
      />

      <Button
        title="Save & continue"
        onPress={handleSubmit}
        loading={loading}
        fullWidth
        size="lg"
        style={{ marginTop: spacing.lg }}
      />

      {error ? (
        <View style={authStyles.errorBox}>
          <Ionicons name="alert-circle" size={18} color={colors.error} />
          <Text style={authStyles.errorText}>{error}</Text>
        </View>
      ) : null}
    </AuthScaffold>
  );
}
