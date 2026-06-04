import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '@/components/Card';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { apiClient } from '@/lib/api';
import { colors, fontSize, radius, spacing } from '@/constants/theme';
import { OrderStatus } from '@aks/shared';

/**
 * Customer rollup for a multi-store basket. Mirrors the customer-web
 * /orders/group/[id] page. Backend GET /api/v1/orders/group/:id
 * returns the OrderGroup parent + every child Order; we render:
 *
 *   header  — total + aggregate status
 *   summary — subtotal + single delivery fee + total
 *   legs    — per-store rows with status, item count, deep-link to leg detail
 *
 * 15s refetch interval keeps the per-leg status fresh without a socket
 * subscription on this screen (the per-leg detail screens already
 * subscribe to their own order rooms).
 */

interface PerLegStore {
  id: string;
  name: string;
  lat: number;
  lng: number;
  city?: string | null;
  street?: string | null;
}

interface PerLeg {
  id: string;
  status: OrderStatus;
  subtotal: number;
  pickedUpAt: string | null;
  items: Array<{ id: string; qty: number }>;
  store?: PerLegStore | null;
}

interface GroupCancelResult {
  groupId: string;
  cancelledLegs: string[];
  refundRupees: number;
}

async function cancelGroupRequest(args: {
  groupId: string;
  reason: string;
}): Promise<GroupCancelResult> {
  const res = await apiClient.put<{ data: GroupCancelResult }>(
    `/api/v1/orders/group/${args.groupId}/cancel`,
    { reason: args.reason.trim() || 'Cancelled by customer' },
  );
  return res.data.data;
}

interface OrderGroupRollup {
  id: string;
  status: OrderStatus;
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  recipientName: string | null;
  recipientPhone: string | null;
  deliveryAddress: {
    label: string;
    street: string;
    city: string;
    pincode: string;
  } | null;
  orders: PerLeg[];
}

async function fetchOrderGroup(id: string): Promise<OrderGroupRollup> {
  const res = await apiClient.get<{ data: OrderGroupRollup }>(
    `/api/v1/orders/group/${id}`,
  );
  return res.data.data;
}

export default function OrderGroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const groupQuery = useQuery({
    queryKey: ['order-group', id],
    queryFn: () => fetchOrderGroup(String(id)),
    enabled: !!id,
    refetchInterval: 15_000,
  });

  // Cancel the whole basket in one call. Backend cancels every leg
  // that's still pre-pickup and refunds the proportional slice of
  // the group's single deliveryFee. Already picked-up legs aren't
  // touched — we surface the K-of-N count in the confirmation.
  const cancelMutation = useMutation({
    mutationFn: () =>
      cancelGroupRequest({ groupId: String(id), reason: cancelReason }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['order-group', id] });
      setCancelOpen(false);
      setCancelReason('');
      const refundLine =
        result.refundRupees > 0
          ? ` ₹${result.refundRupees.toFixed(0)} credited to your wallet.`
          : '';
      Alert.alert(
        'Order cancelled',
        `Cancelled ${result.cancelledLegs.length} leg(s).${refundLine}`,
      );
    },
    onError: (err: unknown) => {
      const e = err as { message?: string };
      Alert.alert('Cancel failed', e?.message ?? 'Could not cancel the group.');
    },
  });

  if (groupQuery.isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Stack.Screen options={{ title: 'Your order' }} />
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (groupQuery.isError || !groupQuery.data) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Stack.Screen options={{ title: 'Your order' }} />
        <View style={styles.centerFill}>
          <Text style={styles.errorTitle}>Couldn't load this order.</Text>
          <TouchableOpacity
            onPress={() => groupQuery.refetch()}
            style={styles.retryBtn}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const group = groupQuery.data;
  const totalRupees = `₹${group.total.toFixed(0)}`;
  // Mirror customer-web: cancel-all is offered when at least one leg
  // is still pre-pickup. Picked-up / delivered legs aren't touched.
  const anyCancellable = group.orders.some(
    (o) =>
      o.status === OrderStatus.PENDING ||
      o.status === OrderStatus.STORE_ACCEPTED ||
      o.status === OrderStatus.COOKING ||
      (o.status === OrderStatus.DRIVER_ASSIGNED && !o.pickedUpAt),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen
        options={{
          title: `${group.orders.length} stores`,
          headerBackTitle: 'Back',
        }}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      >
        {/* Header */}
        <View>
          <Text style={styles.headline}>
            Your order across {group.orders.length} store
            {group.orders.length === 1 ? '' : 's'}
          </Text>
          <View style={styles.headerRow}>
            <Text style={styles.headerMeta}>
              #{group.id.slice(-8).toUpperCase()}
            </Text>
            <Text style={styles.headerMeta}>·</Text>
            <Text style={styles.headerMeta}>{totalRupees} total</Text>
            <OrderStatusBadge status={group.status} />
          </View>
        </View>

        {/* Aggregate summary card */}
        <Card padding={spacing.lg}>
          <Row label="Items subtotal" value={`₹${group.subtotal.toFixed(0)}`} />
          <Row
            label="Delivery fee"
            value={`₹${group.deliveryFee.toFixed(0)}`}
          />
          <View style={styles.divider} />
          <Row label="Total" value={totalRupees} bold />
          <Text style={styles.summaryNote}>
            One driver picks up from each store and brings everything to you
            in a single delivery. Final delivery happens once all pickups
            are complete.
          </Text>
        </Card>

        {/* Per-store legs */}
        <View>
          <Text style={styles.sectionLabel}>Per-store status</Text>
          {group.orders.map((leg) => (
            <TouchableOpacity
              key={leg.id}
              activeOpacity={0.75}
              onPress={() => router.push(`/order/${leg.id}` as never)}
              style={styles.legRow}
            >
              <View style={styles.legIcon}>
                <Ionicons name="storefront" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.legHeaderRow}>
                  <Text style={styles.legName} numberOfLines={1}>
                    {leg.store?.name ?? 'Store'}
                  </Text>
                  <OrderStatusBadge status={leg.status} />
                </View>
                <Text style={styles.legCity}>
                  {leg.store?.city ?? '—'}
                </Text>
                <Text style={styles.legMeta}>
                  {leg.items.length} item{leg.items.length === 1 ? '' : 's'} ·
                  ₹{leg.subtotal.toFixed(0)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Cancel-all — only shown when at least one leg can still be
            cancelled. Picked-up + delivered legs are intentionally
            skipped server-side; the confirmation copy spells that out
            so the customer isn't surprised when the K/N count doesn't
            match the leg total. */}
        {anyCancellable ? (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setCancelOpen(true)}
            style={styles.cancelBtn}
          >
            <Ionicons name="close-circle-outline" size={18} color={colors.error} />
            <Text style={styles.cancelBtnText}>Cancel this order</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      <Modal
        visible={cancelOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCancelOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Cancel this multi-store order?</Text>
            <Text style={styles.modalBody}>
              We'll cancel every leg that hasn't been picked up yet. The
              proportional share of your delivery fee will be refunded to
              your wallet. Legs the driver has already picked up can't be
              cancelled — contact support for those.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Reason (optional)"
              value={cancelReason}
              onChangeText={setCancelReason}
              maxLength={500}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setCancelOpen(false)}
                style={[styles.modalBtn, styles.modalBtnGhost]}
                disabled={cancelMutation.isPending}
              >
                <Text style={styles.modalBtnGhostText}>Keep order</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => cancelMutation.mutate()}
                style={[styles.modalBtn, styles.modalBtnDanger]}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.modalBtnDangerText}>Cancel order</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Row({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={bold ? styles.rowLabelBold : styles.rowLabel}>{label}</Text>
      <Text style={bold ? styles.rowValueBold : styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  errorTitle: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  retryBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
  },
  retryText: { color: colors.white, fontWeight: '600' },
  headline: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  headerMeta: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginVertical: spacing.xs,
  },
  rowLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  rowLabelBold: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  rowValue: { fontSize: fontSize.sm, color: colors.textPrimary },
  rowValueBold: {
    fontSize: fontSize.lg,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  summaryNote: {
    marginTop: spacing.sm,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  legRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  legIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  legHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  legName: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  legCity: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  legMeta: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    marginTop: 2,
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  cancelBtnText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.error,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  modalBody: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 60,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnGhost: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalBtnGhostText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  modalBtnDanger: {
    backgroundColor: colors.error,
  },
  modalBtnDangerText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.white,
  },
});
