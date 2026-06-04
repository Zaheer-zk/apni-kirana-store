import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card } from '@/components/Card';
import { Badge, BadgeVariant } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Skeleton } from '@/components/Skeleton';
import { colors, fontSize, radius, spacing } from '@/constants/theme';
import type { OrderDetail, OrderStatusEvent } from '@aks/shared';

// Canonical reject reasons — mirrors the web (store-web/app/orders/[id]/page.tsx
// REJECT_REASONS). Keeping the same labels means admin analytics can cluster
// rejection patterns across surfaces without normalising strings.
const REJECT_REASONS = [
  { value: 'OUT_OF_STOCK', label: 'Out of stock' },
  { value: 'CLOSING_SOON', label: "Closing soon — can't prepare in time" },
  { value: 'TOO_BUSY', label: 'Too busy right now' },
  { value: 'CANT_FULFILL', label: "Can't fulfill this order" },
  { value: 'OTHER', label: 'Other (describe below)' },
] as const;
type RejectReasonValue = (typeof REJECT_REASONS)[number]['value'];

const STATUS_TIMELINE_LABELS: Record<string, string> = {
  PENDING: 'Order Placed',
  STORE_ACCEPTED: 'Store Accepted',
  COOKING: 'Cooking',
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
  COOKING: { variant: 'warning', label: 'Cooking' },
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
  // Use real header height instead of hardcoded 100 — Android's bar height differs from iOS
  const headerHeight = useHeaderHeight();

  // Reject-dialog state. Lives at the screen level so the modal can survive
  // re-renders triggered by the mutation. `reason` is the canonical value
  // posted to the backend; `note` is appended when reason === 'OTHER' or the
  // owner wants to add extra context.
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState<RejectReasonValue>('OUT_OF_STOCK');
  const [rejectNote, setRejectNote] = useState('');

  const { data: order, isLoading } = useQuery<OrderDetail>({
    queryKey: ['orderDetail', id],
    // Backend wraps responses as { success, data } — unwrap to the inner payload
    queryFn: () =>
      api
        .get<{ success: boolean; data: OrderDetail }>(`/api/v1/orders/${id}`)
        .then((r) => r.data.data),
    enabled: !!id,
  });

  const acceptMutation = useMutation({
    // Backend route is /accept (not /store-accept)
    mutationFn: () => api.put(`/api/v1/orders/${id}/accept`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orderDetail', id] });
      queryClient.invalidateQueries({ queryKey: ['storeOrders'] });
      queryClient.invalidateQueries({ queryKey: ['storeActiveOrders'] });
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const rejectMutation = useMutation({
    // Backend route is /reject and requires a `reason` (1..500 chars).
    // We submit the structured value label + optional free-text note so admin
    // analytics can cluster patterns across surfaces (mirrors store-web).
    mutationFn: (reason: string) =>
      api.put(`/api/v1/orders/${id}/reject`, { reason }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orderDetail', id] });
      queryClient.invalidateQueries({ queryKey: ['storeOrders'] });
      setRejectOpen(false);
      router.back();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  function submitReject() {
    const selected = REJECT_REASONS.find((r) => r.value === rejectReason);
    const label = selected?.label ?? 'Store cannot fulfill this order';
    const trimmed = rejectNote.trim();
    if (rejectReason === 'OTHER' && trimmed.length < 3) {
      Alert.alert('Add a reason', 'Tell the customer why so they can adjust the order.');
      return;
    }
    const reason = trimmed ? `${label} — ${trimmed}` : label;
    rejectMutation.mutate(reason);
  }

  const markReadyMutation = useMutation({
    mutationFn: () => api.put(`/api/v1/orders/${id}/ready`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orderDetail', id] });
      queryClient.invalidateQueries({ queryKey: ['storeActiveOrders'] });
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  // Restaurant-only: STORE_ACCEPTED → COOKING. The customer sees a "Cooking"
  // milestone; the order is still routable to a driver afterwards via /ready.
  const markCookingMutation = useMutation({
    mutationFn: () => api.put(`/api/v1/orders/${id}/cooking`).then((r) => r.data),
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
  const isCooking = order.status === 'COOKING';
  const orderStore = (order as unknown as { store?: { category?: string } }).store;
  const isRestaurant = orderStore?.category === 'RESTAURANT';
  const alreadyPacked = !!(order as unknown as { packedAt?: string | null }).packedAt;
  const isBusy =
    acceptMutation.isPending ||
    rejectMutation.isPending ||
    markReadyMutation.isPending ||
    markCookingMutation.isPending;
  const badge = STATUS_BADGE[order.status] ?? { variant: 'default' as const, label: order.status };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: headerHeight + spacing.md }]}
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

      {/* Multi-store basket context — surfaces "you're one of N stores
          fulfilling this customer's basket". Counts-only on purpose;
          competitor store names aren't disclosed. */}
      {order.groupContext ? (
        <View style={styles.groupBanner}>
          <Text style={styles.groupBannerTitle}>
            Part of a multi-store basket · 1 of {order.groupContext.totalLegs} stores
          </Text>
          <Text style={styles.groupBannerMeta}>
            {order.groupContext.acceptedLegs}/{order.groupContext.totalLegs} accepted
            {' · '}
            {order.groupContext.deliveredLegs}/{order.groupContext.totalLegs} delivered
          </Text>
          <Text style={styles.groupBannerCopy}>
            One driver picks up from each store and delivers everything to the
            customer together. Decide on YOUR slice based on your inventory —
            the other legs are independent.
          </Text>
        </View>
      ) : null}

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
        {(() => {
          // Recipient block — surfaced when the customer placed the order for
          // someone else (e.g. gift / parent / colleague). Hidden otherwise.
          const recipientName = (order as unknown as { recipientName?: string | null })
            .recipientName;
          const recipientPhone = (order as unknown as { recipientPhone?: string | null })
            .recipientPhone;
          if (!recipientName && !recipientPhone) return null;
          return (
            <>
              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <View style={styles.infoIconWrap}>
                  <Ionicons name="person-outline" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Recipient (order for someone else)</Text>
                  <Text style={styles.infoValue}>
                    {[recipientName, recipientPhone].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </View>
            </>
          );
        })()}

        <View style={styles.privacyBox}>
          <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
          <Text style={styles.privacyText}>
            Customer details are hidden for privacy. The driver receives the
            full address.
          </Text>
        </View>
      </Card>

      {/* Payout breakdown — what the operator actually takes home. The
          backend stores `commission` on the order row at creation time, so
          this is exact (not a recomputed estimate). Delivery fee always
          goes to the driver, not the store. */}
      {(() => {
        const o = order as unknown as {
          subtotal?: number;
          commission?: number;
          deliveryFee?: number;
          paymentMethod?: string;
        };
        const subtotal = o.subtotal ?? 0;
        const commission = o.commission ?? 0;
        const storeNet = Math.max(0, subtotal - commission);
        const deliveryFee = o.deliveryFee ?? 0;
        return (
          <>
            <Text style={styles.sectionTitle}>Payout breakdown</Text>
            <Card padding={spacing.lg} style={{ marginBottom: spacing.lg }}>
              <View style={styles.payoutRow}>
                <Text style={styles.payoutLabel}>Items subtotal</Text>
                <Text style={styles.payoutValue}>₹{subtotal.toFixed(2)}</Text>
              </View>
              <View style={styles.payoutRow}>
                <Text style={styles.payoutLabel}>Platform commission</Text>
                <Text style={styles.payoutValueMuted}>− ₹{commission.toFixed(2)}</Text>
              </View>
              <View style={styles.payoutDivider} />
              <View style={styles.payoutRow}>
                <Text style={styles.payoutLabelBold}>Your payout</Text>
                <Text style={styles.payoutValueBold}>₹{storeNet.toFixed(2)}</Text>
              </View>
              <Text style={styles.payoutNote}>
                Delivery fee of ₹{deliveryFee.toFixed(2)} goes to the driver. Customer paid{' '}
                <Text style={{ fontWeight: '700', color: colors.textPrimary }}>
                  ₹{order.total.toFixed(2)}
                </Text>{' '}
                total{o.paymentMethod ? ` via ${o.paymentMethod}` : ''}.
              </Text>
            </Card>
          </>
        );
      })()}

      {/* Driver card — only once a driver is assigned. Matches store-web
          (apps/store-web/app/orders/[id]/page.tsx:362-401) feature set
          minus the live map (mobile keeps it lightweight; the customer
          app already has the live route view). */}
      {(() => {
        const driver = (order as unknown as {
          driver?: {
            vehicleType?: string | null;
            vehicleNumber?: string | null;
            user?: { name: string; phone: string } | null;
          } | null;
        }).driver;
        if (!driver) return null;
        return (
          <>
            <Text style={styles.sectionTitle}>Driver</Text>
            <Card padding={spacing.lg} style={{ marginBottom: spacing.lg }}>
              <View style={styles.driverRow}>
                <View style={styles.driverIconWrap}>
                  <Ionicons name="bicycle-outline" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.driverName}>{driver.user?.name ?? '—'}</Text>
                  {driver.vehicleNumber ? (
                    <Text style={styles.driverMeta}>
                      {driver.vehicleType ? `${driver.vehicleType} · ` : ''}
                      {driver.vehicleNumber}
                    </Text>
                  ) : null}
                </View>
                {driver.user?.phone ? (
                  <TouchableOpacity
                    style={styles.callBtn}
                    activeOpacity={0.7}
                    onPress={() => Linking.openURL(`tel:+91${driver.user!.phone}`)}
                  >
                    <Ionicons name="call-outline" size={16} color={colors.white} />
                    <Text style={styles.callBtnText}>Call</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </Card>
          </>
        );
      })()}

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
            onPress={() => {
              // Reset modal state each open so a previous rejection-attempt
              // doesn't pre-fill the next one.
              setRejectReason('OUT_OF_STOCK');
              setRejectNote('');
              setRejectOpen(true);
            }}
            style={[styles.rejectBtn, isBusy && { opacity: 0.55 }]}
          >
            {rejectMutation.isPending ? (
              <ActivityIndicator color={colors.error} size="small" />
            ) : (
              <Text style={styles.rejectBtnText}>Reject order</Text>
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

      {isAccepted && isRestaurant && !alreadyPacked && (
        <Button
          variant="primary"
          title="Start cooking"
          icon="flame-outline"
          fullWidth
          size="lg"
          onPress={() => markCookingMutation.mutate()}
          loading={markCookingMutation.isPending}
          disabled={isBusy}
        />
      )}

      {(isAccepted || isCooking) && !alreadyPacked && (
        <Button
          variant="primary"
          title={isCooking ? 'Mark food ready' : 'Mark ready for pickup'}
          icon="checkmark-done-outline"
          fullWidth
          size="lg"
          style={isAccepted && isRestaurant ? { marginTop: 12 } : undefined}
          onPress={() => markReadyMutation.mutate()}
          loading={markReadyMutation.isPending}
          disabled={isBusy}
        />
      )}

      {alreadyPacked && order.status === 'STORE_ACCEPTED' && (
        <Card style={{ alignItems: 'center', backgroundColor: colors.successLight }}>
          <Ionicons name="checkmark-circle" size={28} color={colors.success} />
          <Text style={{ marginTop: 6, fontWeight: '700', color: colors.success }}>
            Packed &amp; ready
          </Text>
          <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
            Waiting for a driver to pick this up.
          </Text>
        </Card>
      )}

      {['STORE_ACCEPTED', 'DRIVER_ASSIGNED', 'PICKED_UP'].includes(order.status) && (
        <Button
          variant="outline"
          title={
            order.status === 'PICKED_UP' ? 'Chat with driver' : 'Chat with customer'
          }
          icon="chatbubbles-outline"
          fullWidth
          size="lg"
          style={{ marginTop: 12 }}
          onPress={() => router.push(`/chat/${order.id}`)}
        />
      )}

      {/* Reject reasons sheet — bottom sheet via Modal. Mirrors the web's
          RejectDialog so admins can analyse rejection patterns by reason. */}
      <Modal
        transparent
        visible={rejectOpen}
        animationType="fade"
        onRequestClose={() => setRejectOpen(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.rejectBackdrop}
          onPress={() => !rejectMutation.isPending && setRejectOpen(false)}
        />
        <View style={styles.rejectSheet}>
          <View style={styles.rejectHandle} />
          <Text style={styles.rejectTitle}>Reject this order?</Text>
          <Text style={styles.rejectSubtitle}>
            Tell the customer why so they can adjust their order.
          </Text>
          <View style={styles.rejectOptions}>
            {REJECT_REASONS.map((r) => {
              const selected = r.value === rejectReason;
              return (
                <TouchableOpacity
                  key={r.value}
                  activeOpacity={0.7}
                  onPress={() => setRejectReason(r.value)}
                  style={[styles.rejectOption, selected && styles.rejectOptionOn]}
                >
                  <View style={[styles.rejectRadio, selected && styles.rejectRadioOn]}>
                    {selected ? <View style={styles.rejectRadioDot} /> : null}
                  </View>
                  <Text style={[styles.rejectOptionLabel, selected && styles.rejectOptionLabelOn]}>
                    {r.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.rejectNoteLabel}>
            {rejectReason === 'OTHER' ? 'Details *' : 'Add a note (optional)'}
          </Text>
          <TextInput
            style={styles.rejectNoteInput}
            placeholder={
              rejectReason === 'OTHER'
                ? 'Tell the customer what happened'
                : 'Anything else the customer should know?'
            }
            placeholderTextColor={colors.textMuted}
            value={rejectNote}
            onChangeText={setRejectNote}
            multiline
            numberOfLines={3}
            maxLength={500}
            editable={!rejectMutation.isPending}
          />
          <View style={styles.rejectActions}>
            <TouchableOpacity
              style={[styles.rejectCancel, rejectMutation.isPending && { opacity: 0.5 }]}
              onPress={() => setRejectOpen(false)}
              disabled={rejectMutation.isPending}
              activeOpacity={0.7}
            >
              <Text style={styles.rejectCancelText}>Keep order</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.rejectConfirm, rejectMutation.isPending && { opacity: 0.6 }]}
              onPress={submitReject}
              disabled={rejectMutation.isPending}
              activeOpacity={0.7}
            >
              {rejectMutation.isPending ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.rejectConfirmText}>Reject order</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  // paddingTop is set dynamically (header height + spacing) by the screen; avoids 100px Android overlap
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  errorText: { color: colors.error, fontSize: fontSize.md, marginTop: spacing.md, fontWeight: '600' },

  orderHeader: { marginBottom: spacing.lg, gap: spacing.sm },
  groupBanner: {
    backgroundColor: colors.primary + '12', // soft tint of primary
    borderColor: colors.primary + '33',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: 4,
  },
  groupBannerTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.primary,
  },
  groupBannerMeta: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  groupBannerCopy: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 16,
  },
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
  // Payout breakdown
  payoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  payoutLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  payoutLabelBold: { fontSize: fontSize.md, fontWeight: '800', color: colors.textPrimary },
  payoutValue: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textPrimary },
  payoutValueMuted: { fontSize: fontSize.sm, color: colors.textMuted },
  payoutValueBold: { fontSize: fontSize.lg, fontWeight: '800', color: colors.primary },
  payoutDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  payoutNote: {
    marginTop: spacing.md,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    lineHeight: 16,
  },
  // Driver card
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  driverIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverName: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  driverMeta: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  callBtnText: { color: colors.white, fontWeight: '700', fontSize: fontSize.xs },
  // Reject reasons sheet
  rejectBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
  },
  rejectSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  rejectHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  rejectTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.textPrimary },
  rejectSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: -spacing.xs },
  rejectOptions: { gap: spacing.sm },
  rejectOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  rejectOptionOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  rejectRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectRadioOn: { borderColor: colors.primary },
  rejectRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  rejectOptionLabel: { flex: 1, fontSize: fontSize.sm, color: colors.textPrimary },
  rejectOptionLabelOn: { fontWeight: '700' },
  rejectNoteLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  rejectNoteInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    backgroundColor: colors.white,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  rejectActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  rejectCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
  },
  rejectCancelText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  rejectConfirm: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.error,
    alignItems: 'center',
  },
  rejectConfirmText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.white },
});
