import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { OrderDetail, OrderStatusEvent } from '@aks/shared';

const STATUS_TIMELINE_LABELS: Record<string, string> = {
  PENDING: 'Order Placed',
  STORE_ACCEPTED: 'Store Accepted',
  STORE_REJECTED: 'Store Rejected',
  DRIVER_ASSIGNED: 'Driver Assigned',
  IN_TRANSIT: 'Out for Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected',
};

function TimelineItem({ event, isLast }: { event: OrderStatusEvent; isLast: boolean }) {
  return (
    <View style={styles.timelineItem}>
      <View style={styles.timelineLeft}>
        <View style={[styles.timelineDot, event.isCurrent && styles.timelineDotActive]} />
        {!isLast && <View style={styles.timelineLine} />}
      </View>
      <View style={styles.timelineContent}>
        <Text style={[styles.timelineLabel, event.isCurrent && styles.timelineLabelActive]}>
          {STATUS_TIMELINE_LABELS[event.status] ?? event.status}
        </Text>
        {event.timestamp && (
          <Text style={styles.timelineTime}>
            {new Date(event.timestamp).toLocaleString('en-IN', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        )}
      </View>
    </View>
  );
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: order, isLoading } = useQuery<OrderDetail>({
    queryKey: ['orderDetail', id],
    queryFn: () => api.get<OrderDetail>(`/api/v1/orders/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const acceptMutation = useMutation({
    mutationFn: () => api.put(`/api/v1/orders/${id}/store-accept`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orderDetail', id] });
      queryClient.invalidateQueries({ queryKey: ['storeOrders'] });
      queryClient.invalidateQueries({ queryKey: ['storeActiveOrders'] });
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const rejectMutation = useMutation({
    mutationFn: () => api.put(`/api/v1/orders/${id}/store-reject`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orderDetail', id] });
      queryClient.invalidateQueries({ queryKey: ['storeOrders'] });
      router.back();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const markReadyMutation = useMutation({
    mutationFn: () => api.put(`/api/v1/orders/${id}/ready`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orderDetail', id] });
      queryClient.invalidateQueries({ queryKey: ['storeActiveOrders'] });
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Order not found</Text>
      </View>
    );
  }

  const isPending = order.status === 'PENDING';
  const isAccepted = order.status === 'STORE_ACCEPTED';
  const isBusy = acceptMutation.isPending || rejectMutation.isPending || markReadyMutation.isPending;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.orderHeader}>
        <Text style={styles.orderIdText}>Order #{order.id.slice(-8).toUpperCase()}</Text>
        <Text style={styles.orderTime}>
          {new Date(order.createdAt).toLocaleString('en-IN', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>

      {/* Items */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Items</Text>
        <View style={styles.card}>
          {order.items.map((item, idx) => (
            <React.Fragment key={item.itemId}>
              <View style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemUnit}>{item.unit}</Text>
                </View>
                <View style={styles.itemRight}>
                  <Text style={styles.itemQty}>x{item.quantity}</Text>
                  <Text style={styles.itemPrice}>₹{(item.price * item.quantity).toFixed(2)}</Text>
                </View>
              </View>
              {idx < order.items.length - 1 && <View style={styles.itemDivider} />}
            </React.Fragment>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>₹{order.total.toFixed(2)}</Text>
          </View>
        </View>
      </View>

      {/* Delivery Info (privacy-safe) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Delivery Info</Text>
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Area</Text>
            <Text style={styles.infoValue}>{order.deliveryArea}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Pincode</Text>
            <Text style={styles.infoValue}>{order.deliveryPincode}</Text>
          </View>
        </View>
      </View>

      {/* Timeline */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Order Timeline</Text>
        <View style={styles.card}>
          {order.statusTimeline?.map((event, idx) => (
            <TimelineItem
              key={event.status}
              event={event}
              isLast={idx === (order.statusTimeline?.length ?? 0) - 1}
            />
          ))}
        </View>
      </View>

      {/* Actions */}
      {isPending && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            onPress={() =>
              Alert.alert('Reject Order', 'Are you sure you want to reject this order?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reject', style: 'destructive', onPress: () => rejectMutation.mutate() },
              ])
            }
            disabled={isBusy}
          >
            {rejectMutation.isPending ? (
              <ActivityIndicator color="#DC2626" />
            ) : (
              <Text style={styles.rejectBtnText}>Reject Order</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.acceptBtn]}
            onPress={() => acceptMutation.mutate()}
            disabled={isBusy}
          >
            {acceptMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.acceptBtnText}>Accept Order</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {isAccepted && (
        <TouchableOpacity
          style={[styles.readyButton, isBusy && styles.readyButtonDisabled]}
          onPress={() => markReadyMutation.mutate()}
          disabled={isBusy}
        >
          {markReadyMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.readyButtonText}>Mark Ready for Pickup</Text>
          )}
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 20, paddingBottom: 40 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#DC2626', fontSize: 16 },
  orderHeader: { marginBottom: 24 },
  orderIdText: { fontSize: 20, fontWeight: '800', color: '#111827' },
  orderTime: { fontSize: 13, color: '#9CA3AF', marginTop: 4 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#6B7280', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  itemUnit: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  itemRight: { alignItems: 'flex-end', gap: 2 },
  itemQty: { fontSize: 13, color: '#6B7280' },
  itemPrice: { fontSize: 14, fontWeight: '700', color: '#111827' },
  itemDivider: { height: 1, backgroundColor: '#F3F4F6' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    marginTop: 4,
  },
  totalLabel: { fontSize: 15, fontWeight: '700', color: '#111827' },
  totalValue: { fontSize: 18, fontWeight: '800', color: '#2563EB' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14 },
  infoLabel: { fontSize: 14, color: '#6B7280' },
  infoValue: { fontSize: 14, color: '#111827', fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#F3F4F6' },
  timelineItem: { flexDirection: 'row', gap: 12, paddingVertical: 2 },
  timelineLeft: { alignItems: 'center', width: 16 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#D1D5DB', marginTop: 4 },
  timelineDotActive: { backgroundColor: '#2563EB' },
  timelineLine: { width: 2, flex: 1, backgroundColor: '#E5E7EB', marginTop: 4 },
  timelineContent: { flex: 1, paddingBottom: 16 },
  timelineLabel: { fontSize: 14, color: '#6B7280', fontWeight: '500' },
  timelineLabelActive: { color: '#111827', fontWeight: '700' },
  timelineTime: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  actionBtn: { flex: 1, height: 52, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  rejectBtn: { backgroundColor: '#FEE2E2', borderWidth: 1.5, borderColor: '#DC2626' },
  rejectBtnText: { color: '#DC2626', fontSize: 15, fontWeight: '700' },
  acceptBtn: { backgroundColor: '#2563EB' },
  acceptBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  readyButton: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  readyButtonDisabled: { opacity: 0.6 },
  readyButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
