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
import { api } from '@/lib/api';
import { useStorePortalStore } from '@/store/store.store';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

interface MenuRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
  destructive?: boolean;
  showDivider?: boolean;
}

function MenuRow({ icon, title, subtitle, onPress, destructive, showDivider }: MenuRowProps) {
  return (
    <>
      <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={styles.menuRow}>
        <View
          style={[
            styles.menuIconWrap,
            destructive && { backgroundColor: colors.errorLight },
          ]}
        >
          <Ionicons
            name={icon}
            size={18}
            color={destructive ? colors.error : colors.primary}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.menuTitle, destructive && { color: colors.error }]}>
            {title}
          </Text>
          {subtitle ? <Text style={styles.menuSubtitle}>{subtitle}</Text> : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </TouchableOpacity>
      {showDivider ? <View style={styles.divider} /> : null}
    </>
  );
}

export default function StoreProfileScreen() {
  const { user, storeProfile, clearAuth } = useStorePortalStore();
  const isOpen = storeProfile?.isOpen ?? false;

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

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-IN', {
        month: 'short',
        year: 'numeric',
      })
    : '—';

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          // Best-effort: clear server-side push token first so this device
          // stops getting notifications meant for the logged-out store owner.
          try {
            await api.delete('/api/v1/notifications/fcm-token');
          } catch {
            // ignore
          }
          await Promise.all([
            SecureStore.deleteItemAsync('accessToken'),
            SecureStore.deleteItemAsync('user'),
            SecureStore.deleteItemAsync('storeProfile'),
          ]);
          clearAuth();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageTitle}>Profile</Text>

        {/* Identity */}
        <View style={styles.identity}>
          <Avatar name={storeProfile?.name ?? 'My Store'} size={88} />
          <Text style={styles.storeName} numberOfLines={1}>
            {storeProfile?.name ?? 'My Store'}
          </Text>
          {storeProfile?.category ? (
            <Text style={styles.storeCategory}>{storeProfile.category}</Text>
          ) : null}
          <View style={{ marginTop: spacing.sm }}>
            <Badge
              variant={isOpen ? 'success' : 'error'}
              text={isOpen ? 'Open now' : 'Closed'}
              dot
            />
          </View>
        </View>

        {/* Quick stats */}
        <View style={styles.statRow}>
          <Card style={styles.statCard} padding={spacing.lg}>
            <Ionicons name="time-outline" size={18} color={colors.primary} />
            <Text style={styles.statLabel}>Hours</Text>
            <Text style={styles.statValue}>
              {openTime} – {closeTime}
            </Text>
          </Card>
          <Card style={styles.statCard} padding={spacing.lg}>
            <Ionicons name="location-outline" size={18} color={colors.primary} />
            <Text style={styles.statLabel}>Pincode</Text>
            <Text style={styles.statValue}>{addressObj.pincode ?? '—'}</Text>
          </Card>
          <Card style={styles.statCard} padding={spacing.lg}>
            <Ionicons name="calendar-outline" size={18} color={colors.primary} />
            <Text style={styles.statLabel}>Member</Text>
            <Text style={styles.statValue}>{memberSince}</Text>
          </Card>
        </View>

        {/* Settings */}
        <Text style={styles.sectionTitle}>Settings</Text>
        <Card style={styles.menuCard} padding={0}>
          <MenuRow
            icon="time-outline"
            title="Operating hours"
            subtitle="Set when your store is open"
            onPress={() => router.push('/profile/operating-hours')}
            showDivider
          />
          <MenuRow
            icon="storefront-outline"
            title="Edit store profile"
            subtitle="Name, address, description"
            onPress={() => router.push('/profile/edit')}
            showDivider
          />
          <MenuRow
            icon="notifications-outline"
            title="Notifications"
            subtitle="Order alerts and reminders"
            onPress={() => router.push('/profile/notifications')}
          />
        </Card>

        {/* Account */}
        <Text style={styles.sectionTitle}>Account</Text>
        <Card style={styles.menuCard} padding={spacing.lg}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Owner</Text>
            <Text style={styles.infoValue}>{user?.name ?? '—'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Phone</Text>
            <Text style={styles.infoValue}>{user?.phone ?? '—'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Address</Text>
            <Text style={styles.infoValue} numberOfLines={2}>
              {[addressObj.street, addressObj.city, addressObj.state]
                .filter((v) => v && v !== '—')
                .join(', ') || '—'}
            </Text>
          </View>
        </Card>

        {/* Help / About */}
        <Text style={styles.sectionTitle}>Help</Text>
        <Card style={styles.menuCard} padding={0}>
          <MenuRow
            icon="help-circle-outline"
            title="Help & support"
            onPress={() =>
              Alert.alert(
                'Help & support',
                'Reach our support team at support@apnikirana.app'
              )
            }
            showDivider
          />
          <MenuRow
            icon="information-circle-outline"
            title="About Apni Kirana"
            onPress={() =>
              Alert.alert('Apni Kirana — Store Portal', 'Version 1.0.0')
            }
          />
        </Card>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleLogout}
          style={styles.logoutButton}
        >
          <Ionicons name="log-out-outline" size={18} color={colors.error} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },
  pageTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
  },

  identity: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.lg,
  },
  storeName: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  storeCategory: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },

  statRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statValue: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  menuCard: {
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary },
  menuSubtitle: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.divider, marginLeft: spacing.lg + 36 + spacing.md },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.lg,
  },
  infoLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  infoValue: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: '600',
    maxWidth: '60%',
    textAlign: 'right',
  },

  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.error,
    backgroundColor: 'transparent',
    marginTop: spacing.xl,
  },
  logoutText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.error,
  },
});
