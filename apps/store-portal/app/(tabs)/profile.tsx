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
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useStorePortalStore } from '@/store/store.store';

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function StoreProfileScreen() {
  const { user, storeProfile, clearAuth, setStoreProfile } = useStorePortalStore();
  const queryClient = useQueryClient();

  const [editingHours, setEditingHours] = useState(false);
  const [openingTime, setOpeningTime] = useState(storeProfile?.openingTime ?? '09:00');
  const [closingTime, setClosingTime] = useState(storeProfile?.closingTime ?? '21:00');

  const updateHoursMutation = useMutation({
    mutationFn: () =>
      api
        .put('/api/v1/stores/hours', { openingTime, closingTime })
        .then((r) => r.data),
    onSuccess: (data) => {
      setStoreProfile({ ...storeProfile!, openingTime, closingTime });
      setEditingHours(false);
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await SecureStore.deleteItemAsync('accessToken');
          await SecureStore.deleteItemAsync('user');
          await SecureStore.deleteItemAsync('storeProfile');
          clearAuth();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.pageTitle}>Store Profile</Text>

        {/* Store Avatar */}
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {storeProfile?.name?.charAt(0).toUpperCase() ?? '?'}
            </Text>
          </View>
          <Text style={styles.storeName}>{storeProfile?.name ?? 'My Store'}</Text>
          <Text style={styles.storeCategory}>{storeProfile?.category ?? ''}</Text>
        </View>

        {/* Store Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Store Information</Text>
          <View style={styles.card}>
            <InfoRow label="Store Name" value={storeProfile?.name ?? '—'} />
            <View style={styles.divider} />
            <InfoRow label="Category" value={storeProfile?.category ?? '—'} />
            <View style={styles.divider} />
            <InfoRow
              label="Status"
              value={storeProfile?.status ?? '—'}
            />
          </View>
        </View>

        {/* Address */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Address</Text>
          <View style={styles.card}>
            <InfoRow label="Street" value={storeProfile?.address?.street ?? '—'} />
            <View style={styles.divider} />
            <InfoRow label="City" value={storeProfile?.address?.city ?? '—'} />
            <View style={styles.divider} />
            <InfoRow label="State" value={storeProfile?.address?.state ?? '—'} />
            <View style={styles.divider} />
            <InfoRow label="Pincode" value={storeProfile?.address?.pincode ?? '—'} />
          </View>
        </View>

        {/* Operating Hours */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Operating Hours</Text>
            <TouchableOpacity onPress={() => setEditingHours(!editingHours)}>
              <Text style={styles.editLink}>{editingHours ? 'Cancel' : 'Edit'}</Text>
            </TouchableOpacity>
          </View>

          {editingHours ? (
            <View style={styles.card}>
              <View style={styles.hoursEditRow}>
                <View style={styles.hoursField}>
                  <Text style={styles.hoursLabel}>Opening</Text>
                  <TextInput
                    style={styles.hoursInput}
                    value={openingTime}
                    onChangeText={setOpeningTime}
                    placeholder="HH:MM"
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
                <Text style={styles.hoursDash}>—</Text>
                <View style={styles.hoursField}>
                  <Text style={styles.hoursLabel}>Closing</Text>
                  <TextInput
                    style={styles.hoursInput}
                    value={closingTime}
                    onChangeText={setClosingTime}
                    placeholder="HH:MM"
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              </View>
              <TouchableOpacity
                style={[styles.saveButton, updateHoursMutation.isPending && styles.saveButtonDisabled]}
                onPress={() => updateHoursMutation.mutate()}
                disabled={updateHoursMutation.isPending}
              >
                {updateHoursMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>Save Hours</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.card}>
              <InfoRow
                label="Hours"
                value={`${storeProfile?.openingTime ?? '—'} – ${storeProfile?.closingTime ?? '—'}`}
              />
            </View>
          )}
        </View>

        {/* Account */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.card}>
            <InfoRow label="Owner" value={user?.name ?? '—'} />
            <View style={styles.divider} />
            <InfoRow label="Phone" value={user?.phone ?? '—'} />
            <View style={styles.divider} />
            <InfoRow
              label="Member Since"
              value={
                user?.createdAt
                  ? new Date(user.createdAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })
                  : '—'
              }
            />
          </View>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  pageTitle: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 24 },
  avatarContainer: { alignItems: 'center', marginBottom: 32 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: { fontSize: 36, color: '#fff', fontWeight: '800' },
  storeName: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 4 },
  storeCategory: { fontSize: 14, color: '#6B7280' },
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  editLink: { fontSize: 14, color: '#2563EB', fontWeight: '600' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  infoLabel: { fontSize: 14, color: '#6B7280' },
  infoValue: { fontSize: 14, color: '#111827', fontWeight: '600', maxWidth: '55%', textAlign: 'right' },
  divider: { height: 1, backgroundColor: '#F3F4F6' },
  hoursEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  hoursField: { flex: 1 },
  hoursLabel: { fontSize: 12, color: '#9CA3AF', marginBottom: 4, fontWeight: '600' },
  hoursInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
    fontSize: 15,
    color: '#111827',
  },
  hoursDash: { fontSize: 18, color: '#D1D5DB', marginTop: 16 },
  saveButton: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 14,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  logoutButton: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
  },
  logoutButtonText: { color: '#DC2626', fontSize: 16, fontWeight: '700' },
});
