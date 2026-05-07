import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useStorePortalStore } from '@/store/store.store';
import { IncomingOrderBanner } from '@/components/IncomingOrderBanner';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Skeleton } from '@/components/Skeleton';
import { initSocket } from '@/lib/socket';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';
import { useUnreadNotificationsCount } from '@/app/notifications/index';
import type { StoreOrder, StoreDashboardStats } from '@aks/shared';

type StatusInfo = { variant: 'info' | 'purple' | 'warning' | 'success'; label: string };

const ORDER_STATUS_INFO: Record<string, StatusInfo> = {
  PENDING: { variant: 'warning', label: 'Pending' },
  STORE_ACCEPTED: { variant: 'info', label: 'Preparing' },
  DRIVER_ASSIGNED: { variant: 'purple', label: 'Driver assigned' },
  IN_TRANSIT: { variant: 'success', label: 'In transit' },
};

function ActiveOrderCard({ order }: { order: StoreOrder }) {
  const info = ORDER_STATUS_INFO[order.status] ?? { variant: 'info' as const, label: order.status };

  return (
    <TouchableOpacity
      onPress={() => router.push(`/order/${order.id}`)}
      activeOpacity={0.7}
      style={styles.orderCardWrap}
    >
      <Card style={styles.orderCard} padding={spacing.lg}>
        <View style={styles.orderCardTop}>
          <View style={styles.orderIdPill}>
            <Text style={styles.orderIdPillText}>#{order.id.slice(-8).toUpperCase()}</Text>
          </View>
          <Badge variant={info.variant} text={info.label} />
        </View>

        <Text style={styles.orderCardItems}>
          {order.itemsCount} item{order.itemsCount !== 1 ? 's' : ''} · {order.deliveryArea}
        </Text>

        <View style={styles.orderCardFooter}>
          <Text style={styles.orderCardTotal}>₹{order.total.toFixed(2)}</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </View>
      </Card>
    </TouchableOpacity>
  );
}

function StatCard({
  label,
  value,
  accent,
  loading,
}: {
  label: string;
  value: string;
  accent?: 'primary' | 'success' | 'accent';
  loading?: boolean;
}) {
  const accentColor =
    accent === 'success'
      ? colors.success
      : accent === 'accent'
      ? colors.accent
      : colors.primary;

  return (
    <View style={styles.statCard}>
      {loading ? (
        <Skeleton width={70} height={28} style={{ marginBottom: spacing.xs }} />
      ) : (
        <Text style={[styles.statValue, { color: accentColor }]} numberOfLines={1}>
          {value}
        </Text>
      )}
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const { storeProfile, accessToken, incomingOrderId, setStoreOpen, setStoreProfile } =
    useStorePortalStore();
  const queryClient = useQueryClient();
  const isOpen = storeProfile?.isOpen ?? false;
  const unreadCount = useUnreadNotificationsCount();

  // If the in-memory store profile is missing (e.g. fresh login before
  // SecureStore was populated, or first launch after the route-order bug
  // returned a 404), lazy-fetch it from the backend. Without this the
  // open/close toggle would throw "No store profile loaded".
  useQuery({
    queryKey: ['storeProfile'],
    enabled: !!accessToken && !storeProfile?.id,
    queryFn: async () => {
      const res = await api.get('/api/v1/stores/me');
      const store = (res.data as { data?: any }).data ?? res.data;
      if (store) setStoreProfile(store);
      return store;
    },
    staleTime: 60_000,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<StoreDashboardStats>({
    queryKey: ['storeDashboardStats'],
    queryFn: async () => {
      const r = await api.get('/api/v1/stores/stats/today');
      const inner = (r.data as { data?: StoreDashboardStats }).data ?? r.data;
      return (inner ?? {}) as StoreDashboardStats;
    },
    refetchInterval: 30_000,
  });

  const { data: activeOrders, isLoading: ordersLoading } = useQuery<StoreOrder[]>({
    queryKey: ['storeActiveOrders'],
    queryFn: async () => {
      // Backend returns { success, data: [...] } — unwrap before .map
      const r = await api.get('/api/v1/stores/orders/active');
      const payload = r.data as unknown;
      if (Array.isArray(payload)) return payload as StoreOrder[];
      if (payload && typeof payload === 'object') {
        const o = payload as { data?: unknown };
        if (Array.isArray(o.data)) return o.data as StoreOrder[];
      }
      return [];
    },
    refetchInterval: 15_000,
  });

  const toggleOpenMutation = useMutation({
    mutationFn: () => {
      const sid = storeProfile?.id;
      if (!sid) throw new Error('No store profile loaded');
      return api.put(`/api/v1/stores/${sid}/toggle-open`).then((r) => r.data);
    },
    onMutate: () => {
      const open = !(storeProfile?.isOpen ?? false);
      setStoreOpen(open);
      return { wasOpen: !open };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) setStoreOpen(ctx.wasOpen);
      Alert.alert('Error', 'Could not update store status');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['storeProfile'] }),
  });

  useEffect(() => {
    if (accessToken) {
      initSocket(accessToken);
    }
  }, [accessToken]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {incomingOrderId ? <IncomingOrderBanner orderId={incomingOrderId} /> : null}

      {/* Sticky header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>Good day,</Text>
          <Text style={styles.storeName} numberOfLines={1}>
            {storeProfile?.name ?? 'My Store'}
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.push('/notifications')}
          style={styles.bellButton}
        >
          <Ionicons
            name="notifications-outline"
            size={22}
            color={colors.textPrimary}
          />
          {unreadCount > 0 ? <View style={styles.bellDot} /> : null}
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => toggleOpenMutation.mutate()}
          disabled={toggleOpenMutation.isPending}
          style={[
            styles.statusPill,
            isOpen ? styles.statusPillOpen : styles.statusPillClosed,
          ]}
        >
          <View
            style={[
              styles.statusDot,
              { backgroundColor: isOpen ? colors.success : colors.error },
            ]}
          />
          <Text
            style={[
              styles.statusPillText,
              { color: isOpen ? '#047857' : '#B91C1C' },
            ]}
          >
            {isOpen ? 'Open' : 'Closed'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Today's Stats */}
        <Text style={styles.sectionLabel}>Today's snapshot</Text>
        <View style={styles.statsRow}>
          <StatCard
            label="Orders"
            value={String(stats?.ordersReceived ?? 0)}
            accent="primary"
            loading={statsLoading}
          />
          <StatCard
            label="Revenue"
            value={`₹${stats?.revenue ?? 0}`}
            accent="accent"
            loading={statsLoading}
          />
          <StatCard
            label="Completed"
            value={String(stats?.ordersCompleted ?? 0)}
            accent="success"
            loading={statsLoading}
          />
        </View>

        {/* Active Orders */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Active orders</Text>
          <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/(tabs)/orders')}>
            <Text style={styles.sectionLink}>View all</Text>
          </TouchableOpacity>
        </View>

        {ordersLoading ? (
          <View style={{ gap: spacing.md }}>
            <Skeleton height={92} radius={radius.lg} />
            <Skeleton height={92} radius={radius.lg} />
          </View>
        ) : !activeOrders || activeOrders.length === 0 ? (
          <Card style={styles.emptyOrders} padding={spacing.xxl}>
            <Ionicons name="checkmark-done-outline" size={36} color={colors.primary} />
            <Text style={styles.emptyOrdersText}>No active orders right now</Text>
            <Text style={styles.emptyOrdersSubtext}>You're all caught up.</Text>
          </Card>
        ) : (
          activeOrders.map((order) => <ActiveOrderCard key={order.id} order={order} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  // paddingBottom > xxxl so last card isn't clipped behind the absolute tab bar on Android
  content: { padding: spacing.xl, paddingBottom: 120 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  headerLeft: { flex: 1, marginRight: spacing.md },
  bellButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.small,
  },
  bellDot: {
    position: 'absolute',
    top: 8,
    right: 10,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.error,
    borderWidth: 2,
    borderColor: colors.card,
  },
  greeting: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  storeName: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  statusPillOpen: {
    backgroundColor: colors.successLight,
    borderColor: colors.success,
  },
  statusPillClosed: {
    backgroundColor: colors.errorLight,
    borderColor: colors.error,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusPillText: { fontSize: fontSize.sm, fontWeight: '700' },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.small,
  },
  statValue: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sectionLink: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '700',
  },
  orderCardWrap: { marginBottom: spacing.md },
  orderCard: {
    gap: spacing.sm,
  },
  orderCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderIdPill: {
    backgroundColor: colors.gray100,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  orderIdPillText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.gray700,
    fontFamily: 'Menlo',
    letterSpacing: 0.4,
  },
  orderCardItems: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  orderCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderCardTotal: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.primary,
  },
  emptyOrders: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  emptyOrdersText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  emptyOrdersSubtext: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
});
