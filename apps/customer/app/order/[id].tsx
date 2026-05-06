import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiClient } from '@/lib/api';
import { createSocket, subscribeToOrder } from '@/lib/socket';
import { useAuthStore } from '@/store/auth.store';
import type { DriverProfile, LatLng, Order } from '@aks/shared';
import { OrderStatus } from '@aks/shared';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import type { Socket } from 'socket.io-client';

interface OrderDetailResponse {
  order: Order;
  driver?: DriverProfile;
}

const ORDER_STEPS: { status: OrderStatus; label: string; emoji: string }[] = [
  { status: OrderStatus.PENDING, label: 'Placed', emoji: '📋' },
  { status: OrderStatus.STORE_ACCEPTED, label: 'Accepted', emoji: '✅' },
  { status: OrderStatus.DRIVER_ASSIGNED, label: 'Driver Assigned', emoji: '🛵' },
  { status: OrderStatus.PICKED_UP, label: 'Picked Up', emoji: '📦' },
  { status: OrderStatus.DELIVERED, label: 'Delivered', emoji: '🎉' },
];

const STATUS_ORDER = [
  OrderStatus.PENDING,
  OrderStatus.STORE_ACCEPTED,
  OrderStatus.DRIVER_ASSIGNED,
  OrderStatus.PICKED_UP,
  OrderStatus.DELIVERED,
];

async function fetchOrder(id: string): Promise<OrderDetailResponse> {
  const res = await apiClient.get<{ data: OrderDetailResponse }>(`/api/v1/orders/${id}`);
  return res.data.data;
}

async function cancelOrder(id: string): Promise<void> {
  await apiClient.patch(`/api/v1/orders/${id}/cancel`);
}

function StepIndicator({ currentStatus }: { currentStatus: OrderStatus }) {
  const isCancelled =
    currentStatus === OrderStatus.CANCELLED || currentStatus === OrderStatus.REJECTED;
  const currentIdx = STATUS_ORDER.indexOf(currentStatus);

  return (
    <View style={styles.stepContainer}>
      {isCancelled ? (
        <View style={styles.cancelledBanner}>
          <Text style={styles.cancelledText}>
            Order {currentStatus === OrderStatus.CANCELLED ? 'Cancelled' : 'Rejected'}
          </Text>
        </View>
      ) : (
        ORDER_STEPS.map((step, idx) => {
          const isDone = currentIdx >= idx;
          const isActive = currentIdx === idx;
          return (
            <View key={step.status} style={styles.stepRow}>
              <View style={styles.stepLeft}>
                <View
                  style={[
                    styles.stepCircle,
                    isDone && styles.stepCircleDone,
                    isActive && styles.stepCircleActive,
                  ]}
                >
                  <Text style={styles.stepEmoji}>{step.emoji}</Text>
                </View>
                {idx < ORDER_STEPS.length - 1 && (
                  <View style={[styles.stepLine, isDone && styles.stepLineDone]} />
                )}
              </View>
              <Text style={[styles.stepLabel, isActive && styles.stepLabelActive]}>
                {step.label}
              </Text>
            </View>
          );
        })
      )}
    </View>
  );
}

export default function OrderTrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken } = useAuthStore();
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const [driverLocation, setDriverLocation] = useState<LatLng | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => fetchOrder(id),
    refetchInterval: 15_000,
    enabled: !!id,
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: () => Alert.alert('Error', 'Could not cancel the order.'),
  });

  useEffect(() => {
    if (!accessToken || !id) return;

    const socket = createSocket(accessToken);
    socketRef.current = socket;

    const unsubscribe = subscribeToOrder(
      socket,
      id,
      (_status: OrderStatus) => {
        queryClient.invalidateQueries({ queryKey: ['order', id] });
        queryClient.invalidateQueries({ queryKey: ['orders'] });
      },
      (location: LatLng) => {
        setDriverLocation(location);
      }
    );

    return () => {
      unsubscribe();
      socket.disconnect();
    };
  }, [accessToken, id, queryClient]);

  function handleCancel() {
    Alert.alert('Cancel Order', 'Are you sure you want to cancel this order?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: () => cancelMutation.mutate(),
      },
    ]);
  }

  const order = data?.order;
  const driver = data?.driver;

  const deliveryLat = order?.deliveryAddress.lat ?? 28.6139;
  const deliveryLng = order?.deliveryAddress.lng ?? 77.209;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Track Order</Text>
        {order && <OrderStatusBadge status={order.status} />}
      </View>

      {isLoading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#16A34A" />
        </View>
      )}

      {order && (
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Map */}
          {(driverLocation || order.status !== OrderStatus.PENDING) && (
            <MapView
              style={styles.map}
              provider={PROVIDER_GOOGLE}
              initialRegion={{
                latitude: driverLocation?.lat ?? deliveryLat,
                longitude: driverLocation?.lng ?? deliveryLng,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              }}
            >
              {/* Delivery address marker */}
              <Marker
                coordinate={{ latitude: deliveryLat, longitude: deliveryLng }}
                title="Delivery Location"
                description={order.deliveryAddress.street}
                pinColor="#16A34A"
              />
              {/* Driver live marker */}
              {driverLocation && (
                <Marker
                  coordinate={{
                    latitude: driverLocation.lat,
                    longitude: driverLocation.lng,
                  }}
                  title={driver?.name ?? 'Driver'}
                  description="Live location"
                >
                  <View style={styles.driverMarker}>
                    <Text style={{ fontSize: 24 }}>🛵</Text>
                  </View>
                </Marker>
              )}
            </MapView>
          )}

          {/* Step indicator */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Order Progress</Text>
            <StepIndicator currentStatus={order.status} />
          </View>

          {/* Driver info */}
          {driver && order.status === OrderStatus.DRIVER_ASSIGNED && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Your Driver</Text>
              <View style={styles.driverCard}>
                <View style={styles.driverAvatar}>
                  <Text style={{ fontSize: 28 }}>🧑</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.driverName}>{driver.name}</Text>
                  <Text style={styles.driverVehicle}>
                    {driver.vehicleType} · {driver.vehicleNumber}
                  </Text>
                  <Text style={styles.driverRating}>⭐ {driver.rating.toFixed(1)}</Text>
                </View>
              </View>
            </View>
          )}

          {/* ETA */}
          {[OrderStatus.DRIVER_ASSIGNED, OrderStatus.PICKED_UP].includes(order.status) && (
            <View style={styles.section}>
              <View style={styles.etaRow}>
                <Text style={styles.etaEmoji}>⏱️</Text>
                <Text style={styles.etaText}>Estimated delivery in 20–30 mins</Text>
              </View>
            </View>
          )}

          {/* Order items summary */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Order Items</Text>
            {order.items.map((item) => (
              <View key={item.itemId} style={styles.orderItemRow}>
                <Text style={styles.orderItemName}>
                  {item.qty}× {item.name}
                </Text>
                <Text style={styles.orderItemPrice}>
                  ₹{(item.price * item.qty).toFixed(2)}
                </Text>
              </View>
            ))}
            <View style={styles.divider} />
            <View style={styles.orderItemRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>₹{order.total.toFixed(2)}</Text>
            </View>
          </View>

          {/* Cancel button */}
          {order.status === OrderStatus.PENDING && (
            <TouchableOpacity
              style={[styles.cancelButton, cancelMutation.isPending && styles.cancelButtonDisabled]}
              onPress={handleCancel}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? (
                <ActivityIndicator color="#DC2626" />
              ) : (
                <Text style={styles.cancelButtonText}>Cancel Order</Text>
              )}
            </TouchableOpacity>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    fontSize: 18,
    color: '#111827',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  map: {
    height: 240,
    width: '100%',
  },
  section: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    marginBottom: 0,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  stepContainer: {
    gap: 0,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    minHeight: 56,
  },
  stepLeft: {
    alignItems: 'center',
    width: 36,
  },
  stepCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCircleDone: {
    backgroundColor: '#DCFCE7',
  },
  stepCircleActive: {
    backgroundColor: '#16A34A',
  },
  stepEmoji: {
    fontSize: 16,
  },
  stepLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 2,
    minHeight: 20,
  },
  stepLineDone: {
    backgroundColor: '#16A34A',
  },
  stepLabel: {
    fontSize: 14,
    color: '#6B7280',
    paddingTop: 8,
    fontWeight: '500',
  },
  stepLabelActive: {
    color: '#16A34A',
    fontWeight: '700',
  },
  cancelledBanner: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  cancelledText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#DC2626',
  },
  driverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  driverAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFF7ED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  driverVehicle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  driverRating: {
    fontSize: 13,
    color: '#F59E0B',
    marginTop: 2,
  },
  driverMarker: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  etaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  etaEmoji: {
    fontSize: 22,
  },
  etaText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  orderItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  orderItemName: {
    fontSize: 14,
    color: '#374151',
  },
  orderItemPrice: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 4,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  totalValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#16A34A',
  },
  cancelButton: {
    margin: 16,
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#DC2626',
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButtonDisabled: {
    opacity: 0.5,
  },
  cancelButtonText: {
    color: '#DC2626',
    fontSize: 15,
    fontWeight: '600',
  },
});
