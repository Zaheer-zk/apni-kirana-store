'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@aks/ui/components/badge';
import { OrderStatus } from '@aks/shared';

const STATUS_VARIANT: Record<
  OrderStatus | string,
  'default' | 'secondary' | 'warning' | 'success' | 'destructive' | 'outline'
> = {
  [OrderStatus.PENDING]: 'warning',
  [OrderStatus.STORE_ACCEPTED]: 'secondary',
  [OrderStatus.DRIVER_ASSIGNED]: 'secondary',
  [OrderStatus.PICKED_UP]: 'secondary',
  [OrderStatus.DELIVERED]: 'success',
  [OrderStatus.CANCELLED]: 'destructive',
  [OrderStatus.REJECTED]: 'destructive',
};

/**
 * Single source of truth for order-status pill styling on customer-web.
 * Mirrors `apps/customer/components/OrderStatusBadge.tsx` so the same labels
 * appear on phone + web; labels here come from i18n message bundle.
 */
export function OrderStatusBadge({ status }: { status: OrderStatus | string }) {
  const t = useTranslations('orderStatus');
  const variant = STATUS_VARIANT[status] ?? 'secondary';
  // Translation key lookup is safe for known statuses; unknown ones fall
  // back to the raw status string (matches old behaviour).
  const key = String(status);
  let label = key;
  try {
    label = t(key as Parameters<typeof t>[0]);
  } catch {
    label = key;
  }
  return (
    <Badge variant={variant} className="text-[11px]">
      {label}
    </Badge>
  );
}
