import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Animated,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useDriverStore } from '@/store/driver.store';
import { onOrderRescinded } from '@/lib/socket';
import { Button } from '@/components/Button';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';
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
      console.warn('[IncomingOrderModal] reject failed:', err.message);
      setIncomingOrder(null);
    },
  });

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
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

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
  }, [shakeAnim]);

  // Countdown timer (DO NOT change — auto-reject on timeout drives offer flow)
  useEffect(() => {
    setSecondsLeft(COUNTDOWN_SECONDS);
    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          rejectMutation.mutate();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const timerColor =
    secondsLeft <= 15 ? colors.error : secondsLeft <= 30 ? colors.warning : colors.accent;
  const timerPercent = (secondsLeft / COUNTDOWN_SECONDS) * 100;

  return (
    <Modal transparent animationType="none" visible statusBarTranslucent>
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <Animated.View
          style={[styles.card, { transform: [{ translateX: shakeAnim }] }]}
        >
          {/* Header */}
          <View style={styles.cardHeader}>
            <View style={styles.headerLeft}>
              <View style={styles.bellWrap}>
                <Ionicons name="notifications" size={20} color={colors.primary} />
              </View>
              <Text style={styles.cardTitle}>New Delivery Request</Text>
            </View>
            <View style={styles.timerContainer}>
              <Ionicons name="time-outline" size={14} color={timerColor} />
              <Text style={[styles.timerText, { color: timerColor }]}>{secondsLeft}s</Text>
            </View>
          </View>

          {/* Timer bar */}
          <View style={styles.timerBarBg}>
            <View
              style={[
                styles.timerBarFill,
                { width: `${timerPercent}%`, backgroundColor: timerColor },
              ]}
            />
          </View>

          {isLoading ? (
            <View style={{ paddingVertical: spacing.xxxl }}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : order ? (
            <View style={styles.body}>
              {/* Pickup */}
              <View style={styles.locationBlock}>
                <View style={styles.locationDot}>
                  <Ionicons name="storefront" size={14} color={colors.white} />
                </View>
                <View style={styles.locationInfo}>
                  <Text style={styles.locationLabel}>PICKUP — Store</Text>
                  <Text style={styles.locationAddress} numberOfLines={2}>
                    {order.pickupAddress}
                  </Text>
                  <Text style={styles.locationDistance}>
                    {order.pickupDistanceKm.toFixed(1)} km away
                  </Text>
                </View>
              </View>

              <View style={styles.routeDivider} />

              {/* Delivery */}
              <View style={styles.locationBlock}>
                <View style={[styles.locationDot, styles.locationDotDelivery]}>
                  <Ionicons name="home" size={14} color={colors.white} />
                </View>
                <View style={styles.locationInfo}>
                  <Text style={styles.locationLabel}>DELIVERY — Customer</Text>
                  <Text style={styles.locationAddress} numberOfLines={2}>
                    {order.deliveryArea}
                  </Text>
                  <Text style={styles.locationDistance}>
                    {order.deliveryDistanceKm.toFixed(1)} km total
                  </Text>
                </View>
              </View>

              {/* Earnings */}
              <View style={styles.earningsRow}>
                <Text style={styles.earningsLabel}>Your earnings</Text>
                <Text style={styles.earningsValue}>
                  ₹{order.driverEarnings.toFixed(2)}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Actions */}
          <View style={styles.actions}>
            <Button
              variant="outline"
              size="lg"
              title="Reject"
              fullWidth
              onPress={() => rejectMutation.mutate()}
              loading={rejectMutation.isPending}
              disabled={acceptMutation.isPending}
              style={styles.flexBtn}
            />
            <Button
              variant="success"
              size="lg"
              title="Accept"
              icon="checkmark-circle"
              fullWidth
              onPress={() => acceptMutation.mutate()}
              loading={acceptMutation.isPending}
              disabled={rejectMutation.isPending}
              style={styles.flexBtn}
            />
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
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadow.large,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bellWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.textPrimary },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.gray100,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  timerText: { fontSize: fontSize.md, fontWeight: '800' },
  timerBarBg: { height: 4, backgroundColor: colors.gray100 },
  timerBarFill: { height: 4 },
  body: { padding: spacing.xl },
  locationBlock: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  locationDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.info,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  locationDotDelivery: { backgroundColor: colors.accent },
  locationInfo: { flex: 1 },
  locationLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  locationAddress: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  locationDistance: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  routeDivider: {
    width: 2,
    height: 20,
    backgroundColor: colors.border,
    marginLeft: 13,
    marginVertical: 6,
  },
  earningsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  earningsLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  earningsValue: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.accent },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  flexBtn: { flex: 1 },
});
