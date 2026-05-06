import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  Alert,
  Platform,
  ToastAndroid,
  Vibration,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useStorePortalStore } from '@/store/store.store';
import { onOrderRescinded } from '@/lib/socket';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';

// Order preview shape from GET /api/v1/orders/:id (we extract the bits we need)
interface IncomingOrderPreview {
  id: string;
  itemsCount: number;
  orderTotal: number;
  deliveryArea?: string;
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    const inner = (payload as { data: unknown }).data;
    if (inner !== undefined) return inner as T;
  }
  return payload as T;
}

const COUNTDOWN_SECONDS = 180; // 3 minutes

interface Props {
  orderId: string;
}

function showToast(message: string) {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    // iOS has no native toast — use a non-blocking Alert dismissed quickly
    Alert.alert('', message);
  }
}

export function IncomingOrderBanner({ orderId }: Props) {
  const { setIncomingOrder } = useStorePortalStore();
  const queryClient = useQueryClient();

  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slideAnim = useRef(new Animated.Value(-120)).current;

  const { data: order, isLoading } = useQuery<IncomingOrderPreview>({
    queryKey: ['storeIncomingOrder', orderId],
    queryFn: async () => {
      const r = await api.get(`/api/v1/orders/${orderId}`);
      const o = unwrap<{
        id: string;
        items?: Array<unknown>;
        total?: number;
        deliveryArea?: string;
      }>(r.data);
      return {
        id: o.id,
        itemsCount: o.items?.length ?? 0,
        orderTotal: o.total ?? 0,
        deliveryArea: o.deliveryArea,
      };
    },
    enabled: !!orderId,
  });

  // Slide down + buzz pattern + vibrate on first appearance
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      friction: 8,
      tension: 60,
    }).start();
    // Buzz pattern: vibrate three times to grab attention
    if (Platform.OS === 'android') {
      Vibration.vibrate([0, 400, 200, 400, 200, 400]);
    } else {
      // iOS: simple repeating vibrate (system default)
      Vibration.vibrate();
      setTimeout(() => Vibration.vibrate(), 600);
      setTimeout(() => Vibration.vibrate(), 1200);
    }
  }, []);

  // Countdown
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

  const dismiss = () => {
    Animated.timing(slideAnim, {
      toValue: -120,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setIncomingOrder(null));
  };

  // Listen for rescind events for THIS order — another store took it first
  useEffect(() => {
    const unsubscribe = onOrderRescinded((rescindedId) => {
      if (rescindedId === orderId) {
        showToast('Order taken by another store');
        dismiss();
      }
    });
    return unsubscribe;
  }, [orderId]);

  const acceptMutation = useMutation({
    // Backend route is /orders/:id/accept (not /store-accept)
    mutationFn: () => api.put(`/api/v1/orders/${orderId}/accept`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storeOrders'] });
      queryClient.invalidateQueries({ queryKey: ['storeActiveOrders'] });
      queryClient.invalidateQueries({ queryKey: ['storeDashboardStats'] });
      dismiss();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const rejectMutation = useMutation({
    // Backend route is /orders/:id/reject and requires { reason }
    mutationFn: () =>
      api
        .put(`/api/v1/orders/${orderId}/reject`, { reason: 'Store unavailable' })
        .then((r) => r.data),
    onSuccess: () => dismiss(),
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const isBusy = acceptMutation.isPending || rejectMutation.isPending;

  // Format countdown as MM:SS
  const minutes = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const timerStr = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  const timerColor =
    secondsLeft <= 30 ? colors.error : secondsLeft <= 60 ? colors.warning : colors.success;

  return (
    <Animated.View
      style={[styles.banner, { transform: [{ translateY: slideAnim }] }]}
    >
      <View style={styles.bannerHeader}>
        <View style={styles.alertIndicator}>
          <Ionicons name="notifications" size={16} color="#FCD34D" />
          <Text style={styles.bannerTitle}>New order!</Text>
        </View>
        <Text style={[styles.timer, { color: timerColor }]}>{timerStr}</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.white} size="small" style={{ marginVertical: 8 }} />
      ) : order ? (
        <View style={styles.bannerBody}>
          <Text style={styles.bannerDetails}>
            {order.itemsCount} item{order.itemsCount !== 1 ? 's' : ''} ·{' '}
            <Text style={styles.bannerTotal}>₹{order.orderTotal.toFixed(2)}</Text>
          </Text>
          {order.deliveryArea ? (
            <Text style={styles.bannerArea}>Delivery: {order.deliveryArea}</Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.bannerActions}>
        <TouchableOpacity
          activeOpacity={0.7}
          style={[styles.bannerBtn, styles.rejectBtn]}
          onPress={() => rejectMutation.mutate()}
          disabled={isBusy}
        >
          {rejectMutation.isPending ? (
            <ActivityIndicator color={colors.error} size="small" />
          ) : (
            <Text style={styles.rejectBtnText}>Reject</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          style={[styles.bannerBtn, styles.acceptBtn]}
          onPress={() => acceptMutation.mutate()}
          disabled={isBusy}
        >
          {acceptMutation.isPending ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Text style={styles.acceptBtnText}>Accept Order</Text>
          )}
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#0F172A',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    padding: spacing.lg,
    zIndex: 999,
    ...shadow.large,
  },
  bannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  alertIndicator: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  bannerTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.white },
  timer: { fontSize: fontSize.lg, fontWeight: '800' },
  bannerBody: { marginBottom: spacing.md },
  bannerDetails: { fontSize: fontSize.md, color: '#E2E8F0', marginBottom: 2 },
  bannerTotal: { fontWeight: '800', color: colors.white },
  bannerArea: { fontSize: fontSize.sm, color: '#94A3B8' },
  bannerActions: { flexDirection: 'row', gap: spacing.sm },
  bannerBtn: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectBtn: {
    backgroundColor: 'rgba(239,68,68,0.18)',
    borderWidth: 1.5,
    borderColor: colors.error,
  },
  rejectBtnText: { color: colors.error, fontSize: fontSize.sm, fontWeight: '700' },
  acceptBtn: { backgroundColor: colors.primary },
  acceptBtnText: { color: colors.white, fontSize: fontSize.sm, fontWeight: '700' },
});
