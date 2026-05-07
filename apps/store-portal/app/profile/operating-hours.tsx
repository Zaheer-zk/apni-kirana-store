import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useStorePortalStore } from '@/store/store.store';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export default function OperatingHoursScreen() {
  const { storeProfile, setStoreProfile } = useStorePortalStore();

  // If the in-memory profile is missing (e.g. fresh login, SecureStore cleared),
  // fall back to fetching from the backend so we always have a store id.
  useQuery({
    queryKey: ['storeProfile'],
    enabled: !storeProfile?.id,
    queryFn: async () => {
      const res = await api.get<{ data?: any } | any>('/api/v1/stores/me');
      const store = (res.data as { data?: any }).data ?? res.data;
      if (store) setStoreProfile(store);
      return store;
    },
  });

  const initialOpen =
    (storeProfile as any)?.openTime ??
    (storeProfile as any)?.openingTime ??
    storeProfile?.operatingHours?.open ??
    '09:00';
  const initialClose =
    (storeProfile as any)?.closeTime ??
    (storeProfile as any)?.closingTime ??
    storeProfile?.operatingHours?.close ??
    '21:00';

  const [openTime, setOpenTime] = useState<string>(initialOpen);
  const [closeTime, setCloseTime] = useState<string>(initialClose);
  const [isAlwaysOpen, setIsAlwaysOpen] = useState<boolean>(
    initialOpen === '00:00' && initialClose === '23:59'
  );
  const [errors, setErrors] = useState<{ open?: string; close?: string }>({});

  const handleAlwaysOpenToggle = (value: boolean) => {
    setIsAlwaysOpen(value);
    if (value) {
      setOpenTime('00:00');
      setCloseTime('23:59');
      setErrors({});
    }
  };

  const validate = (): boolean => {
    const next: { open?: string; close?: string } = {};
    if (!TIME_REGEX.test(openTime)) next.open = 'Use HH:MM (24h) format';
    if (!TIME_REGEX.test(closeTime)) next.close = 'Use HH:MM (24h) format';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      const id = storeProfile?.id;
      if (!id) throw new Error('Store id missing');
      const res = await api.put(`/api/v1/stores/${id}`, {
        openTime,
        closeTime,
      });
      return res.data;
    },
    onSuccess: (data) => {
      const next = {
        ...(storeProfile as any),
        ...(data ?? {}),
        openTime,
        closeTime,
        operatingHours: { open: openTime, close: closeTime },
      };
      setStoreProfile(next);
      Alert.alert('Saved', 'Operating hours updated');
      router.back();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const onSave = () => {
    if (!validate()) return;
    updateMutation.mutate();
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Card padding={spacing.lg}>
          <View style={styles.row}>
            <View style={styles.rowIconWrap}>
              <Ionicons name="moon-outline" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>24/7 store</Text>
              <Text style={styles.rowSubtitle}>Open all day, every day</Text>
            </View>
            <Switch
              value={isAlwaysOpen}
              onValueChange={handleAlwaysOpenToggle}
              trackColor={{ false: colors.gray300, true: colors.primaryLight }}
              thumbColor={isAlwaysOpen ? colors.primary : colors.gray400}
            />
          </View>
        </Card>

        <View style={[styles.formGroup, isAlwaysOpen && { opacity: 0.55 }]}>
          <Input
            label="Opening time"
            value={openTime}
            onChangeText={(v) => {
              setOpenTime(v);
              if (isAlwaysOpen) setIsAlwaysOpen(false);
              if (errors.open) setErrors({ ...errors, open: undefined });
            }}
            placeholder="HH:MM (e.g. 09:00)"
            keyboardType="numbers-and-punctuation"
            editable={!isAlwaysOpen}
            error={errors.open}
            leftIcon="sunny-outline"
          />
          <Input
            label="Closing time"
            value={closeTime}
            onChangeText={(v) => {
              setCloseTime(v);
              if (isAlwaysOpen) setIsAlwaysOpen(false);
              if (errors.close) setErrors({ ...errors, close: undefined });
            }}
            placeholder="HH:MM (e.g. 21:00)"
            keyboardType="numbers-and-punctuation"
            editable={!isAlwaysOpen}
            error={errors.close}
            leftIcon="moon-outline"
          />
        </View>

        <View style={styles.helpBox}>
          <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
          <Text style={styles.helpText}>
            Times are in 24-hour format. Customers will see your store as
            "closed" outside these hours.
          </Text>
        </View>

        <Button
          title="Save changes"
          icon="save-outline"
          onPress={onSave}
          loading={updateMutation.isPending}
          disabled={updateMutation.isPending}
          fullWidth
          size="lg"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 100, paddingBottom: spacing.xxxl, gap: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  rowSubtitle: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  formGroup: { gap: spacing.lg },
  helpBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  helpText: { flex: 1, fontSize: fontSize.sm, color: colors.primaryDark, lineHeight: 18 },
});
