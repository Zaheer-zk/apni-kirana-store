import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { OrderStatus } from '@aks/shared';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

interface OrderStatusBadgeProps {
  status: OrderStatus;
  style?: ViewStyle;
}

interface StatusConfig {
  label: string;
  bg: string;
  fg: string;
  dot: string;
}

const STATUS_CONFIG: Record<OrderStatus, StatusConfig> = {
  [OrderStatus.PENDING]: {
    label: 'Pending',
    bg: colors.warningLight,
    fg: '#B45309',
    dot: colors.warning,
  },
  [OrderStatus.STORE_ACCEPTED]: {
    label: 'Accepted',
    bg: colors.infoLight,
    fg: '#1E40AF',
    dot: colors.info,
  },
  [OrderStatus.DRIVER_ASSIGNED]: {
    label: 'Driver assigned',
    bg: colors.purpleLight,
    fg: '#5B21B6',
    dot: colors.purple,
  },
  [OrderStatus.PICKED_UP]: {
    label: 'Picked up',
    bg: colors.indigoLight,
    fg: '#3730A3',
    dot: colors.indigo,
  },
  [OrderStatus.DELIVERED]: {
    label: 'Delivered',
    bg: colors.successLight,
    fg: '#166534',
    dot: colors.success,
  },
  [OrderStatus.CANCELLED]: {
    label: 'Cancelled',
    bg: colors.errorLight,
    fg: '#991B1B',
    dot: colors.error,
  },
  [OrderStatus.REJECTED]: {
    label: 'Rejected',
    bg: colors.errorLight,
    fg: '#991B1B',
    dot: colors.error,
  },
};

export function OrderStatusBadge({ status, style }: OrderStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <View style={[styles.badge, { backgroundColor: config.bg }, style]}>
      <View style={[styles.dot, { backgroundColor: config.dot }]} />
      <Text style={[styles.label, { color: config.fg }]} numberOfLines={1}>
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
