'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  Lock,
  MapPin,
  PackageCheck,
  XCircle,
} from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@aks/ui/components/card';
import { Skeleton } from '@aks/ui/components/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@aks/ui/components/dialog';
import { toast } from '@aks/ui/components/sonner';
import type { OrderDetail } from '@aks/shared';
import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { ErrorPanel } from '@/components/StatePanels';
import { api } from '@/lib/api';
import { rupees, shortOrderId } from '@/lib/format';

const STATUS_TIMELINE_LABELS: Record<string, string> = {
  PENDING: 'Order placed',
  STORE_ACCEPTED: 'Store accepted',
  STORE_REJECTED: 'Store rejected',
  DRIVER_ASSIGNED: 'Driver assigned',
  PICKED_UP: 'Picked up',
  IN_TRANSIT: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected',
};

export default function OrderDetailPage() {
  return (
    <AuthGuard>
      <AppShell>
        <OrderDetailInner />
      </AppShell>
    </AuthGuard>
  );
}

function OrderDetailInner() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const queryClient = useQueryClient();
  const [rejectOpen, setRejectOpen] = useState(false);

  const { data: order, isLoading, isError, refetch } = useQuery<OrderDetail | null>({
    queryKey: ['orderDetail', id],
    enabled: !!id,
    queryFn: async () => {
      const res = await api.get(`/api/v1/orders/${id}`);
      return (res.data?.data ?? res.data) as OrderDetail | null;
    },
    refetchInterval: 20_000,
  });

  const accept = useMutation({
    mutationFn: () => api.put(`/api/v1/orders/${id}/accept`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orderDetail', id] });
      queryClient.invalidateQueries({ queryKey: ['storeOrders'] });
      queryClient.invalidateQueries({ queryKey: ['storeActiveOrders'] });
      queryClient.invalidateQueries({ queryKey: ['storeStatsToday'] });
      toast.success('Order accepted');
    },
    onError: (err: Error) => toast.error(err.message || 'Could not accept order'),
  });

  const reject = useMutation({
    mutationFn: (reason: string) =>
      api.put(`/api/v1/orders/${id}/reject`, { reason }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orderDetail', id] });
      queryClient.invalidateQueries({ queryKey: ['storeOrders'] });
      queryClient.invalidateQueries({ queryKey: ['storeStatsToday'] });
      setRejectOpen(false);
      toast.success('Order rejected');
      router.replace('/orders');
    },
    onError: (err: Error) => toast.error(err.message || 'Could not reject order'),
  });

  const markReady = useMutation({
    mutationFn: () => api.put(`/api/v1/orders/${id}/ready`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orderDetail', id] });
      queryClient.invalidateQueries({ queryKey: ['storeActiveOrders'] });
      toast.success('Marked as ready for pickup');
    },
    onError: (err: Error) => toast.error(err.message || 'Could not update order'),
  });

  if (isLoading) {
    return (
      <div className="page-shell space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="page-shell">
        <ErrorPanel message="Couldn't load this order." onRetry={() => refetch()} />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="page-shell">
        <ErrorPanel message="Order not found." />
      </div>
    );
  }

  const isPending = order.status === 'PENDING';
  const isAccepted = order.status === 'STORE_ACCEPTED';
  const isBusy = accept.isPending || reject.isPending || markReady.isPending;

  return (
    <div className="page-shell space-y-6">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <a href="/orders" onClick={(e) => { e.preventDefault(); router.back(); }} className="gap-1">
          <ArrowLeft className="h-4 w-4" />
          Back to orders
        </a>
      </Button>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl font-bold text-gray-900 sm:text-2xl">
            {shortOrderId(order.id)}
          </h1>
          <p className="text-xs text-gray-500">
            Placed{' '}
            {new Date(order.createdAt).toLocaleString('en-IN', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </header>

      {/* Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {order.items.map((item) => (
            <div key={item.itemId} className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3 last:border-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                <p className="text-xs text-gray-500">{item.unit}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold text-gray-600">×{item.quantity}</p>
                <p className="text-sm font-bold text-gray-900">
                  {rupees(item.price * item.quantity)}
                </p>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-gray-200 pt-3">
            <span className="text-sm font-semibold text-gray-700">Total</span>
            <span className="text-xl font-bold text-primary">{rupees(order.total)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Delivery info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Delivery info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-gray-500">Area</p>
              <p className="text-sm font-medium text-gray-900">{order.deliveryArea}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-gray-500">Pincode</p>
              <p className="text-sm font-medium text-gray-900">{order.deliveryPincode || '—'}</p>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-md bg-gray-50 p-3 text-xs text-gray-600">
            <Lock className="mt-0.5 h-3.5 w-3.5" />
            <span>Customer details are hidden for privacy. The driver receives the full address.</span>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      {order.statusTimeline && order.statusTimeline.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Order timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {order.statusTimeline.map((ev, idx) => {
                const isLast = idx === order.statusTimeline!.length - 1;
                return (
                  <li key={`${ev.status}-${idx}`} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`h-3 w-3 rounded-full ${
                          ev.isCurrent ? 'bg-primary' : 'bg-gray-300'
                        }`}
                      />
                      {!isLast ? <span className="h-8 w-px bg-gray-200" /> : null}
                    </div>
                    <div className="-mt-0.5">
                      <p
                        className={`text-sm ${
                          ev.isCurrent ? 'font-semibold text-gray-900' : 'text-gray-600'
                        }`}
                      >
                        {STATUS_TIMELINE_LABELS[ev.status] ?? ev.status}
                      </p>
                      {ev.timestamp ? (
                        <p className="text-xs text-gray-400">
                          {new Date(ev.timestamp).toLocaleString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      {/* Actions */}
      {isPending ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="border-red-200 text-red-700 hover:bg-red-50"
            disabled={isBusy}
            onClick={() => setRejectOpen(true)}
          >
            <XCircle className="h-4 w-4" /> Reject order
          </Button>
          <Button
            type="button"
            size="lg"
            loading={accept.isPending}
            disabled={isBusy}
            onClick={() => accept.mutate()}
          >
            <CheckCircle2 className="h-4 w-4" /> Accept order
          </Button>
        </div>
      ) : isAccepted ? (
        <Button
          type="button"
          size="lg"
          className="w-full"
          loading={markReady.isPending}
          disabled={isBusy}
          onClick={() => markReady.mutate()}
        >
          <PackageCheck className="h-4 w-4" /> Mark ready for pickup
        </Button>
      ) : null}

      <RejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        onConfirm={(reason) => reject.mutate(reason)}
        submitting={reject.isPending}
      />
    </div>
  );
}

function RejectDialog({
  open,
  onOpenChange,
  onConfirm,
  submitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  submitting: boolean;
}) {
  const [reason, setReason] = useState('');

  function submit() {
    const trimmed = reason.trim() || 'Store cannot fulfill this order';
    onConfirm(trimmed);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject this order?</DialogTitle>
          <DialogDescription>
            The customer will be notified and matched to another nearby store. Tell us why so
            we can avoid sending similar orders to you.
          </DialogDescription>
        </DialogHeader>
        <textarea
          rows={3}
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="flex w-full rounded-md border border-input bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} loading={submitting}>
            Reject order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
