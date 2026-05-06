import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useStorePortalStore } from '@/store/store.store';
import { IncomingOrderBanner } from '@/components/IncomingOrderBanner';
import { initSocket } from '@/lib/socket';
import type { StoreOrder, StoreDashboardStats } from '@aks/shared';

const ORDER_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  STORE_ACCEPTED: { bg: '#DBEAFE', text: '#1E40AF' },
  DRIVER_ASSIGNED: { bg: '#EDE9FE', text: '#5B21B6' },
  PENDING: { bg: '#FEF3C7', text: '#92400E' },
};

function ActiveOrderCard({ order }: { order: StoreOrder }) {
  const statusStyle = ORDER_STATUS_COLORS[order.status] ?? { bg: '#F3F4F6', text: '#374151' };

  return (
    <TouchableOpacity
      style={styles.orderCard}
      onPress={() => router.push(`/order/${order.id}`)}
      activeOpacity={0.8}
    >
      <View style={styles.orderCardTop}>
        <Text style={styles.orderCardId}>#{order.id.slice(-8).toUpperCase()}</Text>
        <View style={[styles.orderStatusBadge, { backgroundColor: statusStyle.bg }]}>
          <Text style={[styles.orderStatusText, { color: statusStyle.text }]}>
            {order.status === 'STORE_ACCEPTED' ? 'Preparing' : 'Driver On Way'}
          </Text>
        </View>
      </View>
      <Text style={styles.orderCardItems}>
        {order.itemsCount} item{order.itemsCount !== 1 ? 's' : ''} · {order.deliveryArea}
      </Text>
      <Text style={styles.orderCardTotal}>₹{order.total.toFixed(2)}</Text>
    </TouchableOpacity>
  );
}

export default function DashboardScreen() {
  const { storeProfile, accessToken, incomingOrderId, setStoreOpen } = useStorePortalStore();
  const queryClient = useQueryClient();
  const isOpen = storeProfile?.isOpen ?? false;

  const { data: stats, isLoading: statsLoading } = useQuery<StoreDashboardStats>({
    queryKey: ['storeDashboardStats'],
    queryFn: () =>
      api.get<StoreDashboardStats>('/api/v1/stores/stats/today').then((r) => r.data),
    refetchInterval: 30_000,
  });

  const { data: activeOrders, isLoading: ordersLoading } = useQuery<StoreOrder[]>({
    queryKey: ['storeActiveOrders'],
    queryFn: () =>
      api.get<StoreOrder[]>('/api/v1/stores/orders/active').then((r) => r.data),
    refetchInterval: 15_000,
  });

  const toggleOpenMutation = useMutation({
    mutationFn: (open: boolean) =>
      api.put('/api/v1/stores/status', { isOpen: open }).then((r) => r.data),
    onMutate: (open) => setStoreOpen(open),
    onError: (_, open) => {
      setStoreOpen(!open);
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
    <SafeAreaView style={styles.safe}>
      {/* Incoming Order Banner */}
      {incomingOrderId && <IncomingOrderBanner orderId={incomingOrderId} />}

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.storeName} numberOfLines={1}>
              {storeProfile?.name ?? 'My Store'}
            </Text>
            <Text style={styles.headerSubtitle}>Store Portal</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={[styles.openLabel, isOpen ? styles.openLabelOpen : styles.openLabelClosed]}>
              {isOpen ? 'Open' : 'Closed'}
            </Text>
            <Switch
              value={isOpen}
              onValueChange={(val) => toggleOpenMutation.mutate(val)}
              trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
              thumbColor={isOpen ? '#2563EB' : '#9CA3AF'}
              disabled={toggleOpenMutation.isPending}
            />
          </View>
        </View>

        {/* Today's Stats */}
        {statsLoading ? (
          <ActivityIndicator color="#2563EB" style={{ marginVertical: 20 }} />
        ) : (
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats?.ordersReceived ?? 0}</Text>
              <Text style={styles.statLabel}>Orders{'\n'}Received</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, styles.statValueGreen]}>{stats?.ordersCompleted ?? 0}</Text>
              <Text style={styles.statLabel}>Completed</Text>
            </View>
            <View style={[styles.statCard, styles.statCardAccent]}>
              <Text style={[styles.statValue, styles.statValueBlue]}>₹{stats?.revenue ?? 0}</Text>
              <Text style={styles.statLabel}>Revenue{'\n'}Today</Text>
            </View>
          </View>
        )}

        {/* Active Orders */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Active Orders</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/orders')}>
            <Text style={styles.sectionLink}>View All</Text>
          </TouchableOpacity>
        </View>

        {ordersLoading && <ActivityIndicator color="#2563EB" />}

        {!ordersLoading && (!activeOrders || activeOrders.length === 0) && (
          <View style={styles.emptyOrders}>
            <Text style={styles.emptyOrdersIcon}>📭</Text>
            <Text style={styles.emptyOrdersText}>No active orders right now</Text>
          </View>
        )}

        {activeOrders?.map((order) => (
          <ActiveOrderCard key={order.id} order={order} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 32 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerLeft: { flex: 1, marginRight: 12 },
  storeName: { fontSize: 20, fontWeight: '800', color: '#111827' },
  headerSubtitle: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  openLabel: { fontSize: 13, fontWeight: '700' },
  openLabelOpen: { color: '#16A34A' },
  openLabelClosed: { color: '#DC2626' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statCardAccent: { backgroundColor: '#EFF6FF' },
  statValue: { fontSize: 26, fontWeight: '800', color: '#111827' },
  statValueGreen: { color: '#16A34A' },
  statValueBlue: { color: '#2563EB', fontSize: 20 },
  statLabel: { fontSize: 11, color: '#9CA3AF', textAlign: 'center', marginTop: 4, lineHeight: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  sectionLink: { fontSize: 13, color: '#2563EB', fontWeight: '600' },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#2563EB',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  orderCardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  orderCardId: { fontSize: 14, fontWeight: '700', color: '#111827' },
  orderStatusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  orderStatusText: { fontSize: 11, fontWeight: '700' },
  orderCardItems: { fontSize: 13, color: '#6B7280', marginBottom: 4 },
  orderCardTotal: { fontSize: 15, fontWeight: '800', color: '#2563EB' },
  emptyOrders: { alignItems: 'center', paddingVertical: 32 },
  emptyOrdersIcon: { fontSize: 40, marginBottom: 8 },
  emptyOrdersText: { fontSize: 14, color: '#9CA3AF' },
});
