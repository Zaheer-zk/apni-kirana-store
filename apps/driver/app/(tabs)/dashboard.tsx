import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useDriverStore } from '@/store/driver.store';
import { OnlineToggle } from '@/components/OnlineToggle';
import { IncomingOrderModal } from '@/components/IncomingOrderModal';
import { DropoffOtpSheet } from '@/components/DropoffOtpSheet';
import { initSocket } from '@/lib/socket';
import { startLocationTracking, stopLocationTracking } from '@/lib/location';
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
  paymentMethod: 'COD' | 'PAID' | string;
  paymentStatus?: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
}

export default function DashboardScreen() {
  const {
    isOnline,
    activeOrderId,
    incomingOrderId,
    accessToken,
    setActiveOrder,
  } = useDriverStore();
  const queryClient = useQueryClient();

  const [otpSheetVisible, setOtpSheetVisible] = useState(false);
  const [deliveredFlash, setDeliveredFlash] = useState(false);

  // ─── Active order fetch ────────────────────────────────────────────────────
  const { data: activeOrder, isLoading: loadingActive } = useQuery<DriverOrder>({
    queryKey: ['activeOrder', activeOrderId],
    queryFn: async () => {
      const r = await api.get<ApiEnvelope<DriverOrder>>(
        `/api/v1/orders/${activeOrderId}`,
      );
      // Unwrap {success, data} envelope.
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
      return (body?.data ?? body) as DailyDriverStats;
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

  // When the active order transitions to DELIVERED, brief success then idle.
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
  }, [activeOrder?.status]);

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
    // Re-fetch the order; the watcher above flips us to DELIVERED state.
    queryClient.invalidateQueries({ queryKey: ['activeOrder', activeOrderId] });
  };

  // ─── Derived ───────────────────────────────────────────────────────────────
  const status = activeOrder?.status;
  const isAtStore = status === 'DRIVER_ASSIGNED';
  const isToCustomer = status === 'PICKED_UP';
  const isDelivered = status === 'DELIVERED' || deliveredFlash;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Driver Dashboard</Text>
          <View
            style={[
              styles.statusBadge,
              isOnline ? styles.statusOnline : styles.statusOffline,
            ]}
          >
            <Text style={styles.statusBadgeText}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>

        {/* Online Toggle */}
        <OnlineToggle />

        {/* Today's Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {(todayStats as DailyDriverStats | undefined)?.deliveriesCount ?? 0}
            </Text>
            <Text style={styles.statLabel}>Deliveries{'\n'}Today</Text>
          </View>
          <View style={[styles.statCard, styles.statCardAccent]}>
            <Text style={[styles.statValue, styles.statValueAccent]}>
              ₹{(todayStats as DailyDriverStats | undefined)?.earnings ?? 0}
            </Text>
            <Text style={styles.statLabel}>Earnings{'\n'}Today</Text>
          </View>
        </View>

        {/* Active delivery — loading */}
        {activeOrderId && loadingActive && !activeOrder && (
          <View style={styles.loadingCard}>
            <ActivityIndicator color="#DC2626" />
            <Text style={styles.loadingText}>Loading active order…</Text>
          </View>
        )}

        {/* Active delivery — DELIVERED success flash */}
        {isDelivered && (
          <View style={styles.successCard}>
            <Ionicons name="checkmark-circle" size={56} color="#16A34A" />
            <Text style={styles.successTitle}>Delivered!</Text>
            <Text style={styles.successSubtitle}>
              Earnings have been credited. Stay online for the next order.
            </Text>
          </View>
        )}

        {/* Active delivery — DRIVER_ASSIGNED (go to store) */}
        {activeOrder && isAtStore && (
          <View style={styles.activeCard}>
            <View style={styles.activeHeader}>
              <Text style={styles.activeStepBadge}>STEP 1 OF 2</Text>
              <Text style={styles.activeCardTitle}>
                📦 Pickup from {activeOrder.store?.name ?? 'store'}
              </Text>
            </View>

            <View style={styles.addrBlock}>
              <Ionicons
                name="storefront-outline"
                size={18}
                color="#6B7280"
                style={{ marginRight: 8, marginTop: 2 }}
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

            <TouchableOpacity
              style={styles.mapsButton}
              onPress={() =>
                openMapsCoords(
                  activeOrder.store?.lat,
                  activeOrder.store?.lng,
                  activeOrder.store?.name,
                )
              }
            >
              <Ionicons name="navigate-outline" size={16} color="#DC2626" />
              <Text style={styles.mapsButtonText}>Open in Maps</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.confirmButton, styles.confirmGreen]}
              onPress={() => confirmPickupMutation.mutate(activeOrder.id)}
              disabled={confirmPickupMutation.isPending}
            >
              {confirmPickupMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={styles.confirmButtonText}>Confirm Pickup</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Active delivery — PICKED_UP (deliver to customer) */}
        {activeOrder && isToCustomer && (
          <View style={styles.activeCard}>
            <View style={styles.activeHeader}>
              <Text style={styles.activeStepBadge}>STEP 2 OF 2</Text>
              <Text style={styles.activeCardTitle}>🏠 Deliver to dropoff</Text>
            </View>

            <View style={styles.addrBlock}>
              <Ionicons
                name="location-outline"
                size={18}
                color="#6B7280"
                style={{ marginRight: 8, marginTop: 2 }}
              />
              <Text style={styles.addrText}>
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
                  <Ionicons name="pin-outline" size={12} color="#374151" />
                  <Text style={styles.coordsText}>
                    {activeOrder.deliveryAddress.lat.toFixed(4)},{' '}
                    {activeOrder.deliveryAddress.lng.toFixed(4)}
                  </Text>
                </View>
              )}

            <TouchableOpacity
              style={styles.mapsButton}
              onPress={() =>
                openMapsCoords(
                  activeOrder.deliveryAddress?.lat,
                  activeOrder.deliveryAddress?.lng,
                )
              }
            >
              <Ionicons name="navigate-outline" size={16} color="#DC2626" />
              <Text style={styles.mapsButtonText}>Open in Maps</Text>
            </TouchableOpacity>

            {/* Items list */}
            {activeOrder.items?.length ? (
              <View style={styles.itemsBlock}>
                <Text style={styles.sectionLabel}>Items</Text>
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
              <View
                style={[
                  styles.paymentBadge,
                  activeOrder.paymentMethod === 'COD'
                    ? styles.paymentCod
                    : styles.paymentPaid,
                ]}
              >
                <Ionicons
                  name={
                    activeOrder.paymentMethod === 'COD'
                      ? 'cash-outline'
                      : 'card-outline'
                  }
                  size={14}
                  color={
                    activeOrder.paymentMethod === 'COD' ? '#92400E' : '#065F46'
                  }
                />
                <Text
                  style={[
                    styles.paymentText,
                    {
                      color:
                        activeOrder.paymentMethod === 'COD'
                          ? '#92400E'
                          : '#065F46',
                    },
                  ]}
                >
                  {activeOrder.paymentMethod === 'COD'
                    ? 'Collect cash'
                    : 'Already paid'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.confirmButton, styles.confirmGreen]}
              onPress={() => setOtpSheetVisible(true)}
            >
              <Ionicons name="lock-open-outline" size={18} color="#fff" />
              <Text style={styles.confirmButtonText}>Confirm Delivery</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Idle states */}
        {!activeOrder && !activeOrderId && isOnline && (
          <View style={styles.waitingCard}>
            <Text style={styles.waitingIcon}>📡</Text>
            <Text style={styles.waitingText}>Waiting for orders...</Text>
            <Text style={styles.waitingSubtext}>
              Stay online to receive delivery requests
            </Text>
          </View>
        )}

        {!isOnline && !activeOrderId && (
          <View style={styles.offlineCard}>
            <Text style={styles.offlineIcon}>💤</Text>
            <Text style={styles.offlineText}>You are offline</Text>
            <Text style={styles.offlineSubtext}>
              Toggle online above to start receiving orders
            </Text>
          </View>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 32 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#111827' },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusOnline: { backgroundColor: '#DCFCE7' },
  statusOffline: { backgroundColor: '#FEE2E2' },
  statusBadgeText: { fontSize: 12, fontWeight: '600', color: '#111827' },

  statsRow: { flexDirection: 'row', gap: 12, marginTop: 20, marginBottom: 20 },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statCardAccent: { backgroundColor: '#FEF2F2' },
  statValue: { fontSize: 30, fontWeight: '800', color: '#111827' },
  statValueAccent: { color: '#DC2626' },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },

  loadingCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: { color: '#6B7280', fontWeight: '600' },

  activeCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#DC2626',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    marginBottom: 16,
  },
  activeHeader: { marginBottom: 12 },
  activeStepBadge: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  activeCardTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },

  addrBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  addrText: { flex: 1, fontSize: 14, color: '#374151', lineHeight: 20 },

  coordsPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 10,
  },
  coordsText: { fontSize: 12, color: '#374151', fontWeight: '600' },

  mapsButton: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DC2626',
    borderRadius: 10,
    paddingVertical: 11,
    marginBottom: 12,
  },
  mapsButtonText: { color: '#DC2626', fontWeight: '700', fontSize: 14 },

  itemsBlock: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  itemName: { fontSize: 14, color: '#111827', flex: 1, marginRight: 8 },
  itemQty: { fontSize: 14, color: '#6B7280', fontWeight: '700' },

  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    marginBottom: 4,
  },
  billLabel: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  billValue: { fontSize: 22, fontWeight: '800', color: '#111827' },
  paymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  paymentCod: { backgroundColor: '#FEF3C7' },
  paymentPaid: { backgroundColor: '#D1FAE5' },
  paymentText: { fontSize: 12, fontWeight: '700' },

  confirmButton: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#DC2626',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  confirmGreen: { backgroundColor: '#16A34A' },
  confirmButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  successCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#16A34A',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#16A34A',
    marginTop: 10,
  },
  successSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },

  waitingCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginTop: 8,
  },
  waitingIcon: { fontSize: 40, marginBottom: 12 },
  waitingText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  waitingSubtext: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },

  offlineCard: {
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginTop: 8,
  },
  offlineIcon: { fontSize: 40, marginBottom: 12 },
  offlineText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 4,
  },
  offlineSubtext: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },
});
