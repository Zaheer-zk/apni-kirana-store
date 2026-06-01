'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CreditCard,
  Info,
  Loader2,
  Minus,
  Plus,
  ShoppingCart,
  Wallet,
} from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Card, CardContent } from '@aks/ui/components/card';
import { toast } from '@aks/ui/components/sonner';
import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';
import { api } from '@/lib/api';
import { restockCartList, useRestockCart } from '@/lib/restock-cart';

type PaymentMethod = 'CASH_ON_DELIVERY' | 'ONLINE';

// Cart + checkout for B2B restock orders. Mirrors
// apps/store-portal/app/restock/cart.tsx — same /api/v1/orders/restock
// endpoint with the same shape so a draft cart on either surface lands
// the same order.
export default function RestockCartPage() {
  return (
    <AuthGuard>
      <AppShell>
        <Inner />
      </AppShell>
    </AuthGuard>
  );
}

function Inner() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const cartItems = useRestockCart((s) => s.items);
  const setQty = useRestockCart((s) => s.setQty);
  const clear = useRestockCart((s) => s.clear);
  const items = useMemo(() => restockCartList(cartItems), [cartItems]);

  const [payment, setPayment] = useState<PaymentMethod>('CASH_ON_DELIVERY');

  const placeOrder = useMutation({
    mutationFn: async () => {
      const res = await api.post('/api/v1/orders/restock', {
        items: items.map((i) => ({ catalogItemId: i.catalogItemId, qty: i.qty })),
        paymentMethod: payment,
      });
      return res.data?.data;
    },
    onSuccess: (order: { total?: number } | undefined) => {
      clear();
      queryClient.invalidateQueries({ queryKey: ['restock-orders'] });
      toast.success(
        `Restock order placed${
          order?.total != null ? ` — estimated total ₹${order.total.toFixed(2)}` : ''
        }. Matching you with a wholesaler.`,
      );
      router.replace('/restock/orders');
    },
    onError: (err: Error) => toast.error(err.message || 'Could not place order'),
  });

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <BackBar />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
              <ShoppingCart className="h-7 w-7 text-gray-400" />
            </div>
            <p className="text-sm font-bold text-gray-900">Your restock cart is empty</p>
            <p className="max-w-sm text-xs text-gray-500">
              Add items from the Restock page to place an order.
            </p>
            <Button asChild size="sm">
              <Link href="/restock">Browse catalog</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackBar />

      <Card>
        <CardContent className="divide-y divide-gray-100 p-0">
          {items.map((item) => (
            <div key={item.catalogItemId} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">{item.name}</p>
                <p className="text-xs text-gray-500">
                  {item.unit ? `${item.unit} · ` : ''}
                  {item.category}
                </p>
              </div>
              <div className="flex items-center gap-1 rounded-md border border-primary bg-primary-50">
                <button
                  type="button"
                  onClick={() => setQty(item, item.qty - 1)}
                  className="flex h-8 w-8 items-center justify-center text-primary hover:bg-primary-100"
                  aria-label="Decrease"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-6 text-center text-sm font-bold text-primary">
                  {item.qty}
                </span>
                <button
                  type="button"
                  onClick={() => setQty(item, item.qty + 1)}
                  className="flex h-8 w-8 items-center justify-center text-primary hover:bg-primary-100"
                  aria-label="Increase"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Payment
        </p>
        <div className="grid grid-cols-2 gap-3">
          <PayOption
            active={payment === 'CASH_ON_DELIVERY'}
            icon={<Wallet className="h-4 w-4" />}
            label="Pay on delivery"
            onClick={() => setPayment('CASH_ON_DELIVERY')}
          />
          <PayOption
            active={payment === 'ONLINE'}
            icon={<CreditCard className="h-4 w-4" />}
            label="Online"
            onClick={() => setPayment('ONLINE')}
          />
        </div>
      </section>

      <div className="flex items-start gap-2 rounded-md bg-gray-50 p-3 text-xs text-gray-600">
        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        <span>
          We&apos;ll match your order to the best in-range wholesaler. The final price and
          delivery fee are confirmed once a wholesaler accepts.
        </span>
      </div>

      <Button
        className="w-full"
        size="lg"
        disabled={placeOrder.isPending}
        onClick={() => placeOrder.mutate()}
      >
        {placeOrder.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ShoppingCart className="h-4 w-4" />
        )}
        Place restock order · {items.length} item{items.length === 1 ? '' : 's'}
      </Button>
    </div>
  );
}

function BackBar() {
  return (
    <Link
      href="/restock"
      className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to restock
    </Link>
  );
}

function PayOption({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-medium transition ${
        active
          ? 'border-primary bg-primary-50 text-primary'
          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
