import { Badge } from '@aks/ui/components/badge';
import type { OrderStatus } from '@aks/shared';

/**
 * Status → badge variant + label mapping, mirroring the Expo store-portal so
 * web/mobile read the same. Unknown statuses fall back to "secondary".
 */
const MAP: Record<string, { variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline'; label: string }> = {
  PENDING: { variant: 'warning', label: 'Pending' },
  STORE_ACCEPTED: { variant: 'default', label: 'Preparing' },
  DRIVER_ASSIGNED: { variant: 'default', label: 'Driver assigned' },
  PICKED_UP: { variant: 'default', label: 'Picked up' },
  IN_TRANSIT: { variant: 'default', label: 'In transit' },
  DELIVERED: { variant: 'success', label: 'Delivered' },
  CANCELLED: { variant: 'secondary', label: 'Cancelled' },
  REJECTED: { variant: 'destructive', label: 'Rejected' },
  STORE_REJECTED: { variant: 'destructive', label: 'Rejected by store' },
};

export function OrderStatusBadge({ status }: { status: OrderStatus | string }) {
  const info = MAP[status] ?? { variant: 'secondary' as const, label: status };
  return <Badge variant={info.variant}>{info.label}</Badge>;
}
