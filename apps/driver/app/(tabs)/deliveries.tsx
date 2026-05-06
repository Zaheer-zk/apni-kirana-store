import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { DriverDelivery } from '@aks/shared';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  DELIVERED: { bg: '#DCFCE7', text: '#166534' },
  REJECTED: { bg: '#FEE2E2', text: '#991B1B' },
  CANCELLED: { bg: '#FEF3C7', text: '#92400E' },
  IN_TRANSIT: { bg: '#DBEAFE', text: '#1E40AF' },
};

function DeliveryCard({ item }: { item: DriverDelivery }) {
  const statusStyle = STATUS_COLORS[item.status] ?? { bg: '#F3F4F6', text: '#374151' };
  const date = new Date(item.createdAt);
  const dateStr = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.dateText}>{dateStr}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
          <Text style={[styles.statusText, { color: statusStyle.text }]}>{item.status}</Text>
        </View>
      </View>
      <View style={styles.cardRow}>
        <View style={styles.iconCol}>
          <Text style={styles.routeIcon}>📦</Text>
          <View style={styles.routeLine} />
          <Text style={styles.routeIcon}>📍</Text>
        </View>
        <View style={styles.addressCol}>
          <Text style={styles.addressLabel}>Pickup</Text>
          <Text style={styles.addressText}>{item.pickupArea}</Text>
          <View style={styles.addressGap} />
          <Text style={styles.addressLabel}>Delivery Area</Text>
          <Text style={styles.addressText}>{item.deliveryArea}</Text>
        </View>
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.orderId}>Order #{item.orderId.slice(-8).toUpperCase()}</Text>
        <Text style={styles.earningsText}>+₹{item.driverEarnings.toFixed(2)}</Text>
      </View>
    </View>
  );
}

export default function DeliveriesScreen() {
  const { data, isLoading, isError } = useQuery<DriverDelivery[]>({
    queryKey: ['driverDeliveries'],
    queryFn: () => api.get<DriverDelivery[]>('/api/v1/drivers/deliveries').then((r) => r.data),
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Delivery History</Text>
      </View>

      {isLoading && (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#DC2626" />
        </View>
      )}

      {isError && (
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>Failed to load deliveries.</Text>
        </View>
      )}

      {data && data.length === 0 && (
        <View style={styles.centerContent}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptyText}>No deliveries yet</Text>
          <Text style={styles.emptySubtext}>Start delivering to see your history here</Text>
        </View>
      )}

      {data && data.length > 0 && (
        <FlatList
          data={data}
          keyExtractor={(item) => item.orderId}
          renderItem={({ item }) => <DeliveryCard item={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
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
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  dateText: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: '700' },
  cardRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  iconCol: { alignItems: 'center', width: 24 },
  routeIcon: { fontSize: 16 },
  routeLine: { flex: 1, width: 2, backgroundColor: '#E5E7EB', marginVertical: 4 },
  addressCol: { flex: 1 },
  addressLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase' },
  addressText: { fontSize: 14, color: '#111827', fontWeight: '500', marginBottom: 2 },
  addressGap: { height: 12 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 10 },
  orderId: { fontSize: 12, color: '#9CA3AF', fontWeight: '500' },
  earningsText: { fontSize: 16, fontWeight: '800', color: '#16A34A' },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  errorText: { color: '#DC2626', fontSize: 15 },
  emptyIcon: { fontSize: 48, marginBottom: 8 },
  emptyText: { fontSize: 18, fontWeight: '700', color: '#374151' },
  emptySubtext: { fontSize: 13, color: '#9CA3AF' },
});
