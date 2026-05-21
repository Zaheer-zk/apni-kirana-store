import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card } from '@/components/Card';
import { Skeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

interface RestockOrder {
  id: string;
  status: string;
  total: number;
  subtotal: number;
  deliveryFee: number;
  createdAt: string;
  items: Array<{ id: string; name: string; qty: number }>;
  store?: { name: string; owner?: { name: string | null; phone: string } };
}

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  PENDING: { bg: '#FEF3C7', fg: '#B45309', label: 'Awaiting wholesaler' },
  STORE_ACCEPTED: { bg: '#DBEAFE', fg: '#1D4ED8', label: 'Accepted' },
  DRIVER_ASSIGNED: { bg: '#DBEAFE', fg: '#1D4ED8', label: 'Driver assigned' },
  PICKED_UP: { bg: '#E0E7FF', fg: '#4338CA', label: 'On the way' },
  DELIVERED: { bg: '#D1FAE5', fg: '#15803D', label: 'Delivered' },
  CANCELLED: { bg: '#FEE2E2', fg: '#B91C1C', label: 'Cancelled' },
  REJECTED: { bg: '#FEE2E2', fg: '#B91C1C', label: 'Declined' },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { bg: colors.gray100, fg: colors.textMuted, label: status };
  return (
    <View style={[styles.pill, { backgroundColor: s.bg }]}>
      <Text style={[styles.pillText, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

function OrderCard({ order }: { order: RestockOrder }) {
  const itemSummary = order.items
    .slice(0, 3)
    .map((i) => `${i.name} ×${i.qty}`)
    .join(', ');
  const more = order.items.length - 3;
  return (
    <Card padding={spacing.md}>
      <View style={styles.cardTop}>
        <Text style={styles.orderId}>#{order.id.slice(-6).toUpperCase()}</Text>
        <StatusPill status={order.status} />
      </View>
      <View style={styles.wsRow}>
        <Ionicons name="business" size={14} color={colors.textMuted} />
        <Text style={styles.wsName} numberOfLines={1}>
          {order.store?.name ?? 'Wholesaler'}
        </Text>
      </View>
      <Text style={styles.items} numberOfLines={2}>
        {itemSummary}
        {more > 0 ? ` +${more} more` : ''}
      </Text>
      <View style={styles.cardBottom}>
        <Text style={styles.date}>
          {new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
        </Text>
        <Text style={styles.total}>₹{order.total.toFixed(2)}</Text>
      </View>
    </Card>
  );
}

export default function RestockOrdersScreen() {
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery<RestockOrder[]>({
    queryKey: ['restock-orders'],
    queryFn: async () => {
      const res = await api.get('/api/v1/orders/restock', { params: { limit: 50 } });
      return res.data?.data?.orders ?? [];
    },
    refetchOnMount: 'always',
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      {isLoading ? (
        <View style={styles.list}>
          {[0, 1, 2].map((n) => (
            <Card key={n} padding={spacing.md}>
              <Skeleton width="50%" height={14} />
              <View style={{ height: spacing.sm }} />
              <Skeleton width="80%" height={12} />
            </Card>
          ))}
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(o) => o.id}
          renderItem={({ item }) => <OrderCard order={item} />}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <EmptyState
              icon={isError ? 'cloud-offline-outline' : 'receipt-outline'}
              title={isError ? 'Could not load orders' : 'No restock orders yet'}
              subtitle={
                isError
                  ? 'Pull down to retry.'
                  : 'Restock orders you place with wholesalers will appear here.'
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
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md, flexGrow: 1 },

  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderId: { fontSize: fontSize.md, fontWeight: '800', color: colors.textPrimary },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm },
  pillText: { fontSize: 11, fontWeight: '700' },

  wsRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
  wsName: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600', flex: 1 },

  items: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 20 },

  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  date: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '600' },
  total: { fontSize: fontSize.md, fontWeight: '800', color: colors.textPrimary },
});
