import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Linking,
  Alert,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useDriverStore } from '@/store/driver.store';
import { OnlineToggle } from '@/components/OnlineToggle';
import { IncomingOrderModal } from '@/components/IncomingOrderModal';
import { DropoffOtpSheet } from '@/components/DropoffOtpSheet';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { initSocket } from '@/lib/socket';
import { startLocationTracking, stopLocationTracking } from '@/lib/location';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';
import { useUnreadNotificationsCount } from '@/app/notifications/index';
import type { DailyDriverStats } from '@aks/shared';

// ─── Types (driver-side projection of GET /orders/:id) ───────────────────────

interface DriverOrderItem {
  itemId: string;
  name: string;
  qty: number;
  price: number;
  unit?: string;
}

interface DriverStoreSummary {
  id: string;
  name: string;
  lat?: number;
  lng?: number;
  street?: string;
  city?: string;
  address?: string;
}

interface DriverDeliveryAddress {
  lat: number;
  lng: number;
  label?: string | null;
  pincode?: string | null;
  city?: string | null;
}

interface DriverOrder {
  id: string;
  status:
    | 'PENDING'
    | 'STORE_ACCEPTED'
    | 'DRIVER_ASSIGNED'
    | 'PICKED_UP'
    | 'DELIVERED'
    | 'CANCELLED';
  items: DriverOrderItem[];
  store?: DriverStoreSummary | null;
  deliveryAddress?: DriverDeliveryAddress | null;
  total: number;
  subtotal?: number;
  deliveryFee?: number;
  paymentMethod: string;
  paymentStatus?: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
}

interface StatCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tintColor?: string;
  tintBg?: string;
}

function StatCard({ icon, label, value, tintColor = colors.primary, tintBg = colors.primaryLight }: Readonly<StatCardProps>) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconWrap, { backgroundColor: tintBg }]}>
        <Ionicons name={icon} size={18} color={tintColor} />
      </View>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const {
    user,
    isOnline,
    activeOrderId,
    incomingOrderId,
    accessToken,
    setActiveOrder,
  } = useDriverStore();
  const queryClient = useQueryClient();

  const [otpSheetVisible, setOtpSheetVisible] = useState(false);
  const [deliveredFlash, setDeliveredFlash] = useState(false);
  const unreadCount = useUnreadNotificationsCount();

  // ─── Active order fetch ────────────────────────────────────────────────────
  const { data: activeOrder, isLoading: loadingActive } = useQuery<DriverOrder>({
    queryKey: ['activeOrder', activeOrderId],
    queryFn: async () => {
      const r = await api.get<ApiEnvelope<DriverOrder>>(
        `/api/v1/orders/${activeOrderId}`,
      );
      return (r.data?.data ?? (r.data as unknown)) as DriverOrder;
    },
    enabled: !!activeOrderId,
    refetchInterval: 15_000,
  });

  // ─── Today stats ───────────────────────────────────────────────────────────
  const { data: todayStats } = useQuery<DailyDriverStats>({
    queryKey: ['driverTodayStats'],
    queryFn: async () => {
      const r = await api.get<ApiEnvelope<DailyDriverStats> | DailyDriverStats>(
        '/api/v1/drivers/stats/today',
      );
      const body = r.data as ApiEnvelope<DailyDriverStats> & DailyDriverStats;
      return body?.data ?? body;
    },
    refetchInterval: 60_000,
  });

  // ─── Mutations ─────────────────────────────────────────────────────────────
  const confirmPickupMutation = useMutation({
    mutationFn: (orderId: string) =>
      api.put(`/api/v1/drivers/orders/${orderId}/pickup`).then((r) => r.data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['activeOrder', activeOrderId] }),
    onError: (err: Error) =>
      Alert.alert('Pickup failed', err.message || 'Could not confirm pickup'),
  });

  // ─── Lifecycle hooks ───────────────────────────────────────────────────────
  useEffect(() => {
    if (accessToken) initSocket(accessToken);
  }, [accessToken]);

  useEffect(() => {
    if (activeOrderId && accessToken) {
      startLocationTracking(activeOrderId, accessToken);
    }
  }, [activeOrderId, accessToken]);

  useEffect(() => {
    if (activeOrder?.status === 'DELIVERED') {
      setOtpSheetVisible(false);
      setDeliveredFlash(true);
      stopLocationTracking();
      const t = setTimeout(() => {
        setDeliveredFlash(false);
        setActiveOrder(null);
        queryClient.invalidateQueries({ queryKey: ['driverTodayStats'] });
      }, 2000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [activeOrder?.status, queryClient, setActiveOrder]);

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const openMapsCoords = (lat?: number, lng?: number, fallbackLabel?: string) => {
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      if (fallbackLabel) {
        const q = encodeURIComponent(fallbackLabel);
        Linking.openURL(`https://maps.google.com?q=${q}`).catch(() => {});
      }
      return;
    }
    const url =
      Platform.OS === 'ios'
        ? `https://maps.apple.com/?daddr=${lat},${lng}`
        : `google.navigation:q=${lat},${lng}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://maps.google.com/?q=${lat},${lng}`).catch(() => {});
    });
  };

  const handleOtpSuccess = () => {
    setOtpSheetVisible(false);
    queryClient.invalidateQueries({ queryKey: ['activeOrder', activeOrderId] });
  };

  // ─── Derived ───────────────────────────────────────────────────────────────
  const status = activeOrder?.status;
  const isAtStore = status === 'DRIVER_ASSIGNED';
  const isToCustomer = status === 'PICKED_UP';
  const isDelivered = status === 'DELIVERED' || deliveredFlash;

  const deliveriesCount = todayStats?.deliveriesCount ?? 0;
  const earnings = todayStats?.earnings ?? 0;
  const hoursOnline = (todayStats as { hoursOnline?: number } | undefined)?.hoursOnline ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greet}>
              {greetingForHour(new Date().getHours())}
              {user?.name ? `, ${user.name.split(' ')[0]}` : ''}
            </Text>
            <Text style={styles.headerName} numberOfLines={1}>
              Driver Dashboard
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.push('/notifications')}
            style={styles.bellButton}
          >
            <Ionicons
              name="notifications-outline"
              size={22}
              color={colors.textPrimary}
            />
            {unreadCount > 0 ? <View style={styles.bellDot} /> : null}
          </TouchableOpacity>
          <Badge
            variant={isOnline ? 'success' : 'default'}
            text={isOnline ? 'Online' : 'Offline'}
            dot
          />
        </View>

        {/* Online toggle */}
        <OnlineToggle />

        {/* Today's stats */}
        <Text style={styles.sectionTitle}>Today's stats</Text>
        <View style={styles.statsRow}>
          <StatCard
            icon="cube"
            label="Deliveries"
            value={String(deliveriesCount)}
            tintColor={colors.primary}
            tintBg={colors.primaryLight}
          />
          <StatCard
            icon="cash"
            label="Earnings"
            value={`₹${Number(earnings).toFixed(0)}`}
            tintColor={colors.accent}
            tintBg={colors.accentLight}
          />
          <StatCard
            icon="time"
            label="Hours"
            value={Number(hoursOnline).toFixed(1)}
            tintColor={colors.info}
            tintBg={colors.infoLight}
          />
        </View>

        {/* Active delivery — loading */}
        {activeOrderId && loadingActive && !activeOrder && (
          <Card style={styles.loadingCard}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>Loading active order…</Text>
          </Card>
        )}

        {/* Active delivery — DELIVERED success flash */}
        {isDelivered && (
          <Card accentColor={colors.accent} style={styles.successCard}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark-circle" size={56} color={colors.accent} />
            </View>
            <Text style={styles.successTitle}>Delivered!</Text>
            <Text style={styles.successSubtitle}>
              Earnings have been credited. Stay online for the next order.
            </Text>
          </Card>
        )}

        {/* Active delivery — DRIVER_ASSIGNED (go to store) */}
        {activeOrder && isAtStore && (
          <Card accentColor={colors.primary} style={styles.activeCard}>
            <View style={styles.activeHeader}>
              <Badge variant="primary" text="STEP 1 OF 2" />
              <Text style={styles.activeCardTitle}>
                Pickup from {activeOrder.store?.name ?? 'store'}
              </Text>
            </View>

            <View style={styles.addrBlock}>
              <Ionicons
                name="storefront-outline"
                size={18}
                color={colors.textSecondary}
                style={{ marginRight: spacing.sm, marginTop: 2 }}
              />
              <Text style={styles.addrText}>
                {[
                  activeOrder.store?.street,
                  activeOrder.store?.address,
                  activeOrder.store?.city,
                ]
                  .filter(Boolean)
                  .join(', ') || 'Store address'}
              </Text>
            </View>

            <Button
              variant="outline"
              size="md"
              icon="navigate"
              title="Open in Maps"
              fullWidth
              onPress={() =>
                openMapsCoords(
                  activeOrder.store?.lat,
                  activeOrder.store?.lng,
                  activeOrder.store?.name,
                )
              }
              style={styles.actionGap}
            />

            <Button
              variant="success"
              size="lg"
              icon="checkmark-circle"
              title="Confirm Pickup"
              fullWidth
              loading={confirmPickupMutation.isPending}
              onPress={() => confirmPickupMutation.mutate(activeOrder.id)}
            />
          </Card>
        )}

        {/* Active delivery — PICKED_UP (deliver to customer) */}
        {activeOrder && isToCustomer && (
          <Card accentColor={colors.primary} style={styles.activeCard}>
            <View style={styles.activeHeader}>
              <Badge variant="primary" text="STEP 2 OF 2" />
              <Text style={styles.activeCardTitle}>Deliver to dropoff</Text>
            </View>

            <View style={styles.addrBlock}>
              <Ionicons
                name="location-outline"
                size={18}
                color={colors.textSecondary}
                style={{ marginRight: spacing.sm, marginTop: 2 }}
              />
              <Text style={styles.addrText}>
                {/* Customer privacy: hide exact street; show area only. */}
                {[
                  activeOrder.deliveryAddress?.label,
                  activeOrder.deliveryAddress?.city,
                  activeOrder.deliveryAddress?.pincode,
                ]
                  .filter(Boolean)
                  .join(', ') || 'Dropoff area'}
              </Text>
            </View>

            {typeof activeOrder.deliveryAddress?.lat === 'number' &&
              typeof activeOrder.deliveryAddress?.lng === 'number' && (
                <View style={styles.coordsPill}>
                  <Ionicons name="pin-outline" size={12} color={colors.gray700} />
                  <Text style={styles.coordsText}>
                    {activeOrder.deliveryAddress.lat.toFixed(4)},{' '}
                    {activeOrder.deliveryAddress.lng.toFixed(4)}
                  </Text>
                </View>
              )}

            <Button
              variant="outline"
              size="md"
              icon="navigate"
              title="Open in Maps"
              fullWidth
              onPress={() =>
                openMapsCoords(
                  activeOrder.deliveryAddress?.lat,
                  activeOrder.deliveryAddress?.lng,
                )
              }
              style={styles.actionGap}
            />

            <Button
              variant="primary"
              size="md"
              icon="chatbubbles-outline"
              title="Chat with customer"
              fullWidth
              onPress={() => router.push(`/chat/${activeOrder.id}`)}
              style={styles.actionGap}
            />

            {/* Items list */}
            {activeOrder.items?.length ? (
              <View style={styles.itemsBlock}>
                <Text style={styles.itemsLabel}>Items</Text>
                {activeOrder.items.map((it) => (
                  <View key={it.itemId} style={styles.itemRow}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {it.name}
                    </Text>
                    <Text style={styles.itemQty}>×{it.qty}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Bill total + payment method */}
            <View style={styles.billRow}>
              <View>
                <Text style={styles.billLabel}>Bill total</Text>
                <Text style={styles.billValue}>
                  ₹{Number(activeOrder.total ?? 0).toFixed(2)}
                </Text>
              </View>
              <Badge
                variant={activeOrder.paymentMethod === 'COD' ? 'warning' : 'success'}
                text={activeOrder.paymentMethod === 'COD' ? 'Collect cash' : 'Already paid'}
              />
            </View>

            <Button
              variant="success"
              size="lg"
              icon="lock-open"
              title="Confirm Delivery"
              fullWidth
              onPress={() => setOtpSheetVisible(true)}
              style={styles.actionGap}
            />
          </Card>
        )}

        {/* Idle states */}
        {!activeOrder && !activeOrderId && isOnline && (
          <Card style={styles.idleCard}>
            <View style={[styles.idleIconBubble, { backgroundColor: colors.accentLight }]}>
              <Ionicons name="radio" size={28} color={colors.accent} />
            </View>
            <Text style={styles.idleTitle}>Waiting for orders</Text>
            <Text style={styles.idleSubtitle}>
              You're online. We'll alert you the moment a nearby delivery is available.
            </Text>
          </Card>
        )}

        {!isOnline && !activeOrderId && (
          <Card style={styles.idleCard}>
            <View style={[styles.idleIconBubble, { backgroundColor: colors.gray100 }]}>
              <Ionicons name="moon-outline" size={28} color={colors.gray500} />
            </View>
            <Text style={styles.idleTitle}>You're offline</Text>
            <Text style={styles.idleSubtitle}>
              Toggle online above to start receiving delivery requests.
            </Text>
          </Card>
        )}
      </ScrollView>

      {/* Incoming Order Modal */}
      {incomingOrderId && <IncomingOrderModal orderId={incomingOrderId} />}

      {/* OTP Sheet for delivery confirmation */}
      {activeOrder && (
        <DropoffOtpSheet
          orderId={activeOrder.id}
          visible={otpSheetVisible}
          onClose={() => setOtpSheetVisible(false)}
          onSuccess={handleOtpSuccess}
        />
      )}
    </SafeAreaView>
  );
}

function greetingForHour(hour: number): string {
  if (hour < 5) return 'Late shift';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  bellButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.small,
  },
  bellDot: {
    position: 'absolute',
    top: 8,
    right: 10,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.error,
    borderWidth: 2,
    borderColor: colors.card,
  },
  greet: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  headerName: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 2,
  },

  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },

  statsRow: { flexDirection: 'row', gap: spacing.md },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'flex-start',
    gap: 6,
    ...shadow.small,
  },
  statIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },

  loadingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  loadingText: { color: colors.textSecondary, fontWeight: '600' },

  activeCard: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  activeHeader: { gap: spacing.sm },
  activeCardTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
  },

  addrBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  addrText: { flex: 1, fontSize: fontSize.sm, color: colors.gray700, lineHeight: 20 },

  coordsPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.gray100,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  coordsText: { fontSize: fontSize.xs, color: colors.gray700, fontWeight: '600' },

  actionGap: { marginTop: spacing.xs },

  itemsBlock: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
  },
  itemsLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  itemName: { fontSize: fontSize.sm, color: colors.textPrimary, flex: 1, marginRight: spacing.sm },
  itemQty: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '700' },

  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  billLabel: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '600' },
  billValue: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.textPrimary },

  successCard: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  successIconWrap: { marginBottom: spacing.sm },
  successTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.accentDark,
  },
  successSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },

  idleCard: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  idleIconBubble: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  idleTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  idleSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.lg,
  },
});
