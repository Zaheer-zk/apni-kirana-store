import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { StoreOrder, OrderStatus } from '@aks/shared';

type Tab = 'INCOMING' | 'ACTIVE' | 'COMPLETED';

const TAB_STATUSES: Record<Tab, OrderStatus[]> = {
  INCOMING: ['PENDING'],
  ACTIVE: ['STORE_ACCEPTED', 'DRIVER_ASSIGNED', 'IN_TRANSIT'],
  COMPLETED: ['DELIVERED', 'CANCELLED', 'REJECTED'],
};

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  PENDING: { bg: '#FEF3C7', text: '#92400E', label: 'Pending' },
  STORE_ACCEPTED: { bg: '#DBEAFE', text: '#1E40AF', label: 'Preparing' },
  DRIVER_ASSIGNED: { bg: '#EDE9FE', text: '#5B21B6', label: 'Driver Assigned' },
  IN_TRANSIT: { bg: '#D1FAE5', text: '#065F46', label: 'In Transit' },
  DELIVERED: { bg: '#DCFCE7', text: '#166534', label: 'Delivered' },
  CANCELLED: { bg: '#F3F4F6', text: '#374151', label: 'Cancelled' },
  REJECTED: { bg: '#FEE2E2', text: '#991B1B', label: 'Rejected' },
};

function OrderCard({ order }: { order: StoreOrder }) {
  const badge = STATUS_BADGE[order.status] ?? { bg: '#F3F4F6', text: '#374151', label: order.status };
  const timeStr = new Date(order.createdAt).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/order/${order.id}`)}
      activeOpacity={0.8}
    >
      <View style={styles.cardTop}>
        <Text style={styles.orderId}>#{order.id.slice(-8).toUpperCase()}</Text>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
        </View>
      </View>

      <View style={styles.cardMeta}>
        <Text style={styles.metaText}>
          {order.itemsCount} item{order.itemsCount !== 1 ? 's' : ''}
        </Text>
        <Text style={styles.metaDot}>·</Text>
        <Text style={styles.metaText}>{order.deliveryArea}</Text>
        <Text style={styles.metaDot}>·</Text>
        <Text style={styles.metaText}>{timeStr}</Text>
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.totalText}>₹{order.total.toFixed(2)}</Text>
        <Text style={styles.chevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function OrdersScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('INCOMING');

  const { data: orders, isLoading, refetch } = useQuery<StoreOrder[]>({
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
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Orders</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'INCOMING' ? 'Incoming' : tab === 'ACTIVE' ? 'Active' : 'Completed'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <OrderCard order={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>
                {activeTab === 'INCOMING' ? '📭' : activeTab === 'ACTIVE' ? '⏸️' : '✅'}
              </Text>
              <Text style={styles.emptyText}>
                {activeTab === 'INCOMING'
                  ? 'No incoming orders'
                  : activeTab === 'ACTIVE'
                  ? 'No active orders'
                  : 'No completed orders'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#2563EB' },
  tabText: { fontSize: 14, color: '#6B7280', fontWeight: '600' },
  tabTextActive: { color: '#2563EB' },
  list: { padding: 16, gap: 10 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  orderId: { fontSize: 15, fontWeight: '700', color: '#111827' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  metaText: { fontSize: 13, color: '#6B7280' },
  metaDot: { color: '#D1D5DB' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalText: { fontSize: 16, fontWeight: '800', color: '#111827' },
  chevron: { fontSize: 22, color: '#D1D5DB' },
  emptyContainer: { alignItems: 'center', paddingTop: 64 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 15, color: '#9CA3AF' },
});
