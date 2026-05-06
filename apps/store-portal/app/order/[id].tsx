import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card } from '@/components/Card';
import { Badge, BadgeVariant } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Skeleton } from '@/components/Skeleton';
import { colors, fontSize, radius, spacing } from '@/constants/theme';
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

const STATUS_BADGE: Record<string, { variant: BadgeVariant; label: string }> = {
  PENDING: { variant: 'warning', label: 'Pending' },
  STORE_ACCEPTED: { variant: 'info', label: 'Preparing' },
  DRIVER_ASSIGNED: { variant: 'purple', label: 'Driver assigned' },
  IN_TRANSIT: { variant: 'success', label: 'In transit' },
  DELIVERED: { variant: 'success', label: 'Delivered' },
  CANCELLED: { variant: 'default', label: 'Cancelled' },
  REJECTED: { variant: 'error', label: 'Rejected' },
  STORE_REJECTED: { variant: 'error', label: 'Rejected' },
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
        <View style={{ gap: spacing.md, padding: spacing.xl, width: '100%' }}>
          <Skeleton width={180} height={28} />
          <Skeleton width={120} height={14} />
          <Skeleton height={120} radius={radius.lg} />
          <Skeleton height={80} radius={radius.lg} />
        </View>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
        <Text style={styles.errorText}>Order not found</Text>
      </View>
    );
  }

  const isPending = order.status === 'PENDING';
  const isAccepted = order.status === 'STORE_ACCEPTED';
  const isBusy =
    acceptMutation.isPending || rejectMutation.isPending || markReadyMutation.isPending;
  const badge = STATUS_BADGE[order.status] ?? { variant: 'default' as const, label: order.status };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.orderHeader}>
        <View style={styles.orderHeaderTop}>
          <Text style={styles.orderIdText}>
            #{order.id.slice(-8).toUpperCase()}
          </Text>
          <Badge variant={badge.variant} text={badge.label} dot />
        </View>
        <Text style={styles.orderTime}>
          Placed{' '}
          {new Date(order.createdAt).toLocaleString('en-IN', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>

      {/* Items */}
      <Text style={styles.sectionTitle}>Items</Text>
      <Card padding={spacing.lg} style={{ marginBottom: spacing.lg }}>
        {order.items.map((item, idx) => (
          <React.Fragment key={item.itemId}>
            <View style={styles.itemRow}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemUnit}>{item.unit}</Text>
              </View>
              <View style={styles.itemRight}>
                <Text style={styles.itemQty}>×{item.quantity}</Text>
                <Text style={styles.itemPrice}>
                  ₹{(item.price * item.quantity).toFixed(2)}
                </Text>
              </View>
            </View>
            {idx < order.items.length - 1 && <View style={styles.itemDivider} />}
          </React.Fragment>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>₹{order.total.toFixed(2)}</Text>
        </View>
      </Card>

      {/* Delivery (privacy-safe) */}
      <Text style={styles.sectionTitle}>Delivery info</Text>
      <Card padding={spacing.lg} style={{ marginBottom: spacing.lg }}>
        <View style={styles.infoRow}>
          <View style={styles.infoIconWrap}>
            <Ionicons name="location-outline" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoLabel}>Area</Text>
            <Text style={styles.infoValue}>{order.deliveryArea}</Text>
          </View>
        </View>
        <View style={styles.infoDivider} />
        <View style={styles.infoRow}>
          <View style={styles.infoIconWrap}>
            <Ionicons name="map-outline" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoLabel}>Pincode</Text>
            <Text style={styles.infoValue}>{order.deliveryPincode}</Text>
          </View>
        </View>
        <View style={styles.privacyBox}>
          <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
          <Text style={styles.privacyText}>
            Customer details are hidden for privacy. The driver receives the
            full address.
          </Text>
        </View>
      </Card>

      {/* Timeline */}
      <Text style={styles.sectionTitle}>Order timeline</Text>
      <Card padding={spacing.lg} style={{ marginBottom: spacing.lg }}>
        {order.statusTimeline?.map((event, idx) => (
          <TimelineItem
            key={event.status}
            event={event}
            isLast={idx === (order.statusTimeline?.length ?? 0) - 1}
          />
        ))}
      </Card>

      {/* Actions */}
      {isPending && (
        <View style={styles.actions}>
          <TouchableOpacity
            activeOpacity={0.7}
            disabled={isBusy}
            onPress={() =>
              Alert.alert('Reject order', 'Are you sure you want to reject this order?', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Reject',
                  style: 'destructive',
                  onPress: () => rejectMutation.mutate(),
                },
              ])
            }
            style={[styles.rejectBtn, isBusy && { opacity: 0.55 }]}
          >
            {rejectMutation.isPending ? (
              <ActivityIndicator color={colors.error} size="small" />
            ) : (
              <Text style={styles.rejectBtnText}>Reject Order</Text>
            )}
          </TouchableOpacity>
          <Button
            variant="primary"
            title="Accept Order"
            icon="checkmark-circle-outline"
            fullWidth
            style={styles.actionBtn}
            onPress={() => acceptMutation.mutate()}
            loading={acceptMutation.isPending}
            disabled={isBusy}
          />
        </View>
      )}

      {isAccepted && (
        <Button
          variant="primary"
          title="Mark ready for pickup"
          icon="checkmark-done-outline"
          fullWidth
          size="lg"
          onPress={() => markReadyMutation.mutate()}
          loading={markReadyMutation.isPending}
          disabled={isBusy}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 100, paddingBottom: spacing.xxxl },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  errorText: { color: colors.error, fontSize: fontSize.md, marginTop: spacing.md, fontWeight: '600' },

  orderHeader: { marginBottom: spacing.lg, gap: spacing.sm },
  orderHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderIdText: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: 'Menlo',
    letterSpacing: 0.4,
  },
  orderTime: { fontSize: fontSize.sm, color: colors.textMuted },

  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },

  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  itemInfo: { flex: 1 },
  itemName: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary },
  itemUnit: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  itemRight: { alignItems: 'flex-end', gap: 2 },
  itemQty: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  itemPrice: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  itemDivider: { height: 1, backgroundColor: colors.divider },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  totalValue: { fontSize: fontSize.xl, fontWeight: '800', color: colors.primary },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  infoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLabel: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '600' },
  infoValue: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    fontWeight: '600',
    marginTop: 2,
  },
  infoDivider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.xs },
  privacyBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.gray100,
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.sm,
  },
  privacyText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 16,
  },

  timelineItem: { flexDirection: 'row', gap: spacing.md, paddingVertical: 2 },
  timelineLeft: { alignItems: 'center', width: 16 },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.gray300,
    marginTop: 4,
  },
  timelineDotActive: { backgroundColor: colors.primary },
  timelineLine: { width: 2, flex: 1, backgroundColor: colors.border, marginTop: 4 },
  timelineContent: { flex: 1, paddingBottom: spacing.lg },
  timelineLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  timelineLabelActive: { color: colors.textPrimary, fontWeight: '700' },
  timelineTime: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },

  actions: { flexDirection: 'row', gap: spacing.md },
  actionBtn: { flex: 1 },
  rejectBtn: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.error,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtnText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.error,
  },
});
