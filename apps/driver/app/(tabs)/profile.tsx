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
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { useDriverStore } from '@/store/driver.store';
import { stopLocationTracking } from '@/lib/location';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

interface StarRatingProps {
  rating: number;
}

function StarRating({ rating }: Readonly<StarRatingProps>) {
  const stars = Array.from({ length: 5 }, (_, i) => i + 1);
  return (
    <View style={styles.starsRow}>
      {stars.map((star) => (
        <Ionicons
          key={star}
          name={star <= Math.round(rating) ? 'star' : 'star-outline'}
          size={16}
          color={star <= Math.round(rating) ? colors.warning : colors.gray300}
          style={{ marginRight: 2 }}
        />
      ))}
      <Text style={styles.ratingNumber}>{rating.toFixed(1)}</Text>
    </View>
  );
}

interface MenuRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  iconBg?: string;
  label: string;
  subtitle?: string;
  onPress: () => void;
  isLast?: boolean;
}

function MenuRow({
  icon,
  iconColor = colors.primary,
  iconBg = colors.primaryLight,
  label,
  subtitle,
  onPress,
  isLast,
}: Readonly<MenuRowProps>) {
  return (
    <TouchableOpacity
      style={[styles.menuRow, !isLast && styles.menuRowDivider]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.menuIconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.menuLabel}>{label}</Text>
        {subtitle ? <Text style={styles.menuSubtitle}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

interface InfoRowProps {
  label: string;
  value: string;
  isLast?: boolean;
}

function InfoRow({ label, value, isLast }: Readonly<InfoRowProps>) {
  return (
    <View style={[styles.infoRow, !isLast && styles.menuRowDivider]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const VEHICLE_LABEL: Record<string, string> = {
  BIKE: 'Bike',
  SCOOTER: 'Scooter',
  CAR: 'Car',
};

const VEHICLE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  BIKE: 'bicycle',
  SCOOTER: 'bicycle',
  CAR: 'car',
};

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

  const vehicleType = driverProfile?.vehicleType ?? '';
  const vehicleTypeLabel = VEHICLE_LABEL[vehicleType] ?? vehicleType ?? '—';
  const vehicleIcon = VEHICLE_ICON[vehicleType] ?? 'bicycle';

  const totalRatings = driverProfile?.totalRatings ?? 0;
  const rating = driverProfile?.rating ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageTitle}>My Profile</Text>

        {/* Hero card with avatar */}
        <Card style={styles.heroCard} padding={spacing.xxl}>
          <Avatar name={user?.name} size={80} />
          <Text style={styles.userName} numberOfLines={1}>
            {user?.name ?? 'Driver'}
          </Text>
          <Text style={styles.userPhone}>{user?.phone ?? ''}</Text>
          {driverProfile?.rating !== undefined && rating > 0 ? (
            <StarRating rating={rating} />
          ) : null}

          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatBlock}>
              <Text style={styles.heroStatValue}>{totalRatings}</Text>
              <Text style={styles.heroStatLabel}>Ratings</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStatBlock}>
              <View style={styles.heroVehicleRow}>
                <Ionicons name={vehicleIcon} size={18} color={colors.primary} />
                <Text style={styles.heroStatValue}>{vehicleTypeLabel}</Text>
              </View>
              <Text style={styles.heroStatLabel}>Vehicle</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStatBlock}>
              <Text style={[styles.heroStatValue, { fontSize: fontSize.md }]}>
                {driverProfile?.status === 'APPROVED' ? 'Active' : driverProfile?.status ?? '—'}
              </Text>
              <Text style={styles.heroStatLabel}>Status</Text>
            </View>
          </View>
        </Card>

        {/* Vehicle Info */}
        <Text style={styles.sectionTitle}>Vehicle Information</Text>
        <Card padding={0}>
          <InfoRow label="Vehicle type" value={vehicleTypeLabel} />
          <InfoRow
            label="Vehicle number"
            value={driverProfile?.vehicleNumber ?? '—'}
          />
          <InfoRow
            label="License number"
            value={driverProfile?.licenseNumber ?? '—'}
            isLast
          />
        </Card>

        {/* Account */}
        <Text style={styles.sectionTitle}>Account</Text>
        <Card padding={0}>
          <InfoRow label="Role" value="Driver" />
          <InfoRow
            label="Member since"
            value={
              user?.createdAt
                ? new Date(user.createdAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })
                : '—'
            }
            isLast
          />
        </Card>

        {/* Menu */}
        <Text style={styles.sectionTitle}>More</Text>
        <Card padding={0}>
          <MenuRow
            icon="star"
            iconColor={colors.warning}
            iconBg={colors.warningLight}
            label="My Ratings"
            subtitle="See customer reviews"
            onPress={() => router.push('/profile/ratings')}
          />
          <MenuRow
            icon="help-circle"
            iconColor={colors.info}
            iconBg={colors.infoLight}
            label="Help & Support"
            subtitle="FAQs, contact support"
            onPress={() => router.push('/profile/help')}
          />
          <MenuRow
            icon="information-circle"
            iconColor={colors.gray500}
            iconBg={colors.gray100}
            label="About"
            subtitle="App version & legal"
            onPress={() =>
              Alert.alert('AKS Driver', 'Version 1.0.0\n© Apni Kirana Store')
            }
            isLast
          />
        </Card>

        <Button
          variant="outline"
          size="lg"
          icon="log-out-outline"
          title="Logout"
          fullWidth
          onPress={handleLogout}
          style={styles.logoutButton}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.xxxl + spacing.lg,
    gap: spacing.lg,
  },
  pageTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
  },

  heroCard: {
    alignItems: 'center',
  },
  userName: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  userPhone: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  ratingNumber: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '700',
    marginLeft: spacing.xs,
  },

  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    alignSelf: 'stretch',
  },
  heroStatBlock: { alignItems: 'center', flex: 1, gap: 4 },
  heroVehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heroStatValue: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  heroStatLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
  },
  heroStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.divider,
  },

  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  infoLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  infoValue: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: '600',
    maxWidth: '55%',
    textAlign: 'right',
  },

  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  menuRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  menuSubtitle: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },

  logoutButton: {
    marginTop: spacing.md,
    borderColor: colors.error,
  },
});
