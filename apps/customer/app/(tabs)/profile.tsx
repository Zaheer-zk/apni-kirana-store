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
import { unregisterPushNotifications } from '@/lib/notifications';
import { useAuthStore } from '@/store/auth.store';
import { useCartStore } from '@/store/cart.store';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';
import { type Address, type Order } from '@aks/shared';

interface MenuItem {
  icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  iconBg?: string;
  iconColor?: string;
  trailing?: string;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

function unwrapList<T>(payload: unknown, listKey?: string): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    if (Array.isArray(o.data)) return o.data as T[];
    if (o.data && typeof o.data === 'object') {
      const inner = o.data as Record<string, unknown>;
      if (listKey && Array.isArray(inner[listKey])) return inner[listKey] as T[];
      if (Array.isArray(inner.items)) return inner.items as T[];
    }
    if (listKey && Array.isArray(o[listKey])) return o[listKey] as T[];
    if (Array.isArray(o.items)) return o.items as T[];
  }
  return [];
}

async function fetchOrders(): Promise<Order[]> {
  try {
    const res = await apiClient.get('/api/v1/orders/mine');
    return unwrapList<Order>(res.data, 'orders');
  } catch {
    return [];
  }
}

async function fetchAddresses(): Promise<Address[]> {
  try {
    const res = await apiClient.get('/api/v1/addresses');
    return unwrapList<Address>(res.data);
  } catch {
    return [];
  }
}

function StatTile({
  label,
  value,
  icon,
  color,
}: {
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
      {item.trailing ? (
        <Text style={styles.menuTrailing}>{item.trailing}</Text>
      ) : null}
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

  function handleLogout() {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          // Best-effort: remove THIS device's push token from the backend so
          // the previous user's notifications stop arriving here. Other devices
          // they're logged in on stay subscribed.
          await unregisterPushNotifications();
          await Promise.all([
            SecureStore.deleteItemAsync('accessToken'),
            SecureStore.deleteItemAsync('refreshToken'),
            SecureStore.deleteItemAsync('user'),
          ]);
          clearAuth();
          clearCart();
          router.replace('/(auth)/login');
        },
      },
    ]);
  }

  const sections: MenuSection[] = [
    {
      title: 'My Account',
      items: [
        {
          icon: 'location-outline',
          label: 'My Addresses',
          onPress: () => router.push('/account/addresses'),
          iconBg: colors.primaryLight,
          iconColor: colors.primary,
          trailing: savedAddresses ? `${savedAddresses}` : undefined,
        },
        {
          icon: 'person-outline',
          label: 'Edit Profile',
          onPress: () => router.push('/account/profile'),
          iconBg: colors.infoLight,
          iconColor: colors.info,
        },
        {
          icon: 'notifications-outline',
          label: 'Notifications',
          onPress: () => router.push('/notifications'),
          iconBg: colors.warningLight,
          iconColor: '#B45309',
        },
        {
          icon: 'options-outline',
          label: 'Notification preferences',
          onPress: () => router.push('/account/notifications'),
          iconBg: colors.gray100,
          iconColor: colors.gray700,
        },
      ],
    },
    {
      title: 'Help & More',
      items: [
        {
          icon: 'chatbubble-ellipses-outline',
          label: 'Help & Support',
          onPress: () => router.push('/account/help'),
          iconBg: colors.successLight,
          iconColor: colors.success,
        },
        {
          icon: 'information-circle-outline',
          label: 'About',
          onPress: () => router.push('/account/about'),
          iconBg: colors.purpleLight,
          iconColor: colors.purple,
        },
        {
          icon: 'document-text-outline',
          label: 'Terms & Privacy',
          onPress: () => router.push('/account/about'),
          iconBg: colors.gray100,
          iconColor: colors.gray700,
        },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
      >
        {/* Hero card */}
        <View style={styles.heroCard}>
          <Avatar name={user?.name} size={64} />
          <View style={styles.heroInfo}>
            <Text style={styles.heroName} numberOfLines={1}>
              {user?.name ?? 'Customer'}
            </Text>
            <Text style={styles.heroPhone}>+91 {user?.phone ?? ''}</Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push('/account/profile')}
              style={styles.editLink}
            >
              <Ionicons name="pencil" size={12} color={colors.primary} />
              <Text style={styles.editLinkText}>Edit profile</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statRow}>
          <StatTile label="Orders" value={totalOrders} icon="bag-handle" color={colors.primary} />
          <View style={styles.statDivider} />
          <StatTile label="Saved" value={savedAddresses} icon="location" color={colors.info} />
          <View style={styles.statDivider} />
          <StatTile label="Rewards" value="₹0" icon="gift" color={colors.warning} />
        </View>

        {/* Sections */}
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
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.lg,
    ...shadow.small,
  },
  heroInfo: {
    flex: 1,
  },
  heroName: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  heroPhone: {
    marginTop: 2,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  editLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  editLinkText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.primary,
  },
  statRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.small,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
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
    fontSize: fontSize.lg,
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
  menuTrailing: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textSecondary,
    backgroundColor: colors.gray100,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  logoutWrap: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
});
