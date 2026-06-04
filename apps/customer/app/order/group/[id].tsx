import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
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
  items: Array<{ id: string; qty: number }>;
  store?: PerLegStore | null;
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
  const groupQuery = useQuery({
    queryKey: ['order-group', id],
    queryFn: () => fetchOrderGroup(String(id)),
    enabled: !!id,
    refetchInterval: 15_000,
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
      </ScrollView>
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
});
