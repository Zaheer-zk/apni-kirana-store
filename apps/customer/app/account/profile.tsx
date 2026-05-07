import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Header } from '@/components/Header';
import { Input } from '@/components/Input';
import { apiClient } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';
import type { UserProfile } from '@aks/shared';

function unwrap<T>(payload: unknown): T | null {
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    if (o.data && typeof o.data === 'object') return o.data as T;
    return o as T;
  }
  return null;
}

export default function EditProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const accessToken = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();

  const [name, setName] = useState(user?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Name cannot be empty');
      const res = await apiClient.put('/api/v1/users/me', { name: trimmed });
      return unwrap<UserProfile>(res.data);
    },
    onSuccess: async (updated) => {
      if (updated && accessToken) {
        const merged: UserProfile = {
          ...(user as UserProfile),
          ...updated,
        };
        await SecureStore.setItemAsync('user', JSON.stringify(merged));
        setAuth(merged, accessToken);
      }
      qc.invalidateQueries({ queryKey: ['me'] });
      setSuccess('Profile updated');
      setTimeout(() => setSuccess(null), 2500);
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Update failed');
    },
  });

  function handleSave() {
    setError(null);
    setSuccess(null);
    updateMutation.mutate();
  }

  return (
    // Android: include left/right edges so the custom Header respects display cutouts
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <Header title="Edit Profile" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        // 'height' on Android plays nicely with windowSoftInputMode=pan; 'padding' breaks layout
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={20}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.avatarBlock}>
            <Avatar name={name || user?.name} size={96} />
            <Text style={styles.userName}>{name || user?.name || 'Customer'}</Text>
            <Text style={styles.userPhone}>{user?.phone}</Text>
          </View>

          <View style={styles.formCard}>
            <Input
              label="Full name"
              value={name}
              onChangeText={setName}
              placeholder="Your full name"
              maxLength={100}
              autoCapitalize="words"
            />

            <View style={{ height: spacing.lg }} />

            <View>
              <Text style={styles.fieldLabel}>Phone</Text>
              <View style={styles.readonlyField}>
                <Ionicons name="call" size={18} color={colors.textSecondary} />
                <Text style={styles.readonlyText}>+91 {user?.phone}</Text>
                <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
              </View>
              <Text style={styles.fieldHint}>Phone cannot be changed</Text>
            </View>
          </View>

          {error ? (
            <View style={styles.alert}>
              <Ionicons name="alert-circle" size={18} color={colors.error} />
              <Text style={[styles.alertText, { color: colors.error }]}>{error}</Text>
            </View>
          ) : null}

          {success ? (
            <View style={[styles.alert, { backgroundColor: colors.successLight }]}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={[styles.alertText, { color: colors.success }]}>{success}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.bottomBar}>
          <Button
            title="Save changes"
            onPress={handleSave}
            loading={updateMutation.isPending}
            fullWidth
            size="lg"
            icon="save-outline"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    paddingBottom: spacing.xxxl,
  },
  avatarBlock: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  userName: {
    marginTop: spacing.md,
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  userPhone: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  formCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.small,
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  readonlyField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.gray100,
    paddingHorizontal: spacing.md,
    minHeight: 50,
    borderRadius: radius.md,
  },
  readonlyText: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  fieldHint: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  alert: {
    margin: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.errorLight,
    borderRadius: radius.md,
  },
  alertText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  bottomBar: {
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
