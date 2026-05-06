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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useDriverStore } from '@/store/driver.store';
import { OnlineToggle } from '@/components/OnlineToggle';
import { IncomingOrderModal } from '@/components/IncomingOrderModal';
import { initSocket } from '@/lib/socket';
import { startLocationTracking, stopLocationTracking } from '@/lib/location';
import type { OrderDetail, DailyDriverStats } from '@aks/shared';

export default function DashboardScreen() {
  const { isOnline, activeOrderId, incomingOrderId, accessToken, setActiveOrder } = useDriverStore();
  const queryClient = useQueryClient();

  const { data: activeOrder } = useQuery<OrderDetail>({
    queryKey: ['activeOrder', activeOrderId],
    queryFn: () =>
      api.get<OrderDetail>(`/api/v1/orders/${activeOrderId}`).then((r) => r.data),
    enabled: !!activeOrderId,
  });

  const { data: todayStats } = useQuery<DailyDriverStats>({
    queryKey: ['driverTodayStats'],
    queryFn: () => api.get<DailyDriverStats>('/api/v1/drivers/stats/today').then((r) => r.data),
    refetchInterval: 60_000,
  });

  const confirmPickupMutation = useMutation({
    mutationFn: (orderId: string) =>
      api.put(`/api/v1/orders/${orderId}/pickup-confirmed`).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['activeOrder', activeOrderId] }),
    onError: () => Alert.alert('Error', 'Could not confirm pickup'),
  });

  const confirmDeliveryMutation = useMutation({
    mutationFn: (orderId: string) =>
      api.put(`/api/v1/orders/${orderId}/delivered`).then((r) => r.data),
    onSuccess: () => {
      setActiveOrder(null);
      stopLocationTracking();
      queryClient.invalidateQueries({ queryKey: ['driverTodayStats'] });
    },
    onError: () => Alert.alert('Error', 'Could not confirm delivery'),
  });

  useEffect(() => {
    if (accessToken) {
      initSocket(accessToken);
    }
  }, [accessToken]);

  useEffect(() => {
    if (activeOrderId && accessToken) {
      startLocationTracking(activeOrderId, accessToken);
    }
  }, [activeOrderId, accessToken]);

  const openMaps = (address: string) => {
    const query = encodeURIComponent(address);
    const url =
      Platform.OS === 'ios'
        ? `maps://?q=${query}`
        : `geo:0,0?q=${query}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://maps.google.com?q=${query}`);
    });
  };

  const isAtStore = activeOrder?.status === 'DRIVER_ASSIGNED';
  const activeStep = isAtStore ? 'GO_TO_STORE' : 'DELIVER_TO_CUSTOMER';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Driver Dashboard</Text>
          <View style={[styles.statusBadge, isOnline ? styles.statusOnline : styles.statusOffline]}>
            <Text style={styles.statusBadgeText}>{isOnline ? 'Online' : 'Offline'}</Text>
          </View>
        </View>

        {/* Online Toggle */}
        <OnlineToggle />

        {/* Today's Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{todayStats?.deliveriesCount ?? 0}</Text>
            <Text style={styles.statLabel}>Deliveries{'\n'}Today</Text>
          </View>
          <View style={[styles.statCard, styles.statCardAccent]}>
            <Text style={[styles.statValue, styles.statValueAccent]}>
              ₹{todayStats?.earnings ?? 0}
            </Text>
            <Text style={styles.statLabel}>Earnings{'\n'}Today</Text>
          </View>
        </View>

        {/* Active Delivery */}
        {activeOrder && (
          <View style={styles.activeCard}>
            <Text style={styles.activeCardTitle}>
              {activeStep === 'GO_TO_STORE' ? '🏪 Go to Store' : '🏠 Deliver to Customer'}
            </Text>
            <Text style={styles.activeAddress}>
              {activeStep === 'GO_TO_STORE'
                ? activeOrder.store?.address ?? 'Store address'
                : activeOrder.deliveryAddress}
            </Text>

            <TouchableOpacity
              style={styles.mapsButton}
              onPress={() =>
                openMaps(
                  activeStep === 'GO_TO_STORE'
                    ? activeOrder.store?.address ?? ''
                    : activeOrder.deliveryAddress
                )
              }
            >
              <Text style={styles.mapsButtonText}>Open in Maps</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.confirmButton}
              onPress={() => {
                if (activeStep === 'GO_TO_STORE') {
                  confirmPickupMutation.mutate(activeOrder.id);
                } else {
                  Alert.alert('Confirm Delivery', 'Confirm that you have delivered the order?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Confirm', onPress: () => confirmDeliveryMutation.mutate(activeOrder.id) },
                  ]);
                }
              }}
              disabled={confirmPickupMutation.isPending || confirmDeliveryMutation.isPending}
            >
              <Text style={styles.confirmButtonText}>
                {activeStep === 'GO_TO_STORE' ? 'Confirm Pickup' : 'Confirm Delivery'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {!activeOrder && isOnline && (
          <View style={styles.waitingCard}>
            <Text style={styles.waitingIcon}>📡</Text>
            <Text style={styles.waitingText}>Waiting for orders...</Text>
            <Text style={styles.waitingSubtext}>Stay online to receive delivery requests</Text>
          </View>
        )}

        {!isOnline && (
          <View style={styles.offlineCard}>
            <Text style={styles.offlineIcon}>💤</Text>
            <Text style={styles.offlineText}>You are offline</Text>
            <Text style={styles.offlineSubtext}>Toggle online above to start receiving orders</Text>
          </View>
        )}
      </ScrollView>

      {/* Incoming Order Modal */}
      {incomingOrderId && <IncomingOrderModal orderId={incomingOrderId} />}
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
  statLabel: { fontSize: 12, color: '#6B7280', textAlign: 'center', marginTop: 4, lineHeight: 18 },
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
  activeCardTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 8 },
  activeAddress: { fontSize: 14, color: '#4B5563', lineHeight: 20, marginBottom: 14 },
  mapsButton: {
    borderWidth: 1,
    borderColor: '#DC2626',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  mapsButtonText: { color: '#DC2626', fontWeight: '600', fontSize: 14 },
  confirmButton: {
    backgroundColor: '#DC2626',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  waitingCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginTop: 8,
  },
  waitingIcon: { fontSize: 40, marginBottom: 12 },
  waitingText: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 4 },
  waitingSubtext: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },
  offlineCard: {
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginTop: 8,
  },
  offlineIcon: { fontSize: 40, marginBottom: 12 },
  offlineText: { fontSize: 18, fontWeight: '700', color: '#374151', marginBottom: 4 },
  offlineSubtext: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },
});
