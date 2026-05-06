import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card } from '@/components/Card';
import { Badge, BadgeVariant } from '@/components/Badge';
import { Skeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { colors, fontSize, radius, spacing } from '@/constants/theme';
import type { StoreOrder, OrderStatus } from '@aks/shared';

type Tab = 'INCOMING' | 'ACTIVE' | 'COMPLETED';

const TAB_STATUSES: Record<Tab, OrderStatus[]> = {
  INCOMING: ['PENDING'],
  ACTIVE: ['STORE_ACCEPTED', 'DRIVER_ASSIGNED', 'IN_TRANSIT'],
  COMPLETED: ['DELIVERED', 'CANCELLED', 'REJECTED'],
};

const STATUS_BADGE: Record<string, { variant: BadgeVariant; label: string }> = {
  PENDING: { variant: 'warning', label: 'Pending' },
  STORE_ACCEPTED: { variant: 'info', label: 'Preparing' },
  DRIVER_ASSIGNED: { variant: 'purple', label: 'Driver assigned' },
  IN_TRANSIT: { variant: 'success', label: 'In transit' },
  DELIVERED: { variant: 'success', label: 'Delivered' },
  CANCELLED: { variant: 'default', label: 'Cancelled' },
  REJECTED: { variant: 'error', label: 'Rejected' },
};

function timeAgo(date: string | Date): string {
  const ts = typeof date === 'string' ? new Date(date).getTime() : date.getTime();
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function OrderCard({ order }: { order: StoreOrder }) {
  const badge = STATUS_BADGE[order.status] ?? { variant: 'default' as const, label: order.status };

  return (
    <TouchableOpacity
      onPress={() => router.push(`/order/${order.id}`)}
      activeOpacity={0.7}
    >
      <Card padding={spacing.lg} style={{ gap: spacing.sm }}>
        <View style={styles.cardTop}>
          <View style={styles.idPill}>
            <Text style={styles.idText}>#{order.id.slice(-8).toUpperCase()}</Text>
          </View>
          <Badge variant={badge.variant} text={badge.label} />
        </View>

        <View style={styles.cardMeta}>
          <Ionicons name="cube-outline" size={14} color={colors.textSecondary} />
          <Text style={styles.metaText}>
            {order.itemsCount} item{order.itemsCount !== 1 ? 's' : ''}
          </Text>
          <Text style={styles.metaDot}>·</Text>
          <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
          <Text style={styles.metaText} numberOfLines={1}>
            {order.deliveryArea}
          </Text>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.totalText}>₹{order.total.toFixed(2)}</Text>
          <View style={styles.footerRight}>
            <Text style={styles.timeText}>{timeAgo(order.createdAt)}</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

function OrderSkeleton() {
  return (
    <Card padding={spacing.lg} style={{ gap: spacing.sm }}>
      <View style={styles.cardTop}>
        <Skeleton width={100} height={20} radius={radius.sm} />
        <Skeleton width={80} height={20} radius={radius.full} />
      </View>
      <Skeleton width="80%" height={14} />
      <View style={styles.cardFooter}>
        <Skeleton width={70} height={18} />
        <Skeleton width={60} height={14} />
      </View>
    </Card>
  );
}

export default function OrdersScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('INCOMING');

  const { data: orders, isLoading, refetch, isRefetching } = useQuery<StoreOrder[]>({
    queryKey: ['storeOrders', activeTab],
    queryFn: () =>
      api
        .get<StoreOrder[]>('/api/v1/stores/orders', {
          params: { statuses: TAB_STATUSES[activeTab].join(',') },
        })
        .then((r) => r.data),
    refetchInterval: activeTab !== 'COMPLETED' ? 15_000 : false,
  });

  const tabs: Tab[] = ['INCOMING', 'ACTIVE', 'COMPLETED'];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Orders</Text>
      </View>

      {/* Pill Tabs */}
      <View style={styles.tabBarWrap}>
        <View style={styles.tabBar}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                activeOpacity={0.7}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {tab === 'INCOMING' ? 'Incoming' : tab === 'ACTIVE' ? 'Active' : 'Completed'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.list}>
          <OrderSkeleton />
          <OrderSkeleton />
          <OrderSkeleton />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <OrderCard order={item} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={isRefetching}
          ListEmptyComponent={
            <EmptyState
              icon={
                activeTab === 'INCOMING'
                  ? 'mail-open-outline'
                  : activeTab === 'ACTIVE'
                  ? 'pause-circle-outline'
                  : 'checkmark-done-outline'
              }
              title={
                activeTab === 'INCOMING'
                  ? 'No incoming orders'
                  : activeTab === 'ACTIVE'
                  ? 'No active orders'
                  : 'No completed orders'
              }
              subtitle={
                activeTab === 'INCOMING'
                  ? 'New orders will appear here.'
                  : activeTab === 'ACTIVE'
                  ? 'Orders being prepared or in delivery show up here.'
                  : 'Past orders show up here.'
              }
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  tabBarWrap: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.gray100,
    padding: 4,
    borderRadius: radius.full,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: radius.full,
  },
  tabActive: {
    backgroundColor: colors.card,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  tabText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md, flexGrow: 1 },

  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  idPill: {
    backgroundColor: colors.gray100,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  idText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.gray700,
    fontFamily: 'Menlo',
    letterSpacing: 0.4,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  metaDot: { color: colors.gray300, marginHorizontal: 2 },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  totalText: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.primary,
  },
  timeText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
  },
});
