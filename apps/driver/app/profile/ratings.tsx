import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useHeaderHeight } from '@react-navigation/elements';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useDriverStore } from '@/store/driver.store';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';

interface OrderRating {
  driverRating?: number | null;
  driverComment?: string | null;
  createdAt?: string;
}

interface OrderListItem {
  id: string;
  rating?: OrderRating | null;
  customer?: { name?: string | null } | null;
  createdAt?: string;
}

interface ReviewItem {
  orderId: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  customerName: string;
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

interface StarsDisplayProps {
  value: number;
  size?: number;
}

function StarsDisplay({ value, size = 16 }: Readonly<StarsDisplayProps>) {
  const stars = Array.from({ length: 5 }, (_, i) => i + 1);
  return (
    <View style={styles.starsRow}>
      {stars.map((s) => (
        <Ionicons
          key={s}
          name={s <= Math.round(value) ? 'star' : 'star-outline'}
          size={size}
          color={s <= Math.round(value) ? colors.warning : colors.gray300}
          style={{ marginRight: 2 }}
        />
      ))}
    </View>
  );
}

export default function DriverRatingsScreen() {
  const { driverProfile } = useDriverStore();
  // Android: transparent native header doesn't reserve space; offset content by header height
  const headerHeight = useHeaderHeight();

  const { data: orders, isLoading } = useQuery<OrderListItem[]>({
    queryKey: ['driverOrdersForRatings'],
    queryFn: () =>
      api.get<OrderListItem[]>('/api/v1/orders').then((r) => r.data),
  });

  const reviews: ReviewItem[] = useMemo(() => {
    if (!orders) return [];
    return orders
      .filter((o) => o.rating?.driverRating != null)
      .map((o) => ({
        orderId: o.id,
        rating: o.rating!.driverRating as number,
        comment: o.rating?.driverComment ?? null,
        createdAt:
          o.rating?.createdAt ?? o.createdAt ?? new Date().toISOString(),
        customerName: o.customer?.name ?? 'Anonymous customer',
      }))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [orders]);

  const aggregate = useMemo(() => {
    const aggRating = driverProfile?.rating ?? 0;
    const aggTotal = driverProfile?.totalRatings ?? reviews.length;

    const counts: Record<1 | 2 | 3 | 4 | 5, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    reviews.forEach((r) => {
      const k = Math.max(1, Math.min(5, Math.round(r.rating))) as
        | 1
        | 2
        | 3
        | 4
        | 5;
      counts[k] += 1;
    });
    const total = reviews.length || 1;
    const distribution = ([5, 4, 3, 2, 1] as const).map((star) => ({
      star,
      count: counts[star],
      percent: Math.round((counts[star] / total) * 100),
    }));

    return { aggRating, aggTotal, distribution };
  }, [driverProfile, reviews]);

  return (
    // Android: include left/right; native Stack header owns the top edge
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: headerHeight + spacing.lg }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card */}
        <View style={styles.heroCard}>
          <View style={styles.heroRow}>
            <Text style={styles.heroRating}>
              {aggregate.aggRating.toFixed(1)}
            </Text>
            <Ionicons name="star" size={32} color={colors.white} />
          </View>
          <Text style={styles.heroSubtitle}>
            Based on {aggregate.aggTotal}{' '}
            {aggregate.aggTotal === 1 ? 'rating' : 'ratings'}
          </Text>
          <StarsDisplay value={aggregate.aggRating} size={20} />
        </View>

        {/* Distribution */}
        <Text style={styles.sectionTitle}>Rating breakdown</Text>
        <Card padding={spacing.md} style={{ gap: spacing.sm }}>
          {aggregate.distribution.map((row) => (
            <View key={row.star} style={styles.distRow}>
              <View style={styles.distLabelWrap}>
                <Text style={styles.distLabel}>{row.star}</Text>
                <Ionicons name="star" size={12} color={colors.warning} />
              </View>
              <View style={styles.distBarBg}>
                <View
                  style={[styles.distBarFill, { width: `${row.percent}%` }]}
                />
              </View>
              <Text style={styles.distPercent}>{row.percent}%</Text>
            </View>
          ))}
        </Card>

        {/* Reviews */}
        <Text style={styles.sectionTitle}>Recent reviews</Text>
        {isLoading ? (
          <ActivityIndicator
            color={colors.primary}
            style={{ marginVertical: spacing.xxl }}
          />
        ) : reviews.length === 0 ? (
          <EmptyState
            icon="bicycle-outline"
            title="No reviews yet"
            subtitle="Complete deliveries and customers may rate your service."
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {reviews.map((r) => (
              <Card key={r.orderId}>
                <View style={styles.reviewHeader}>
                  <StarsDisplay value={r.rating} size={16} />
                  <Text style={styles.reviewTime}>
                    {formatRelativeTime(r.createdAt)}
                  </Text>
                </View>
                <Text style={styles.reviewCustomer}>{r.customerName}</Text>
                {r.comment ? (
                  <Text style={styles.reviewComment}>{r.comment}</Text>
                ) : (
                  <Text style={styles.reviewCommentMuted}>
                    No comment provided
                  </Text>
                )}
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  content: {
    // paddingTop is set dynamically (header height + spacing) by the screen
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },

  heroCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    alignItems: 'center',
    ...shadow.medium,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroRating: {
    fontSize: 56,
    fontWeight: '800',
    color: colors.white,
    lineHeight: 60,
  },
  heroSubtitle: {
    fontSize: fontSize.sm,
    color: colors.primaryLight,
    marginTop: 4,
    marginBottom: spacing.sm,
  },

  starsRow: { flexDirection: 'row', alignItems: 'center' },

  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },

  distRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: spacing.md,
  },
  distLabelWrap: {
    width: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  distLabel: {
    fontSize: fontSize.sm,
    color: colors.gray700,
    fontWeight: '700',
  },
  distBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: colors.gray100,
    borderRadius: 4,
    overflow: 'hidden',
  },
  distBarFill: {
    height: '100%',
    backgroundColor: colors.warning,
    borderRadius: 4,
  },
  distPercent: {
    width: 44,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '700',
    textAlign: 'right',
  },

  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  reviewTime: { fontSize: fontSize.xs, color: colors.textMuted },
  reviewCustomer: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  reviewComment: {
    fontSize: fontSize.sm,
    color: colors.gray700,
    lineHeight: 20,
  },
  reviewCommentMuted: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
});
