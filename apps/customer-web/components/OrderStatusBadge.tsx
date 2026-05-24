'use client';

import { Badge } from '@aks/ui/components/badge';
import { OrderStatus } from '@aks/shared';

const STATUS_META: Record<
  OrderStatus | string,
  { label: string; variant: 'default' | 'secondary' | 'warning' | 'success' | 'destructive' | 'outline' }
> = {
  [OrderStatus.PENDING]: { label: 'Placed', variant: 'warning' },
  [OrderStatus.STORE_ACCEPTED]: { label: 'Accepted', variant: 'secondary' },
  [OrderStatus.DRIVER_ASSIGNED]: { label: 'Out for pickup', variant: 'secondary' },
  [OrderStatus.PICKED_UP]: { label: 'On the way', variant: 'secondary' },
  [OrderStatus.DELIVERED]: { label: 'Delivered', variant: 'success' },
  [OrderStatus.CANCELLED]: { label: 'Cancelled', variant: 'destructive' },
  [OrderStatus.REJECTED]: { label: 'Rejected', variant: 'destructive' },
};

/**
 * Single source of truth for order-status pill styling on customer-web.
 * Mirrors `apps/customer/components/OrderStatusBadge.tsx` so the same labels
 * appear on phone + web; if you change a label here, change it there too.
 */
export function OrderStatusBadge({ status }: { status: OrderStatus | string }) {
  const meta = STATUS_META[status] ?? { label: String(status), variant: 'secondary' as const };
  return (
    <Badge variant={meta.variant} className="text-[11px]">
      {meta.label}
    </Badge>
  );
}
