import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useDriverStore } from '@/store/driver.store';

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

function StarsDisplay({ value, size = 16 }: { value: number; size?: number }) {
  const stars = Array.from({ length: 5 }, (_, i) => i + 1);
  return (
    <View style={styles.starsRow}>
      {stars.map((s) => (
        <Text
          key={s}
          style={[
            { fontSize: size, color: '#D1D5DB', marginRight: 2 },
            s <= Math.round(value) && { color: '#F59E0B' },
          ]}
        >
          ★
        </Text>
      ))}
    </View>
  );
}

export default function DriverRatingsScreen() {
  const { driverProfile } = useDriverStore();

  const { data: orders, isLoading } = useQuery<OrderListItem[]>({
    queryKey: ['driverOrdersForRatings'],
    queryFn: () => api.get<OrderListItem[]>('/api/v1/orders').then((r) => r.data),
  });

  const reviews: ReviewItem[] = useMemo(() => {
    if (!orders) return [];
    return orders
      .filter((o) => o.rating?.driverRating != null)
      .map((o) => ({
        orderId: o.id,
        rating: o.rating!.driverRating as number,
        comment: o.rating?.driverComment ?? null,
        createdAt: o.rating?.createdAt ?? o.createdAt ?? new Date().toISOString(),
        customerName: o.customer?.name ?? 'Anonymous customer',
      }))
      .sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }, [orders]);

  const aggregate = useMemo(() => {
    const aggRating = driverProfile?.rating ?? 0;
    const aggTotal = driverProfile?.totalRatings ?? reviews.length;

    // Distribution from local reviews list
    const counts: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach((r) => {
      const k = Math.max(1, Math.min(5, Math.round(r.rating))) as 1 | 2 | 3 | 4 | 5;
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
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={26} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Ratings</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card */}
        <View style={styles.heroCard}>
          <View style={styles.heroRow}>
            <Text style={styles.heroRating}>
              {aggregate.aggRating.toFixed(1)}
            </Text>
            <Text style={styles.heroStar}> ★</Text>
          </View>
          <Text style={styles.heroSubtitle}>
            Based on {aggregate.aggTotal}{' '}
            {aggregate.aggTotal === 1 ? 'rating' : 'ratings'}
          </Text>
          <StarsDisplay value={aggregate.aggRating} size={20} />
        </View>

        {/* Distribution */}
        <Text style={styles.sectionTitle}>Rating Breakdown</Text>
        <View style={styles.card}>
          {aggregate.distribution.map((row, idx) => (
            <View
              key={row.star}
              style={[
                styles.distRow,
                idx < aggregate.distribution.length - 1 && styles.distRowBorder,
              ]}
            >
              <Text style={styles.distLabel}>
                {row.star} {row.star === 1 ? 'star' : 'stars'}
              </Text>
              <View style={styles.distBarBg}>
                <View
                  style={[
                    styles.distBarFill,
                    { width: `${row.percent}%` },
                  ]}
                />
              </View>
              <Text style={styles.distPercent}>{row.percent}%</Text>
            </View>
          ))}
        </View>

        {/* Reviews */}
        <Text style={styles.sectionTitle}>Recent Reviews</Text>
        {isLoading ? (
          <ActivityIndicator color="#DC2626" style={{ marginVertical: 24 }} />
        ) : reviews.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconBox}>
              <Ionicons name="bicycle-outline" size={42} color="#DC2626" />
            </View>
            <Text style={styles.emptyTitle}>No reviews yet</Text>
            <Text style={styles.emptySubtitle}>
              Complete deliveries and customers may rate your service.
            </Text>
          </View>
        ) : (
          reviews.map((r) => (
            <View key={r.orderId} style={styles.reviewCard}>
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
                <Text style={styles.reviewCommentMuted}>No comment provided</Text>
              )}
            </View>
          ))
        )}
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
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },

  heroCard: {
    backgroundColor: '#FEE2E2',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end' },
  heroRating: { fontSize: 56, fontWeight: '800', color: '#DC2626', lineHeight: 60 },
  heroStar: { fontSize: 36, color: '#DC2626', fontWeight: '800' },
  heroSubtitle: { fontSize: 14, color: '#7F1D1D', marginTop: 4, marginBottom: 12 },

  starsRow: { flexDirection: 'row', alignItems: 'center' },

  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  distRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  distRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  distLabel: { width: 64, fontSize: 13, color: '#374151', fontWeight: '600' },
  distBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    overflow: 'hidden',
  },
  distBarFill: { height: '100%', backgroundColor: '#DC2626', borderRadius: 4 },
  distPercent: {
    width: 44,
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
    textAlign: 'right',
  },

  reviewCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  reviewTime: { fontSize: 12, color: '#9CA3AF' },
  reviewCustomer: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 4 },
  reviewComment: { fontSize: 14, color: '#374151', lineHeight: 20 },
  reviewCommentMuted: { fontSize: 13, color: '#9CA3AF', fontStyle: 'italic' },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  emptyIconBox: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 6 },
  emptySubtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
});
