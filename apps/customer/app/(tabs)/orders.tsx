import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { apiClient } from '@/lib/api';
import type { Order } from '@aks/shared';
import { OrderStatus } from '@aks/shared';

const ACTIVE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.STORE_ACCEPTED,
  OrderStatus.DRIVER_ASSIGNED,
  OrderStatus.PICKED_UP,
];

async function fetchOrders(): Promise<Order[]> {
  const res = await apiClient.get<{ data: Order[] }>('/api/v1/orders/mine');
  return res.data.data ?? [];
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function OrderCard({ order }: { order: Order }) {
  const itemsSummary =
    order.items.length === 1
      ? order.items[0].name
      : `${order.items[0].name} +${order.items.length - 1} more`;

  return (
    <TouchableOpacity
      style={styles.orderCard}
      onPress={() => router.push(`/order/${order.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.orderCardHeader}>
        <Text style={styles.orderId} numberOfLines={1}>
          #{order.id.slice(-8).toUpperCase()}
        </Text>
        <OrderStatusBadge status={order.status} />
      </View>

      <Text style={styles.itemsSummary} numberOfLines={1}>
        {itemsSummary}
      </Text>
      <Text style={styles.storeId}>Store ID: {order.storeId.slice(-8).toUpperCase()}</Text>

      <View style={styles.orderCardFooter}>
        <Text style={styles.total}>₹{order.total.toFixed(2)}</Text>
        <Text style={styles.timestamp}>
          {formatDate(order.createdAt)} · {formatTime(order.createdAt)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

type Tab = 'active' | 'past';

export default function OrdersScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('active');

  const { data: orders, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['orders'],
    queryFn: fetchOrders,
  });

  const filtered = (orders ?? []).filter((o) => {
    const isActive = ACTIVE_STATUSES.includes(o.status);
    return activeTab === 'active' ? isActive : !isActive;
  });

  return (
    <SafeAreaView style={styles.safe}>
      {/* Title */}
      <Text style={styles.screenTitle}>My Orders</Text>

      {/* Tab switcher */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'active' && styles.tabActive]}
          onPress={() => setActiveTab('active')}
        >
          <Text style={[styles.tabLabel, activeTab === 'active' && styles.tabLabelActive]}>
            Active
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'past' && styles.tabActive]}
          onPress={() => setActiveTab('past')}
        >
          <Text style={[styles.tabLabel, activeTab === 'past' && styles.tabLabelActive]}>
            Past
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color="#16A34A" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor="#16A34A"
              colors={['#16A34A']}
            />
          }
          renderItem={({ item }) => <OrderCard order={item} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>
                {activeTab === 'active' ? '🚀' : '📋'}
              </Text>
              <Text style={styles.emptyTitle}>
                {activeTab === 'active' ? 'No active orders' : 'No past orders'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {activeTab === 'active'
                  ? 'Place an order to get started!'
                  : "Your completed orders will appear here."}
              </Text>
              {activeTab === 'active' && (
                <TouchableOpacity
                  style={styles.shopButton}
                  onPress={() => router.push('/(tabs)/home')}
                >
                  <Text style={styles.shopButtonText}>Start Shopping</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  tabLabelActive: {
    color: '#16A34A',
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 12,
  },
  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 6,
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderId: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    fontFamily: 'monospace',
  },
  itemsSummary: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '500',
    marginTop: 4,
  },
  storeId: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  orderCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  total: {
    fontSize: 16,
    fontWeight: '700',
    color: '#16A34A',
  },
  timestamp: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 64,
    gap: 8,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  shopButton: {
    marginTop: 16,
    backgroundColor: '#16A34A',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 10,
  },
  shopButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
});
