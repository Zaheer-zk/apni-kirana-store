import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiClient } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { useCartStore } from '@/store/cart.store';
import type { Address } from '@aks/shared';
import Constants from 'expo-constants';

async function fetchAddresses(): Promise<Address[]> {
  const res = await apiClient.get<{ data: Address[] }>('/api/v1/addresses');
  return res.data.data ?? [];
}

function AddressRow({ address }: { address: Address }) {
  return (
    <View style={styles.addressRow}>
      <View style={styles.addressIconContainer}>
        <Text style={styles.addressIcon}>
          {address.label.toLowerCase().includes('home')
            ? '🏠'
            : address.label.toLowerCase().includes('work')
            ? '💼'
            : '📍'}
        </Text>
      </View>
      <View style={styles.addressText}>
        <View style={styles.addressLabelRow}>
          <Text style={styles.addressLabel}>{address.label}</Text>
          {address.isDefault && (
            <View style={styles.defaultBadge}>
              <Text style={styles.defaultBadgeText}>Default</Text>
            </View>
          )}
        </View>
        <Text style={styles.addressStreet} numberOfLines={2}>
          {address.street}, {address.city} — {address.pincode}
        </Text>
      </View>
    </View>
  );
}

function MenuItem({
  emoji,
  label,
  onPress,
  danger,
}: {
  emoji: string;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.menuEmoji}>{emoji}</Text>
      <Text style={[styles.menuLabel, danger && styles.menuLabelDanger]}>{label}</Text>
      <Text style={styles.menuChevron}>›</Text>
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const { user, clearAuth } = useAuthStore();
  const { clearCart } = useCartStore();

  const { data: addresses, isLoading: addressesLoading } = useQuery({
    queryKey: ['addresses'],
    queryFn: fetchAddresses,
    enabled: !!user,
  });

  function handleLogout() {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await SecureStore.deleteItemAsync('accessToken');
          await SecureStore.deleteItemAsync('refreshToken');
          await SecureStore.deleteItemAsync('user');
          clearAuth();
          clearCart();
          router.replace('/(auth)/login');
        },
      },
    ]);
  }

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={[]}
        renderItem={null}
        ListHeaderComponent={
          <>
            {/* Profile card */}
            <View style={styles.profileCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {user?.name ? user.name[0].toUpperCase() : 'U'}
                </Text>
              </View>
              <View>
                <Text style={styles.userName}>{user?.name ?? 'User'}</Text>
                <Text style={styles.phone}>{user?.phone ?? ''}</Text>
              </View>
            </View>

            {/* Saved Addresses */}
            <Text style={styles.sectionTitle}>Saved Addresses</Text>
            <View style={styles.card}>
              {addressesLoading ? (
                <Text style={styles.loadingText}>Loading addresses…</Text>
              ) : addresses && addresses.length > 0 ? (
                addresses.map((addr) => <AddressRow key={addr.id} address={addr} />)
              ) : (
                <Text style={styles.emptyText}>No saved addresses.</Text>
              )}
              <TouchableOpacity
                style={styles.addAddressButton}
                onPress={() => {
                  /* navigate to add address screen */
                }}
              >
                <Text style={styles.addAddressText}>+ Add New Address</Text>
              </TouchableOpacity>
            </View>

            {/* Menu */}
            <Text style={styles.sectionTitle}>More</Text>
            <View style={styles.card}>
              <MenuItem
                emoji="🛒"
                label="My Orders"
                onPress={() => router.push('/(tabs)/orders')}
              />
              <View style={styles.divider} />
              <MenuItem
                emoji="🔔"
                label="Notifications"
                onPress={() => {
                  /* navigate */
                }}
              />
              <View style={styles.divider} />
              <MenuItem
                emoji="🆘"
                label="Help & Support"
                onPress={() => {
                  /* navigate */
                }}
              />
              <View style={styles.divider} />
              <MenuItem
                emoji="🚪"
                label="Logout"
                onPress={handleLogout}
                danger
              />
            </View>

            {/* App version */}
            <Text style={styles.version}>Apni Kirana v{appVersion}</Text>
          </>
        }
        contentContainerStyle={styles.container}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  container: {
    paddingBottom: 32,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 20,
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    gap: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#16A34A',
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  phone: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    marginBottom: 8,
    marginTop: 8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 16,
    overflow: 'hidden',
  },
  addressRow: {
    flexDirection: 'row',
    padding: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  addressIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0FDF4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addressIcon: {
    fontSize: 18,
  },
  addressText: {
    flex: 1,
    gap: 3,
  },
  addressLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addressLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  defaultBadge: {
    backgroundColor: '#DCFCE7',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  defaultBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#16A34A',
  },
  addressStreet: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  addAddressButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  addAddressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#16A34A',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  menuEmoji: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
  },
  menuLabelDanger: {
    color: '#DC2626',
  },
  menuChevron: {
    fontSize: 20,
    color: '#D1D5DB',
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginLeft: 56,
  },
  loadingText: {
    padding: 16,
    color: '#9CA3AF',
    fontSize: 14,
  },
  emptyText: {
    padding: 16,
    color: '#9CA3AF',
    fontSize: 14,
  },
  version: {
    textAlign: 'center',
    fontSize: 12,
    color: '#D1D5DB',
    marginTop: 8,
  },
});
