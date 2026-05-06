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
import { useDriverStore } from '@/store/driver.store';
import { stopLocationTracking } from '@/lib/location';

function StarRating({ rating }: { rating: number }) {
  const stars = Array.from({ length: 5 }, (_, i) => i + 1);
  return (
    <View style={styles.starsRow}>
      {stars.map((star) => (
        <Text key={star} style={[styles.star, star <= Math.round(rating) && styles.starFilled]}>
          ★
        </Text>
      ))}
      <Text style={styles.ratingNumber}>{rating.toFixed(1)}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function MenuRow({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.menuRow} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.menuIcon}>{icon}</Text>
      <Text style={styles.menuLabel}>{label}</Text>
      <Text style={styles.menuChevron}>›</Text>
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const { user, driverProfile, clearAuth } = useDriverStore();

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await stopLocationTracking();
          await SecureStore.deleteItemAsync('accessToken');
          await SecureStore.deleteItemAsync('user');
          await SecureStore.deleteItemAsync('driverProfile');
          clearAuth();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const vehicleLabel: Record<string, string> = {
    BIKE: '🚲 Bike',
    SCOOTER: '🛵 Scooter',
    CAR: '🚗 Car',
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.pageTitle}>My Profile</Text>

        {/* Avatar */}
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.name?.charAt(0).toUpperCase() ?? '?'}
            </Text>
          </View>
          <Text style={styles.userName}>{user?.name ?? 'Driver'}</Text>
          <Text style={styles.userPhone}>{user?.phone ?? ''}</Text>
          {driverProfile?.rating !== undefined && (
            <StarRating rating={driverProfile.rating} />
          )}
        </View>

        {/* Driver Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vehicle Information</Text>
          <View style={styles.card}>
            <InfoRow
              label="Vehicle Type"
              value={vehicleLabel[driverProfile?.vehicleType ?? ''] ?? driverProfile?.vehicleType ?? '—'}
            />
            <View style={styles.divider} />
            <InfoRow label="Vehicle Number" value={driverProfile?.vehicleNumber ?? '—'} />
            <View style={styles.divider} />
            <InfoRow label="License Number" value={driverProfile?.licenseNumber ?? '—'} />
          </View>
        </View>

        {/* Account Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.card}>
            <InfoRow label="Role" value="Driver" />
            <View style={styles.divider} />
            <InfoRow
              label="Status"
              value={driverProfile?.status ?? '—'}
            />
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

        {/* Menu */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>More</Text>
          <View style={styles.card}>
            <MenuRow
              icon="⭐"
              label="My Ratings"
              onPress={() => router.push('/profile/ratings')}
            />
            <View style={styles.divider} />
            <MenuRow
              icon="💬"
              label="Help & Support"
              onPress={() => router.push('/profile/help')}
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
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: { fontSize: 36, color: '#fff', fontWeight: '800' },
  userName: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 4 },
  userPhone: { fontSize: 15, color: '#6B7280', marginBottom: 10 },
  starsRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  star: { fontSize: 22, color: '#D1D5DB' },
  starFilled: { color: '#F59E0B' },
  ratingNumber: { fontSize: 15, color: '#6B7280', fontWeight: '600', marginLeft: 6 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#6B7280', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
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
  logoutButton: {
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  logoutButtonText: { color: '#DC2626', fontSize: 16, fontWeight: '700' },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  menuIcon: { fontSize: 20 },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111827' },
  menuChevron: { fontSize: 22, color: '#9CA3AF', fontWeight: '600' },
});
