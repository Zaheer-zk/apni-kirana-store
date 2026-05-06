import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '@/components/EmptyState';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { Skeleton } from '@/components/Skeleton';
import { apiClient } from '@/lib/api';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';
import { OrderStatus, type Order } from '@aks/shared';

const ACTIVE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.STORE_ACCEPTED,
  OrderStatus.DRIVER_ASSIGNED,
  OrderStatus.PICKED_UP,
];

type Tab = 'active' | 'past';

async function fetchOrders(): Promise<Order[]> {
  const res = await apiClient.get<{ data: Order[] } | Order[]>('/api/v1/orders/mine');
  const payload = res.data as unknown;
  if (Array.isArray(payload)) return payload as Order[];
  return ((payload as { data?: Order[] }).data ?? []) as Order[];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function OrderCard({ order }: { order: Order }) {
  const summary = order.items
    .slice(0, 3)
    .map((i) => i.name)
    .join(', ');
  const moreCount = order.items.length - 3;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      style={styles.card}
      onPress={() => router.push(`/order/${order.id}`)}
    >
      <View style={styles.cardTop}>
        <View style={styles.storeRow}>
          <View style={styles.storeIcon}>
            <Ionicons name="storefront" size={16} color={colors.primary} />
          </View>
          <Text style={styles.storeName} numberOfLines={1}>
            Order #{order.id.slice(-6).toUpperCase()}
          </Text>
        </View>
        <OrderStatusBadge status={order.status} />
      </View>

      <Text style={styles.summary} numberOfLines={2}>
        {order.items.length} {order.items.length === 1 ? 'item' : 'items'}: {summary}
        {moreCount > 0 ? ` +${moreCount} more` : ''}
      </Text>

      <View style={styles.divider} />

      <View style={styles.cardBottom}>
        <View style={styles.metaCol}>
          <Text style={styles.metaLabel}>{formatDate(order.createdAt)}</Text>
          <Text style={styles.metaValue}>₹{order.total.toFixed(0)}</Text>
        </View>
        <View style={styles.chevronWrap}>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

function OrderSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Skeleton width={120} height={16} />
        <Skeleton width={80} height={20} radius={10} />
      </View>
      <View style={{ marginTop: spacing.md }}>
        <Skeleton width="100%" height={14} />
      </View>
      <View style={styles.divider} />
      <Skeleton width={140} height={14} />
    </View>
  );
}

export default function OrdersScreen() {
  const [tab, setTab] = useState<Tab>('active');

  const ordersQuery = useQuery({
    queryKey: ['my-orders'],
    queryFn: fetchOrders,
  });

  const orders = ordersQuery.data ?? [];

  const filtered = useMemo(() => {
    const sorted = [...orders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return sorted.filter((o) =>
      tab === 'active' ? ACTIVE_STATUSES.includes(o.status) : !ACTIVE_STATUSES.includes(o.status)
    );
  }, [orders, tab]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Orders</Text>
        <Text style={styles.headerSubtitle}>Track your active and past orders</Text>
      </View>

      {/* Segmented control */}
      <View style={styles.segment}>
        {(['active', 'past'] as Tab[]).map((t) => {
          const active = tab === t;
          const count = orders.filter((o) =>
            t === 'active' ? ACTIVE_STATUSES.includes(o.status) : !ACTIVE_STATUSES.includes(o.status)
          ).length;
          return (
            <TouchableOpacity
              key={t}
              style={styles.segmentItem}
              activeOpacity={0.7}
              onPress={() => setTab(t)}
            >
              <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                {t === 'active' ? 'Active' : 'Past'}
                {count > 0 ? ` (${count})` : ''}
              </Text>
              <View style={[styles.segmentUnderline, active && styles.segmentUnderlineActive]} />
            </TouchableOpacity>
          );
        })}
      </View>

      {ordersQuery.isLoading ? (
        <View style={styles.listContent}>
          <OrderSkeleton />
          <View style={{ height: spacing.md }} />
          <OrderSkeleton />
          <View style={{ height: spacing.md }} />
          <OrderSkeleton />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          refreshControl={
            <RefreshControl
              refreshing={ordersQuery.isRefetching}
              onRefresh={ordersQuery.refetch}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          renderItem={({ item }) => <OrderCard order={item} />}
          ListEmptyComponent={
            <EmptyState
              icon="receipt-outline"
              title={tab === 'active' ? 'No active orders' : 'No past orders'}
              subtitle={
                tab === 'active'
                  ? 'Place your first order to see it here.'
                  : 'Your order history will show up here.'
              }
              actionLabel="Browse stores"
              onAction={() => router.push('/(tabs)/home')}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  segment: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  segmentItem: {
    paddingVertical: spacing.md,
    marginRight: spacing.xl,
  },
  segmentLabel: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textMuted,
  },
  segmentLabelActive: {
    color: colors.primary,
  },
  segmentUnderline: {
    marginTop: spacing.sm,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  segmentUnderlineActive: {
    backgroundColor: colors.primary,
  },
  listContent: {
    padding: spacing.lg,
    flexGrow: 1,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.small,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  storeIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeName: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  summary: {
    marginTop: spacing.md,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  divider: {
    marginVertical: spacing.md,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaCol: {
    gap: 2,
  },
  metaLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
  },
  metaValue: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  chevronWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
