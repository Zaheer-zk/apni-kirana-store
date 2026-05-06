import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStorePortalStore } from '@/store/store.store';

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

interface MenuRowProps {
  icon: string;
  title: string;
  onPress: () => void;
}

function MenuRow({ icon, title, onPress }: MenuRowProps) {
  return (
    <TouchableOpacity style={styles.menuRow} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.menuIcon}>{icon}</Text>
      <Text style={styles.menuTitle}>{title}</Text>
      <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
    </TouchableOpacity>
  );
}

export default function StoreProfileScreen() {
  const { user, storeProfile, clearAuth } = useStorePortalStore();

  const openTime =
    (storeProfile as any)?.openTime ??
    (storeProfile as any)?.openingTime ??
    storeProfile?.operatingHours?.open ??
    '—';
  const closeTime =
    (storeProfile as any)?.closeTime ??
    (storeProfile as any)?.closingTime ??
    storeProfile?.operatingHours?.close ??
    '—';

  const addr = (storeProfile as any)?.address;
  const addressObj =
    typeof addr === 'object' && addr !== null
      ? addr
      : { street: '—', city: '—', state: '—', pincode: '—' };

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
            <InfoRow label="Status" value={storeProfile?.status ?? '—'} />
            <View style={styles.divider} />
            <InfoRow label="Hours" value={`${openTime} – ${closeTime}`} />
          </View>
        </View>

        {/* Address */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Address</Text>
          <View style={styles.card}>
            <InfoRow label="Street" value={addressObj.street ?? '—'} />
            <View style={styles.divider} />
            <InfoRow label="City" value={addressObj.city ?? '—'} />
            <View style={styles.divider} />
            <InfoRow label="State" value={addressObj.state ?? '—'} />
            <View style={styles.divider} />
            <InfoRow label="Pincode" value={addressObj.pincode ?? '—'} />
          </View>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settings</Text>
          <View style={styles.card}>
            <MenuRow
              icon="🕐"
              title="Operating hours"
              onPress={() => router.push('/profile/operating-hours')}
            />
            <View style={styles.divider} />
            <MenuRow
              icon="✏️"
              title="Edit store profile"
              onPress={() => router.push('/profile/edit')}
            />
            <View style={styles.divider} />
            <MenuRow
              icon="🔔"
              title="Notifications"
              onPress={() => router.push('/profile/notifications')}
            />
          </View>
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
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
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
  infoValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
    maxWidth: '55%',
    textAlign: 'right',
  },
  divider: { height: 1, backgroundColor: '#F3F4F6' },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  menuIcon: { fontSize: 18, marginRight: 12 },
  menuTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111827' },
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
