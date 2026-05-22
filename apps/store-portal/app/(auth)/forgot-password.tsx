import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { AuthScaffold, authStyles } from '@/components/AuthScaffold';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { api } from '@/lib/api';
import { colors, spacing } from '@/constants/theme';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Enter a valid email address');
      setTimeout(() => setError(null), 4000);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.post('/api/v1/auth/forgot-password', { email: email.trim() });
      setSent(true);
    } catch {
      // The endpoint always succeeds generically; a network failure lands here.
      setError('Could not reach the server. Please try again.');
      setTimeout(() => setError(null), 4000);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScaffold>
      {sent ? (
        <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
          <Ionicons name="mail-unread-outline" size={56} color={colors.primary} />
          <Text style={[authStyles.title, { marginTop: spacing.lg, textAlign: 'center' }]}>
            Check your email
          </Text>
          <Text style={[authStyles.subtitle, { textAlign: 'center' }]}>
            If an account exists for {email.trim()}, we&apos;ve sent a link to reset your
            password. The link expires in 1 hour.
          </Text>
          <Button
            title="Back to login"
            onPress={() => router.replace('/(auth)/login')}
            fullWidth
            size="lg"
          />
        </View>
      ) : (
        <>
          <Text style={authStyles.title}>Forgot password</Text>
          <Text style={authStyles.subtitle}>
            Enter the email on your account and we&apos;ll send you a link to reset your
            password.
          </Text>

          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoFocus
            leftIcon="mail-outline"
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          <Button
            title="Send reset link"
            onPress={handleSubmit}
            loading={loading}
            disabled={!email.trim()}
            fullWidth
            size="lg"
            style={{ marginTop: spacing.lg }}
          />

          <TouchableOpacity style={authStyles.link} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={16} color={colors.primary} />
            <Text style={authStyles.linkText}>Back to login</Text>
          </TouchableOpacity>

          {error ? (
            <View style={authStyles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={colors.error} />
              <Text style={authStyles.errorText}>{error}</Text>
            </View>
          ) : null}
        </>
      )}
    </AuthScaffold>
  );
}
