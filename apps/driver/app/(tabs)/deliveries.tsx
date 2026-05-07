import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card } from '@/components/Card';
import { Badge, type BadgeVariant } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { colors, fontSize, radius, spacing } from '@/constants/theme';
import type { DriverDelivery } from '@aks/shared';

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  DELIVERED: 'success',
  REJECTED: 'error',
  CANCELLED: 'warning',
  IN_TRANSIT: 'info',
  PICKED_UP: 'info',
  DRIVER_ASSIGNED: 'info',
};

function formatStatus(s: string): string {
  return s.replaceAll('_', ' ').replaceAll(/\b\w/g, (c) => c.toUpperCase());
}

interface DeliveryCardProps {
  item: DriverDelivery;
}

function DeliveryCard({ item }: Readonly<DeliveryCardProps>) {
  const variant = STATUS_VARIANTS[item.status] ?? 'default';
  const date = new Date(item.createdAt);
  const dateStr = date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const timeStr = date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Card style={styles.card}>
      <View style={styles.cardTop}>
        <View>
          <Text style={styles.dateText}>{dateStr}</Text>
          <Text style={styles.timeText}>{timeStr}</Text>
        </View>
        <Badge variant={variant} text={formatStatus(item.status)} dot />
      </View>

      <View style={styles.cardRow}>
        <View style={styles.iconCol}>
          <View style={[styles.routeNode, { backgroundColor: colors.info }]}>
            <Ionicons name="storefront" size={10} color={colors.white} />
          </View>
          <View style={styles.routeLine} />
          <View style={[styles.routeNode, { backgroundColor: colors.accent }]}>
            <Ionicons name="home" size={10} color={colors.white} />
          </View>
        </View>
        <View style={styles.addressCol}>
          <Text style={styles.addressLabel}>PICKUP</Text>
          <Text style={styles.addressText} numberOfLines={2}>
            {item.pickupArea}
          </Text>
          <View style={styles.addressGap} />
          <Text style={styles.addressLabel}>DELIVERY</Text>
          <Text style={styles.addressText} numberOfLines={2}>
            {item.deliveryArea}
          </Text>
        </View>
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.orderId}>
          Order #{item.orderId.slice(-8).toUpperCase()}
        </Text>
        <Text style={styles.earningsText}>+₹{item.driverEarnings.toFixed(2)}</Text>
      </View>
    </Card>
  );
}

function ListSkeleton() {
  return (
    <View style={styles.list}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.skeletonCard}>
          <View style={styles.skeletonRow}>
            <Skeleton width={140} height={14} />
            <Skeleton width={80} height={20} radius={999} />
          </View>
          <Skeleton width="80%" height={14} style={{ marginTop: spacing.md }} />
          <Skeleton width="60%" height={14} style={{ marginTop: spacing.sm }} />
          <View style={[styles.skeletonRow, { marginTop: spacing.lg }]}>
            <Skeleton width={120} height={12} />
            <Skeleton width={60} height={16} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function DeliveriesScreen() {
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery<DriverDelivery[]>({
    queryKey: ['driverDeliveries'],
    queryFn: async () => {
      const r = await api.get<
        DriverDelivery[] | { success: boolean; data: DriverDelivery[] }
      >('/api/v1/drivers/deliveries');
      const body = r.data;
      if (Array.isArray(body)) return body;
      if (body && typeof body === 'object' && Array.isArray((body as { data?: unknown }).data)) {
        return (body as { data: DriverDelivery[] }).data;
      }
      return [];
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  return (
    // Android: include left/right so list respects horizontal insets (tab bar handles bottom)
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Delivery History</Text>
        <Text style={styles.headerSubtitle}>
          {(data?.length ?? 0) === 1
            ? '1 delivery completed'
            : `${data?.length ?? 0} deliveries completed`}
        </Text>
      </View>

      {isLoading && <ListSkeleton />}

      {isError && !isLoading && (
        <View style={styles.centerContent}>
          <EmptyState
            icon="alert-circle-outline"
            title="Failed to load deliveries"
            subtitle="Pull down to try again."
            iconBg={colors.errorLight}
            iconColor={colors.error}
            actionLabel="Retry"
            onAction={() => refetch()}
          />
        </View>
      )}

      {!isLoading && data?.length === 0 && (
        <EmptyState
          icon="cube-outline"
          title="No deliveries yet"
          subtitle="Go online from the dashboard to start receiving delivery requests."
        />
      )}

      {!isLoading && (data?.length ?? 0) > 0 && data && (
        <FlatList
          data={data}
          keyExtractor={(item) => item.orderId}
          renderItem={({ item }) => <DeliveryCard item={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
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
    paddingBottom: spacing.lg,
  },
  headerTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  list: {
    padding: spacing.xl,
    paddingTop: 0,
    gap: spacing.md,
  },
  card: { gap: spacing.md },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  dateText: { fontSize: fontSize.sm, color: colors.textPrimary, fontWeight: '700' },
  timeText: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },

  cardRow: { flexDirection: 'row', gap: spacing.md },
  iconCol: { alignItems: 'center', width: 24, paddingTop: 2 },
  routeNode: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeLine: {
    flex: 1,
    width: 2,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  addressCol: { flex: 1 },
  addressLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  addressText: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: '600',
    marginTop: 2,
  },
  addressGap: { height: spacing.md },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.md,
  },
  orderId: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '600' },
  earningsText: { fontSize: fontSize.md, fontWeight: '800', color: colors.accent },

  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  skeletonCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  skeletonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
