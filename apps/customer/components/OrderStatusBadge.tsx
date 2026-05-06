import { StyleSheet, Text, View } from 'react-native';
import { OrderStatus } from '@aks/shared';

interface OrderStatusBadgeProps {
  status: OrderStatus;
}

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; bgColor: string; textColor: string; emoji: string }
> = {
  [OrderStatus.PENDING]: {
    label: 'Pending',
    bgColor: '#FEF9C3',
    textColor: '#92400E',
    emoji: '⏳',
  },
  [OrderStatus.STORE_ACCEPTED]: {
    label: 'Accepted',
    bgColor: '#DBEAFE',
    textColor: '#1E40AF',
    emoji: '✅',
  },
  [OrderStatus.DRIVER_ASSIGNED]: {
    label: 'Driver Assigned',
    bgColor: '#EDE9FE',
    textColor: '#5B21B6',
    emoji: '🛵',
  },
  [OrderStatus.PICKED_UP]: {
    label: 'Picked Up',
    bgColor: '#FFEDD5',
    textColor: '#9A3412',
    emoji: '📦',
  },
  [OrderStatus.DELIVERED]: {
    label: 'Delivered',
    bgColor: '#DCFCE7',
    textColor: '#166534',
    emoji: '🎉',
  },
  [OrderStatus.CANCELLED]: {
    label: 'Cancelled',
    bgColor: '#FEE2E2',
    textColor: '#991B1B',
    emoji: '✕',
  },
  [OrderStatus.REJECTED]: {
    label: 'Rejected',
    bgColor: '#FEE2E2',
    textColor: '#991B1B',
    emoji: '✕',
  },
};

export function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    bgColor: '#F3F4F6',
    textColor: '#374151',
    emoji: '•',
  };

  return (
    <View style={[styles.badge, { backgroundColor: config.bgColor }]}>
      <Text style={styles.emoji}>{config.emoji}</Text>
      <Text style={[styles.label, { color: config.textColor }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  emoji: {
    fontSize: 11,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
