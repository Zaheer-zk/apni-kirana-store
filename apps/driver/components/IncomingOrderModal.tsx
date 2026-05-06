import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Animated,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useDriverStore } from '@/store/driver.store';
import { onOrderRescinded } from '@/lib/socket';
import type { IncomingOrderPreview } from '@aks/shared';

const COUNTDOWN_SECONDS = 60;

interface Props {
  orderId: string;
}

export function IncomingOrderModal({ orderId }: Props) {
  const { setIncomingOrder, setActiveOrder } = useDriverStore();
  const queryClient = useQueryClient();

  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const { data: order, isLoading } = useQuery<IncomingOrderPreview>({
    queryKey: ['incomingOrder', orderId],
    queryFn: () =>
      api.get<IncomingOrderPreview>(`/api/v1/orders/${orderId}/preview`).then((r) => r.data),
    enabled: !!orderId,
  });

  const acceptMutation = useMutation({
    mutationFn: () =>
      api.put(`/api/v1/drivers/orders/${orderId}/accept`).then((r) => r.data),
    onSuccess: () => {
      setActiveOrder(orderId);
      setIncomingOrder(null);
      queryClient.invalidateQueries({ queryKey: ['activeOrder'] });
      queryClient.invalidateQueries({ queryKey: ['driverTodayStats'] });
    },
    onError: (err: Error) => {
      // 409/400 means another driver already accepted — drop the modal
      // gracefully; the rescinded socket event normally handles this too.
      const msg = err.message || '';
      if (/already|taken|not available|status/i.test(msg)) {
        setIncomingOrder(null);
        Alert.alert('Offer taken', 'Another driver accepted this order first.');
      } else {
        Alert.alert('Error', msg || 'Could not accept order');
      }
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () =>
      api.put(`/api/v1/drivers/orders/${orderId}/reject`).then((r) => r.data),
    onSuccess: () => setIncomingOrder(null),
    onError: (err: Error) => {
      // Rejecting a rescinded offer can fail — just close the modal anyway.
      console.warn('[IncomingOrderModal] reject failed:', err.message);
      setIncomingOrder(null);
    },
  });

  // Subscribe to rescinded events — if this offer is taken by another driver
  // we dismiss the modal with a friendly toast.
  useEffect(() => {
    const unsubscribe = onOrderRescinded((rescindedId) => {
      if (rescindedId !== orderId) return;
      if (timerRef.current) clearInterval(timerRef.current);
      setIncomingOrder(null);
      Alert.alert(
        'Offer taken',
        'Offer taken by another driver. Stay online for the next one.'
      );
    });
    return unsubscribe;
  }, [orderId, setIncomingOrder]);

  // Fade in modal
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, []);

  // Shake animation to draw attention
  useEffect(() => {
    const shake = () => {
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 10, duration: 80, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -10, duration: 80, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 6, duration: 80, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
      ]).start();
    };
    shake();
    const interval = setInterval(shake, 4000);
    return () => clearInterval(interval);
  }, []);

  // Countdown timer
  useEffect(() => {
    setSecondsLeft(COUNTDOWN_SECONDS);
    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          // Auto-reject on timeout
          rejectMutation.mutate();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [orderId]);

  const timerColor = secondsLeft <= 15 ? '#DC2626' : secondsLeft <= 30 ? '#F59E0B' : '#16A34A';
  const timerPercent = (secondsLeft / COUNTDOWN_SECONDS) * 100;

  return (
    <Modal transparent animationType="none" visible statusBarTranslucent>
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <Animated.View
          style={[styles.card, { transform: [{ translateX: shakeAnim }] }]}
        >
          {/* Header */}
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>New Delivery Request!</Text>
            <View style={styles.timerContainer}>
              <Text style={[styles.timerText, { color: timerColor }]}>{secondsLeft}s</Text>
            </View>
          </View>

          {/* Timer bar */}
          <View style={styles.timerBarBg}>
            <View
              style={[
                styles.timerBarFill,
                { width: `${timerPercent}%` as any, backgroundColor: timerColor },
              ]}
            />
          </View>

          {isLoading ? (
            <ActivityIndicator size="large" color="#DC2626" style={{ marginVertical: 24 }} />
          ) : order ? (
            <View style={styles.body}>
              {/* Pickup */}
              <View style={styles.locationBlock}>
                <View style={styles.locationDot} />
                <View style={styles.locationInfo}>
                  <Text style={styles.locationLabel}>PICKUP — Store</Text>
                  <Text style={styles.locationAddress}>{order.pickupAddress}</Text>
                  <Text style={styles.locationDistance}>{order.pickupDistanceKm.toFixed(1)} km away</Text>
                </View>
              </View>

              <View style={styles.routeDivider} />

              {/* Delivery */}
              <View style={styles.locationBlock}>
                <View style={[styles.locationDot, styles.locationDotDelivery]} />
                <View style={styles.locationInfo}>
                  <Text style={styles.locationLabel}>DELIVERY — Customer</Text>
                  <Text style={styles.locationAddress}>{order.deliveryArea}</Text>
                  <Text style={styles.locationDistance}>{order.deliveryDistanceKm.toFixed(1)} km total</Text>
                </View>
              </View>

              {/* Earnings */}
              <View style={styles.earningsRow}>
                <Text style={styles.earningsLabel}>Your Earnings</Text>
                <Text style={styles.earningsValue}>₹{order.driverEarnings.toFixed(2)}</Text>
              </View>
            </View>
          ) : null}

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.rejectButton]}
              onPress={() => rejectMutation.mutate()}
              disabled={acceptMutation.isPending || rejectMutation.isPending}
            >
              {rejectMutation.isPending ? (
                <ActivityIndicator color="#DC2626" />
              ) : (
                <Text style={styles.rejectButtonText}>Reject</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.acceptButton]}
              onPress={() => acceptMutation.mutate()}
              disabled={acceptMutation.isPending || rejectMutation.isPending}
            >
              {acceptMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.acceptButtonText}>Accept</Text>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  cardTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  timerContainer: {
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  timerText: { fontSize: 18, fontWeight: '800' },
  timerBarBg: { height: 4, backgroundColor: '#F3F4F6' },
  timerBarFill: { height: 4 },
  body: { padding: 20 },
  locationBlock: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  locationDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2563EB',
    marginTop: 3,
    flexShrink: 0,
  },
  locationDotDelivery: { backgroundColor: '#16A34A' },
  locationInfo: { flex: 1 },
  locationLabel: { fontSize: 10, color: '#9CA3AF', fontWeight: '700', letterSpacing: 0.5, marginBottom: 2 },
  locationAddress: { fontSize: 14, color: '#111827', fontWeight: '600' },
  locationDistance: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  routeDivider: {
    width: 2,
    height: 20,
    backgroundColor: '#E5E7EB',
    marginLeft: 5,
    marginVertical: 6,
  },
  earningsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  earningsLabel: { fontSize: 14, color: '#6B7280', fontWeight: '600' },
  earningsValue: { fontSize: 24, fontWeight: '800', color: '#16A34A' },
  actions: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingBottom: 20 },
  actionButton: {
    flex: 1,
    height: 54,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectButton: { backgroundColor: '#FEE2E2', borderWidth: 1.5, borderColor: '#DC2626' },
  rejectButtonText: { color: '#DC2626', fontSize: 16, fontWeight: '700' },
  acceptButton: { backgroundColor: '#16A34A' },
  acceptButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
