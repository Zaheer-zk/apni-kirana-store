'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowRight, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Card, CardContent } from '@aks/ui/components/card';
import { Separator } from '@aks/ui/components/separator';
import { AppHeader } from '@/components/AppHeader';
import { EmptyPanel } from '@/components/StatePanels';
import { useCart, type CartLine } from '@/lib/cart';
import { rupees } from '@/lib/format';
import { isAuthenticated } from '@/lib/auth';

// Match the Expo cart's hard-coded base fee until Slice 2 wires the real
// per-km calc from the matching service.
const DELIVERY_FEE = 30;

export default function CartPage() {
  const router = useRouter();
  const items = useCart((s) => s.items);
  const store = useCart((s) => s.store);
  const subtotal = useCart((s) => s.subtotal());
  const itemCount = useCart((s) => s.itemCount());
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const clear = useCart((s) => s.clear);

  // Avoid hydration mismatches — render the SSR shell first, then the cart.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  function handleCheckout() {
    if (!isAuthenticated()) {
      router.push(`/login?next=${encodeURIComponent('/checkout')}`);
      return;
    }
    router.push('/checkout');
  }

  return (
    <>
      <AppHeader showSearch={false} />
      <main className="page-shell py-6">
        <header className="mb-6 flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Your cart</h1>
            <p className="mt-1 text-sm text-gray-500">
              {mounted && store
                ? `${itemCount} item${itemCount === 1 ? '' : 's'} from ${store.storeName}`
                : 'Review your items before checking out'}
            </p>
          </div>
          {mounted && items.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                if (confirm('Clear all items from your cart?')) clear();
              }}
              className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Clear cart
            </button>
          ) : null}
        </header>

        {!mounted ? (
          <EmptyPanel
            icon={<ShoppingBag className="h-6 w-6" />}
            title="Loading your cart"
            subtitle="One moment…"
          />
        ) : items.length === 0 ? (
          <EmptyPanel
            icon={<ShoppingBag className="h-6 w-6" />}
            title="Your cart is empty"
            subtitle="Add items from your favourite stores to start shopping."
            action={
              <Button asChild>
                <Link href="/">Browse items</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <section className="space-y-3">
              {items.map((line) => (
                <CartRow
                  key={line.storeItemId}
                  line={line}
                  onIncrement={() => setQty(line.storeItemId, line.qty + 1)}
                  onDecrement={() => setQty(line.storeItemId, line.qty - 1)}
                  onRemove={() => remove(line.storeItemId)}
                />
              ))}
            </section>

            <aside className="space-y-3">
              <Card>
                <CardContent className="space-y-3 p-5">
                  <h2 className="text-base font-semibold text-gray-900">Order summary</h2>
                  <Row label={`Subtotal (${itemCount} items)`} value={rupees(subtotal)} />
                  <Row label="Delivery fee" value={rupees(DELIVERY_FEE)} />
                  <Separator />
                  <Row label="Total" value={rupees(subtotal + DELIVERY_FEE)} bold />
                  <Button size="lg" className="w-full" onClick={handleCheckout}>
                    Proceed to checkout
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <p className="text-center text-xs text-gray-500">
                    Address &amp; payment in the next step
                  </p>
                </CardContent>
              </Card>

              {store ? (
                <Card>
                  <CardContent className="flex items-start gap-3 p-4">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
                      <ShoppingBag className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Ordering from
                      </p>
                      <p className="text-sm font-semibold text-gray-900">{store.storeName}</p>
                      {store.etaMinutes ? (
                        <p className="text-xs text-gray-500">
                          ≈ {store.etaMinutes} min delivery once accepted
                        </p>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </aside>
          </div>
        )}
      </main>
    </>
  );
}

function CartRow({
  line,
  onIncrement,
  onDecrement,
  onRemove,
}: {
  line: CartLine;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
}) {
  return (
    <article className="flex gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:gap-4 sm:p-4">
      <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100 sm:h-24 sm:w-24">
        {line.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={line.imageUrl} alt={line.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 text-2xl font-bold text-primary-700">
            {line.name.slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <p className="line-clamp-2 text-sm font-semibold text-gray-900 sm:text-base">{line.name}</p>
        <p className="text-xs text-gray-500">{line.unit}</p>
        <p className="mt-1 text-sm font-bold text-gray-900">{rupees(line.price)}</p>
      </div>

      <div className="flex flex-col items-end justify-between gap-2">
        <div className="inline-flex h-9 items-center overflow-hidden rounded-full border border-gray-300 bg-white">
          <button
            type="button"
            className="flex h-full w-9 items-center justify-center text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            onClick={onDecrement}
            disabled={line.qty <= 1}
            aria-label="Decrease quantity"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-9 text-center text-sm font-semibold">{line.qty}</span>
          <button
            type="button"
            className="flex h-full w-9 items-center justify-center text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            onClick={onIncrement}
            disabled={line.qty >= line.maxStock && line.maxStock > 0}
            aria-label="Increase quantity"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs font-semibold text-gray-500 hover:text-destructive"
        >
          Remove
        </button>
      </div>
    </article>
  );
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className={bold ? 'font-semibold text-gray-900' : 'text-gray-600'}>{label}</span>
      <span className={bold ? 'text-lg font-bold text-gray-900' : 'text-gray-900'}>{value}</span>
    </div>
  );
}
