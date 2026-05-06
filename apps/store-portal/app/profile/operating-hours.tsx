import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useStorePortalStore } from '@/store/store.store';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export default function OperatingHoursScreen() {
  const { storeProfile, setStoreProfile } = useStorePortalStore();

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
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Operating Hours</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>24/7 store</Text>
              <Text style={styles.rowSubtitle}>
                Open all day, every day
              </Text>
            </View>
            <Switch
              value={isAlwaysOpen}
              onValueChange={handleAlwaysOpenToggle}
              trackColor={{ true: '#2563EB', false: '#D1D5DB' }}
              thumbColor="#fff"
            />
          </View>
        </View>

        <View style={[styles.card, isAlwaysOpen && styles.cardDisabled]}>
          <Text style={styles.label}>Opening time</Text>
          <TextInput
            style={[styles.input, errors.open && styles.inputError]}
            value={openTime}
            onChangeText={(v) => {
              setOpenTime(v);
              if (isAlwaysOpen) setIsAlwaysOpen(false);
            }}
            placeholder="HH:MM (e.g. 09:00)"
            keyboardType="numbers-and-punctuation"
            editable={!isAlwaysOpen}
            placeholderTextColor="#9CA3AF"
          />
          {errors.open && <Text style={styles.errorText}>{errors.open}</Text>}

          <Text style={[styles.label, { marginTop: 16 }]}>Closing time</Text>
          <TextInput
            style={[styles.input, errors.close && styles.inputError]}
            value={closeTime}
            onChangeText={(v) => {
              setCloseTime(v);
              if (isAlwaysOpen) setIsAlwaysOpen(false);
            }}
            placeholder="HH:MM (e.g. 21:00)"
            keyboardType="numbers-and-punctuation"
            editable={!isAlwaysOpen}
            placeholderTextColor="#9CA3AF"
          />
          {errors.close && <Text style={styles.errorText}>{errors.close}</Text>}
        </View>

        <View style={styles.helpBox}>
          <Ionicons name="information-circle-outline" size={18} color="#2563EB" />
          <Text style={styles.helpText}>
            Times are in 24-hour format. Customers will see your store as
            "closed" outside these hours.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, updateMutation.isPending && styles.saveBtnDisabled]}
          onPress={onSave}
          disabled={updateMutation.isPending}
        >
          {updateMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Save changes</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerBtn: { width: 40, alignItems: 'flex-start' },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardDisabled: { opacity: 0.55 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  rowSubtitle: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#fff',
  },
  inputError: { borderColor: '#DC2626' },
  errorText: { color: '#DC2626', fontSize: 12, marginTop: 4 },
  helpBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 24,
  },
  helpText: { flex: 1, fontSize: 13, color: '#1E40AF', lineHeight: 18 },
  saveBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
