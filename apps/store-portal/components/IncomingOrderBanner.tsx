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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useStorePortalStore } from '@/store/store.store';
import { onOrderRescinded } from '@/lib/socket';

// Order preview shape from GET /api/v1/orders/:id (we extract the bits we need)
interface IncomingOrderPreview {
  id: string;
  itemsCount: number;
  orderTotal: number;
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
      }>(r.data);
      return {
        id: o.id,
        itemsCount: o.items?.length ?? 0,
        orderTotal: o.total ?? 0,
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
  const timerColor = secondsLeft <= 30 ? '#DC2626' : secondsLeft <= 60 ? '#F59E0B' : '#16A34A';

  return (
    <Animated.View
      style={[styles.banner, { transform: [{ translateY: slideAnim }] }]}
    >
      <View style={styles.bannerHeader}>
        <View style={styles.alertIndicator}>
          <Text style={styles.alertDot}>●</Text>
          <Text style={styles.bannerTitle}>New Order!</Text>
        </View>
        <Text style={[styles.timer, { color: timerColor }]}>{timerStr}</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color="#fff" size="small" style={{ marginVertical: 8 }} />
      ) : order ? (
        <View style={styles.bannerBody}>
          <Text style={styles.bannerDetails}>
            {order.itemsCount} item{order.itemsCount !== 1 ? 's' : ''} ·{' '}
            <Text style={styles.bannerTotal}>₹{order.orderTotal.toFixed(2)}</Text>
          </Text>
          <Text style={styles.bannerArea}>Delivery: {order.deliveryArea}</Text>
        </View>
      ) : null}

      <View style={styles.bannerActions}>
        <TouchableOpacity
          style={[styles.bannerBtn, styles.rejectBtn]}
          onPress={() => rejectMutation.mutate()}
          disabled={isBusy}
        >
          {rejectMutation.isPending ? (
            <ActivityIndicator color="#DC2626" size="small" />
          ) : (
            <Text style={styles.rejectBtnText}>Reject</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.bannerBtn, styles.acceptBtn]}
          onPress={() => acceptMutation.mutate()}
          disabled={isBusy}
        >
          {acceptMutation.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
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
    backgroundColor: '#1E3A5F',
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    zIndex: 999,
  },
  bannerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  alertIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  alertDot: { color: '#FCD34D', fontSize: 10 },
  bannerTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  timer: { fontSize: 18, fontWeight: '800' },
  bannerBody: { marginBottom: 10 },
  bannerDetails: { fontSize: 15, color: '#E2E8F0', marginBottom: 2 },
  bannerTotal: { fontWeight: '800', color: '#fff' },
  bannerArea: { fontSize: 13, color: '#94A3B8' },
  bannerActions: { flexDirection: 'row', gap: 10 },
  bannerBtn: { flex: 1, height: 42, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  rejectBtn: { backgroundColor: 'rgba(220,38,38,0.15)', borderWidth: 1.5, borderColor: '#DC2626' },
  rejectBtnText: { color: '#DC2626', fontSize: 14, fontWeight: '700' },
  acceptBtn: { backgroundColor: '#2563EB' },
  acceptBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
