import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { apiClient } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { useCartStore } from '@/store/cart.store';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';
import { OrderStatus, type Address, type Order } from '@aks/shared';

const APP_VERSION = '1.0.0';

interface MenuItem {
  icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  iconBg?: string;
  iconColor?: string;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

async function fetchOrders(): Promise<Order[]> {
  try {
    const res = await apiClient.get<{ data: Order[] } | Order[]>('/api/v1/orders/mine');
    const payload = res.data as unknown;
    if (Array.isArray(payload)) return payload as Order[];
    return ((payload as { data?: Order[] }).data ?? []) as Order[];
  } catch {
    return [];
  }
}

async function fetchAddresses(): Promise<Address[]> {
  try {
    const res = await apiClient.get<{ data: Address[] } | Address[]>('/api/v1/addresses');
    const payload = res.data as unknown;
    if (Array.isArray(payload)) return payload as Address[];
    return ((payload as { data?: Address[] }).data ?? []) as Address[];
  } catch {
    return [];
  }
}

function StatTile({ label, value, icon, color }: {
  label: string;
  value: number | string;
  icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  color: string;
}) {
  return (
    <View style={styles.statTile}>
      <View style={[styles.statIcon, { backgroundColor: color }]}>
        <Ionicons name={icon} size={18} color={colors.white} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MenuRow({ item, isLast }: { item: MenuItem; isLast: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.menuRow, isLast && { borderBottomWidth: 0 }]}
      activeOpacity={0.7}
      onPress={item.onPress}
    >
      <View
        style={[
          styles.menuIcon,
          { backgroundColor: item.iconBg ?? colors.primaryLight },
        ]}
      >
        <Ionicons name={item.icon} size={18} color={item.iconColor ?? colors.primary} />
      </View>
      <Text style={styles.menuLabel}>{item.label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const clearCart = useCartStore((s) => s.clearCart);

  const ordersQuery = useQuery({ queryKey: ['my-orders'], queryFn: fetchOrders });
  const addressesQuery = useQuery({ queryKey: ['addresses'], queryFn: fetchAddresses });

  const totalOrders = ordersQuery.data?.length ?? 0;
  const savedAddresses = addressesQuery.data?.length ?? 0;
  const deliveredOrders = ordersQuery.data?.filter((o) => o.status === OrderStatus.DELIVERED).length ?? 0;

  function handleLogout() {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
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

  function notImplemented(feature: string) {
    return () => Alert.alert(feature, 'This feature will be available soon.');
  }

  const sections: MenuSection[] = [
    {
      title: 'Account',
      items: [
        {
          icon: 'location-outline',
          label: 'My Addresses',
          onPress: notImplemented('Addresses'),
          iconBg: colors.primaryLight,
          iconColor: colors.primary,
        },
        {
          icon: 'wallet-outline',
          label: 'My Wallet',
          onPress: notImplemented('Wallet'),
          iconBg: colors.warningLight,
          iconColor: '#B45309',
        },
        {
          icon: 'heart-outline',
          label: 'Favorites',
          onPress: notImplemented('Favorites'),
          iconBg: colors.errorLight,
          iconColor: colors.error,
        },
      ],
    },
    {
      title: 'Help',
      items: [
        {
          icon: 'help-circle-outline',
          label: 'Help Center',
          onPress: notImplemented('Help Center'),
          iconBg: colors.infoLight,
          iconColor: colors.info,
        },
        {
          icon: 'document-text-outline',
          label: 'Terms & Conditions',
          onPress: notImplemented('Terms'),
          iconBg: colors.gray100,
          iconColor: colors.gray700,
        },
        {
          icon: 'shield-checkmark-outline',
          label: 'Privacy Policy',
          onPress: notImplemented('Privacy'),
          iconBg: colors.gray100,
          iconColor: colors.gray700,
        },
      ],
    },
    {
      title: 'App',
      items: [
        {
          icon: 'star-outline',
          label: 'Rate App',
          onPress: notImplemented('Rate'),
          iconBg: colors.warningLight,
          iconColor: '#B45309',
        },
        {
          icon: 'share-social-outline',
          label: 'Share App',
          onPress: notImplemented('Share'),
          iconBg: colors.purpleLight,
          iconColor: colors.purple,
        },
        {
          icon: 'information-circle-outline',
          label: `App version ${APP_VERSION}`,
          onPress: () => {},
          iconBg: colors.gray100,
          iconColor: colors.gray700,
        },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        {/* Profile head */}
        <View style={styles.profileHead}>
          <Avatar name={user?.name} size={72} />
          <View style={styles.profileInfo}>
            <Text style={styles.profileName} numberOfLines={1}>
              {user?.name ?? 'Customer'}
            </Text>
            <Text style={styles.profilePhone}>{user?.phone ?? ''}</Text>
          </View>
          <TouchableOpacity
            style={styles.editBtn}
            activeOpacity={0.7}
            onPress={notImplemented('Edit profile')}
          >
            <Ionicons name="pencil" size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Stat row */}
        <View style={styles.statRow}>
          <StatTile label="Orders" value={totalOrders} icon="bag-handle" color={colors.primary} />
          <StatTile label="Delivered" value={deliveredOrders} icon="checkmark-done" color={colors.success} />
          <StatTile label="Addresses" value={savedAddresses} icon="location" color={colors.info} />
        </View>

        {/* Menu sections */}
        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.menuCard}>
              {section.items.map((item, idx) => (
                <MenuRow
                  key={item.label}
                  item={item}
                  isLast={idx === section.items.length - 1}
                />
              ))}
            </View>
          </View>
        ))}

        {/* Logout */}
        <View style={styles.logoutWrap}>
          <Button
            variant="outline"
            title="Log out"
            icon="log-out-outline"
            onPress={handleLogout}
            fullWidth
            size="lg"
            style={{ borderColor: colors.error }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  profileHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  profilePhone: {
    marginTop: 2,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  editBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.small,
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  statValue: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  statLabel: {
    marginTop: 2,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  section: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  menuCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  logoutWrap: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
});
