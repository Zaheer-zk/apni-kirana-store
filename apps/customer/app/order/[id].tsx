import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Header } from '@/components/Header';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { apiClient } from '@/lib/api';
import { createSocket, subscribeToOrder } from '@/lib/socket';
import { useAuthStore } from '@/store/auth.store';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';
import {
  OrderStatus,
  PaymentMethod,
  type DriverProfile,
  type LatLng,
  type Order,
} from '@aks/shared';
import type { Socket } from 'socket.io-client';

interface OrderDetailResponse {
  order: Order;
  driver?: DriverProfile;
  storeLocation?: LatLng;
}

const ORDER_STEPS: Array<{ status: OrderStatus; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { status: OrderStatus.PENDING, label: 'Placed', icon: 'receipt-outline' },
  { status: OrderStatus.STORE_ACCEPTED, label: 'Accepted', icon: 'storefront-outline' },
  { status: OrderStatus.DRIVER_ASSIGNED, label: 'Assigned', icon: 'person-outline' },
  { status: OrderStatus.PICKED_UP, label: 'Picked up', icon: 'cube-outline' },
  { status: OrderStatus.DELIVERED, label: 'Delivered', icon: 'checkmark-done-outline' },
];

const STATUS_ORDER: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.STORE_ACCEPTED,
  OrderStatus.DRIVER_ASSIGNED,
  OrderStatus.PICKED_UP,
  OrderStatus.DELIVERED,
];

async function fetchOrder(id: string): Promise<OrderDetailResponse> {
  const res = await apiClient.get<{ data: unknown } | unknown>(`/api/v1/orders/${id}`);
  const root = res.data as Record<string, unknown> | undefined;
  // Backend returns { success, data: <flat order with .store, .driver, etc.> }
  // Older callers wrapped as { order, driver, storeLocation } — handle both.
  const flat =
    (root && typeof root === 'object' && 'data' in root
      ? (root as { data: Record<string, unknown> }).data
      : root) as Record<string, unknown> | undefined;
  if (!flat) throw new Error('Order not found');

  // Already in expected shape?
  if ('order' in flat && (flat as { order?: unknown }).order) {
    return flat as unknown as OrderDetailResponse;
  }

  const order = flat as unknown as Order;
  const storeRaw = (flat as { store?: { lat?: number; lng?: number } }).store;
  const driverRaw = (flat as { driver?: unknown }).driver;
  return {
    order,
    driver: (driverRaw as DriverProfile | undefined) ?? undefined,
    storeLocation:
      storeRaw && storeRaw.lat != null && storeRaw.lng != null
        ? { lat: storeRaw.lat, lng: storeRaw.lng }
        : undefined,
  };
}

async function cancelOrderRequest(args: { id: string; reason?: string }): Promise<void> {
  // Backend uses PUT and requires a `reason` (1..500 chars)
  await apiClient.put(`/api/v1/orders/${args.id}/cancel`, {
    reason: (args.reason ?? '').trim() || 'Cancelled by customer',
  });
}

function StepIndicator({ currentStatus }: { currentStatus: OrderStatus }) {
  const cancelled =
    currentStatus === OrderStatus.CANCELLED || currentStatus === OrderStatus.REJECTED;
  const currentIdx = STATUS_ORDER.indexOf(currentStatus);

  return (
    <View style={styles.stepWrap}>
      <View style={styles.stepRow}>
        {ORDER_STEPS.map((step, idx) => {
          const isCompleted = !cancelled && idx < currentIdx;
          const isCurrent = !cancelled && idx === currentIdx;
          const isFuture = cancelled || idx > currentIdx;

          let dotStyle = styles.stepDotFuture;
          let lineStyle = styles.stepLineFuture;
          if (isCompleted) {
            dotStyle = styles.stepDotDone;
            lineStyle = styles.stepLineDone;
          } else if (isCurrent) {
            dotStyle = styles.stepDotCurrent;
          }

          return (
            <View key={step.status} style={styles.stepCol}>
              <View style={styles.stepDotContainer}>
                {idx > 0 ? (
                  <View
                    style={[
                      styles.stepLine,
                      lineStyle,
                      idx === 1 ? styles.stepLineFirst : null,
                    ]}
                  />
                ) : null}
                <View style={[styles.stepDot, dotStyle]}>
                  {isCompleted ? (
                    <Ionicons name="checkmark" size={14} color={colors.white} />
                  ) : isCurrent ? (
                    <View style={styles.stepDotInner} />
                  ) : null}
                </View>
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  isCurrent && styles.stepLabelCurrent,
                  isFuture && styles.stepLabelFuture,
                ]}
                numberOfLines={2}
              >
                {step.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

interface EtaInfo {
  label: string;
  value: string;
  delivered: boolean;
}

function computeEta(status: OrderStatus, order: Order): EtaInfo | null {
  if (status === OrderStatus.CANCELLED || status === OrderStatus.REJECTED) return null;
  if (status === OrderStatus.DELIVERED) {
    const deliveredAt =
      (order as Order & { deliveredAt?: string | null }).deliveredAt ?? order.updatedAt;
    return {
      label: 'Delivered at',
      value: formatTime(deliveredAt),
      delivered: true,
    };
  }
  if (status === OrderStatus.DRIVER_ASSIGNED || status === OrderStatus.PICKED_UP) {
    return { label: 'Arriving in', value: '15–25 mins', delivered: false };
  }
  // PENDING or STORE_ACCEPTED
  return { label: 'Arriving in', value: '30–45 mins', delivered: false };
}

function statusHeadline(status: OrderStatus): string {
  switch (status) {
    case OrderStatus.PENDING:
      return 'Waiting for store to confirm';
    case OrderStatus.STORE_ACCEPTED:
      return 'Order accepted by store';
    case OrderStatus.DRIVER_ASSIGNED:
      return 'Driver is on the way to store';
    case OrderStatus.PICKED_UP:
      return 'Driver is on the way to you';
    case OrderStatus.DELIVERED:
      return 'Order delivered. Enjoy!';
    case OrderStatus.CANCELLED:
      return 'Order was cancelled';
    case OrderStatus.REJECTED:
      return 'Order was rejected by store';
  }
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [liveStatus, setLiveStatus] = useState<OrderStatus | null>(null);
  const [driverLoc, setDriverLoc] = useState<LatLng | null>(null);
  const [rating, setRating] = useState(0);
  const socketRef = useRef<Socket | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['order', id],
    queryFn: () => fetchOrder(id!),
    enabled: !!id,
    refetchInterval: 30000,
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelOrderRequest({ id: id! }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['order', id] }),
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to cancel order';
      Alert.alert('Error', message);
    },
  });

  useEffect(() => {
    if (!id || !accessToken) return;
    const socket = createSocket(accessToken);
    socketRef.current = socket;
    const unsubscribe = subscribeToOrder(
      socket,
      id,
      (status) => {
        setLiveStatus(status);
        queryClient.invalidateQueries({ queryKey: ['order', id] });
      },
      (loc) => setDriverLoc(loc)
    );
    return () => {
      unsubscribe();
      socket.disconnect();
    };
  }, [id, accessToken, queryClient]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  if (isError || !data) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Header title="Order" />
        <View style={styles.center}>
          <Text style={{ color: colors.textSecondary }}>Order not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { order, driver, storeLocation } = data;
  const status = liveStatus ?? order.status;
  const headline = statusHeadline(status);
  const canCancel = status === OrderStatus.PENDING;
  const isDelivered = status === OrderStatus.DELIVERED;
  const eta = computeEta(status, order);

  const dropoffOtp = (order as Order & { dropoffOtp?: string | null }).dropoffOtp ?? null;
  const showDropoffOtp =
    !!dropoffOtp && status === OrderStatus.PICKED_UP;

  const customerLat = order.deliveryAddress?.lat ?? 28.6315;
  const customerLng = order.deliveryAddress?.lng ?? 77.2167;
  const storeLat = storeLocation?.lat ?? 28.6320;
  const storeLng = storeLocation?.lng ?? 77.2170;

  function handleCallDriver() {
    if (!driver?.phone) return;
    Linking.openURL(`tel:${driver.phone}`);
  }

  function handleCancel() {
    Alert.alert('Cancel order', 'Are you sure you want to cancel this order?', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel order',
        style: 'destructive',
        onPress: () => cancelMutation.mutate(),
      },
    ]);
  }

  function handleSubmitRating(stars: number) {
    setRating(stars);
    Alert.alert('Thanks!', `You rated this order ${stars} star${stars === 1 ? '' : 's'}.`);
  }

  return (
    <View style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        {/* Map area */}
        <View style={styles.mapWrap}>
          <MapView
            provider={PROVIDER_DEFAULT}
            style={StyleSheet.absoluteFill}
            initialRegion={{
              latitude: (customerLat + storeLat) / 2,
              longitude: (customerLng + storeLng) / 2,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            }}
            scrollEnabled={false}
            zoomEnabled={false}
            pitchEnabled={false}
            rotateEnabled={false}
          >
            <Marker
              coordinate={{ latitude: storeLat, longitude: storeLng }}
              title="Store"
              pinColor={colors.accent}
            />
            <Marker
              coordinate={{ latitude: customerLat, longitude: customerLng }}
              title="You"
              pinColor={colors.primary}
            />
            {driverLoc ? (
              <Marker
                coordinate={{ latitude: driverLoc.lat, longitude: driverLoc.lng }}
                title="Driver"
                pinColor={colors.info}
              />
            ) : null}
          </MapView>

          <SafeAreaView edges={['top']} style={styles.mapHeaderSafe} pointerEvents="box-none">
            <View style={styles.mapHeader}>
              <TouchableOpacity
                style={styles.circleBtn}
                activeOpacity={0.7}
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/orders'))}
              >
                <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
              <View style={styles.mapBadge}>
                <Text style={styles.mapBadgeText}>Order #{order.id.slice(-6).toUpperCase()}</Text>
              </View>
              <View style={{ width: 44 }} />
            </View>
          </SafeAreaView>
        </View>

        {/* Status card */}
        <View style={styles.statusCard}>
          <OrderStatusBadge status={status} />
          <Text style={styles.statusHeadline}>{headline}</Text>
          {!isDelivered && status !== OrderStatus.CANCELLED && status !== OrderStatus.REJECTED ? (
            <Text style={styles.statusSubtitle}>
              We'll notify you the moment your order moves to the next step.
            </Text>
          ) : null}
          <StepIndicator currentStatus={status} />
          {eta ? (
            <View style={styles.etaCard}>
              <Ionicons name="time-outline" size={18} color={colors.success} />
              <Text style={styles.etaLabel}>{eta.label} </Text>
              <Text style={styles.etaValue}>{eta.value}</Text>
            </View>
          ) : null}
        </View>

        {/* Delivery OTP — shown to customer once driver has picked up the order */}
        {showDropoffOtp ? (
          <View style={styles.section}>
            <Card style={styles.otpCard} padding={spacing.xl}>
              <View style={styles.otpHeader}>
                <View style={styles.otpIcon}>
                  <Ionicons name="key" size={20} color={colors.primary} />
                </View>
                <Text style={styles.otpTitle}>Show this code to your driver</Text>
              </View>
              <Text style={styles.otpCode}>{dropoffOtp}</Text>
              <Text style={styles.otpSubtitle}>
                The driver will enter this to confirm delivery
              </Text>
            </Card>
          </View>
        ) : null}

        {/* Driver card */}
        {driver ? (
          <View style={styles.section}>
            <View style={styles.driverCard}>
              <Avatar name={driver.name} size={52} />
              <View style={{ flex: 1 }}>
                <Text style={styles.driverName}>{driver.name}</Text>
                <Text style={styles.driverMeta}>
                  {driver.vehicleType} • {driver.vehicleNumber}
                </Text>
                <View style={styles.driverRating}>
                  <Ionicons name="star" size={12} color={colors.accent} />
                  <Text style={styles.driverRatingText}>{driver.rating.toFixed(1)}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.callBtn}
                activeOpacity={0.7}
                onPress={handleCallDriver}
              >
                <Ionicons name="call" size={20} color={colors.white} />
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* Rate order */}
        {isDelivered ? (
          <View style={styles.section}>
            <View style={styles.rateCard}>
              <Text style={styles.rateTitle}>Rate your order</Text>
              <Text style={styles.rateSubtitle}>How was your experience?</Text>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    activeOpacity={0.7}
                    onPress={() => handleSubmitRating(star)}
                    hitSlop={6}
                  >
                    <Ionicons
                      name={star <= rating ? 'star' : 'star-outline'}
                      size={36}
                      color={colors.accent}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        ) : null}

        {/* Items list */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order details</Text>
          <View style={styles.itemsCard}>
            {order.items.map((it, idx) => (
              <View
                key={`${it.itemId}-${idx}`}
                style={[styles.itemRow, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
              >
                <View style={styles.itemQtyBadge}>
                  <Text style={styles.itemQtyText}>{it.qty}×</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemRowName}>{it.name}</Text>
                  <Text style={styles.itemRowUnit}>{it.unit}</Text>
                </View>
                <Text style={styles.itemRowPrice}>₹{(it.price * it.qty).toFixed(0)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Address */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery address</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoIcon}>
              <Ionicons name="location" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>{order.deliveryAddress.label}</Text>
              <Text style={styles.infoText}>
                {order.deliveryAddress.street}, {order.deliveryAddress.city} —{' '}
                {order.deliveryAddress.pincode}
              </Text>
            </View>
          </View>
        </View>

        {/* Payment */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoIcon}>
              <Ionicons
                name={order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY ? 'cash-outline' : 'card-outline'}
                size={18}
                color={colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>
                {order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY
                  ? 'Cash on Delivery'
                  : 'Online'}
              </Text>
              <Text style={styles.infoText}>Status: {order.paymentStatus}</Text>
            </View>
          </View>
        </View>

        {/* Bill */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bill summary</Text>
          <View style={[styles.infoCard, { flexDirection: 'column', alignItems: 'stretch' }]}>
            <BillRow label="Subtotal" value={order.subtotal} />
            <BillRow label="Delivery fee" value={order.deliveryFee} />
            <View style={styles.billDivider} />
            <View style={styles.billTotalRow}>
              <Text style={styles.billTotalLabel}>Total paid</Text>
              <Text style={styles.billTotalValue}>₹{order.total.toFixed(0)}</Text>
            </View>
          </View>
        </View>

        {[OrderStatus.STORE_ACCEPTED, OrderStatus.DRIVER_ASSIGNED, OrderStatus.PICKED_UP].includes(
          status,
        ) ? (
          <View style={styles.section}>
            <Button
              variant="primary"
              title={status === OrderStatus.PICKED_UP ? 'Chat with driver' : 'Chat with store'}
              icon="chatbubbles-outline"
              onPress={() => router.push(`/chat/${id}`)}
              fullWidth
              size="lg"
            />
          </View>
        ) : null}

        {canCancel ? (
          <View style={styles.section}>
            <Button
              variant="outline"
              title="Cancel order"
              icon="close-circle-outline"
              onPress={handleCancel}
              loading={cancelMutation.isPending}
              fullWidth
              size="lg"
              style={{ borderColor: colors.error }}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function BillRow({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.billRow}>
      <Text style={styles.billLabel}>{label}</Text>
      <Text style={styles.billValue}>₹{value.toFixed(0)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  mapWrap: {
    height: 250,
    backgroundColor: colors.gray100,
    overflow: 'hidden',
  },
  mapHeaderSafe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  circleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.medium,
  },
  mapBadge: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    ...shadow.medium,
  },
  mapBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statusCard: {
    marginHorizontal: spacing.lg,
    marginTop: -spacing.xl,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.medium,
  },
  statusHeadline: {
    marginTop: spacing.md,
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  statusSubtitle: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  stepWrap: {
    marginTop: spacing.xl,
  },
  etaCard: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.successLight,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.success,
  },
  etaLabel: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.success,
  },
  etaValue: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.success,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  stepCol: {
    flex: 1,
    alignItems: 'center',
  },
  stepDotContainer: {
    width: '100%',
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
  },
  stepLine: {
    position: 'absolute',
    left: 0,
    right: '50%',
    height: 2,
    top: 13,
  },
  stepLineFirst: {
    // First connecting line should not extend beyond first dot
  },
  stepLineDone: {
    backgroundColor: colors.primary,
  },
  stepLineFuture: {
    backgroundColor: colors.border,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  stepDotDone: {
    backgroundColor: colors.primary,
  },
  stepDotCurrent: {
    backgroundColor: colors.white,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  stepDotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  stepDotFuture: {
    backgroundColor: colors.gray100,
    borderWidth: 2,
    borderColor: colors.border,
  },
  stepLabel: {
    marginTop: spacing.sm,
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  stepLabelCurrent: {
    color: colors.primary,
  },
  stepLabelFuture: {
    color: colors.textMuted,
    fontWeight: '600',
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  driverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    ...shadow.small,
  },
  driverName: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  driverMeta: {
    marginTop: 2,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  driverRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  driverRatingText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  callBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.small,
  },
  rateCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    ...shadow.small,
  },
  rateTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  rateSubtitle: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  starsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  itemsCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  itemQtyBadge: {
    minWidth: 32,
    height: 28,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemQtyText: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    color: colors.primaryDark,
  },
  itemRowName: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  itemRowUnit: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  itemRowPrice: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  infoText: {
    marginTop: 2,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  billLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  billValue: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  billDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  billTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  billTotalLabel: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  billTotalValue: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.primary,
  },
  otpCard: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  otpHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  otpIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpTitle: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.primaryDark,
  },
  otpCode: {
    marginTop: spacing.lg,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 8,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  otpSubtitle: {
    marginTop: spacing.sm,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
});
