'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@aks/ui/components/badge';
import type { OrderStatus } from '@aks/shared';

/**
 * Status → badge variant + i18n label mapping, mirroring the Expo
 * store-portal so web/mobile read the same. Unknown statuses fall back to
 * "secondary" + raw status text.
 */
const VARIANT_MAP: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline'> = {
  PENDING: 'warning',
  STORE_ACCEPTED: 'default',
  DRIVER_ASSIGNED: 'default',
  PICKED_UP: 'default',
  IN_TRANSIT: 'default',
  DELIVERED: 'success',
  CANCELLED: 'secondary',
  REJECTED: 'destructive',
  STORE_REJECTED: 'destructive',
};

export function OrderStatusBadge({ status }: { status: OrderStatus | string }) {
  const t = useTranslations('orderStatus');
  const variant = VARIANT_MAP[status] ?? 'secondary';
  let label = String(status);
  try {
    label = t(String(status) as Parameters<typeof t>[0]);
  } catch {
    label = String(status);
  }
  return <Badge variant={variant}>{label}</Badge>;
}
