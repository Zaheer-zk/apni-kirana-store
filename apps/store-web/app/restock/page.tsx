'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ClipboardList,
  Inbox,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Truck,
} from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Card, CardContent } from '@aks/ui/components/card';
import { Input } from '@aks/ui/components/input';
import { Skeleton } from '@aks/ui/components/skeleton';
import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';
import { EmptyPanel } from '@/components/StatePanels';
import { api, unwrapList } from '@/lib/api';
import {
  restockCartCount,
  useRestockCart,
  type RestockCartItem,
} from '@/lib/restock-cart';

// B2B restock browse: a store owner picks catalog items to order from a
// wholesaler. Mirrors apps/store-portal/app/(tabs)/restock.tsx — the cart
// holds catalog items only; the backend picks the best wholesaler at
// order-placement time so we never bake a wholesaler choice into the cart.

interface CatalogItem {
  id: string;
  name: string;
  category: string;
  defaultUnit?: string;
  unit?: string;
  imageUrl?: string | null;
}

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function RestockPage() {
  return (
    <AuthGuard>
      <AppShell>
        <Inner />
      </AppShell>
    </AuthGuard>
  );
}

function Inner() {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim(), 300);

  const cartItems = useRestockCart((s) => s.items);
  const setQty = useRestockCart((s) => s.setQty);
  const count = useMemo(() => restockCartCount(cartItems), [cartItems]);

  const catalog = useQuery<CatalogItem[]>({
    queryKey: ['restock-catalog', debounced],
    queryFn: async () => {
      const url = debounced ? '/api/v1/catalog/search/q' : '/api/v1/catalog';
      const params = debounced ? { q: debounced } : { page: 1, limit: 100 };
      const res = await api.get(url, { params });
      return unwrapList<CatalogItem>(res.data, 'items');
    },
    staleTime: 30_000,
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Truck className="h-6 w-6 text-primary" />
            Restock from wholesaler
          </h1>
          <p className="text-sm text-gray-500">
            Pick what you need — we&apos;ll match you to the best in-range wholesaler.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/restock/orders">
              <ClipboardList className="h-4 w-4" /> My restock orders
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/restock/cart">
              <ShoppingCart className="h-4 w-4" />
              Cart{count > 0 ? ` · ${count}` : ''}
            </Link>
          </Button>
        </div>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          className="pl-9"
          placeholder="Search catalog (rice, atta, soap…)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {catalog.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : catalog.isError ? (
        <EmptyPanel
          icon={<Inbox className="h-7 w-7" />}
          title="Couldn’t load the catalog"
          subtitle="Check your connection and try again."
        />
      ) : (catalog.data ?? []).length === 0 ? (
        <EmptyPanel
          icon={<Inbox className="h-7 w-7" />}
          title={debounced ? 'No matches' : 'Catalog is empty'}
          subtitle={
            debounced
              ? 'Try a different search term.'
              : 'Admin hasn’t added any catalog items yet — request one from Help.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(catalog.data ?? []).map((it) => {
            const qty = cartItems[it.id]?.qty ?? 0;
            const unit = it.unit ?? it.defaultUnit ?? '';
            return (
              <Card key={it.id}>
                <CardContent className="flex items-center gap-3 p-4">
                  {it.imageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={it.imageUrl}
                      alt={it.name}
                      className="h-14 w-14 flex-shrink-0 rounded-lg border border-gray-100 object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary">
                      <Truck className="h-5 w-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{it.name}</p>
                    <p className="text-xs text-gray-500">
                      {it.category}
                      {unit ? ` · ${unit}` : ''}
                    </p>
                  </div>
                  <QtyStepper
                    qty={qty}
                    onChange={(next) =>
                      setQty(
                        {
                          catalogItemId: it.id,
                          name: it.name,
                          unit,
                          category: it.category,
                          imageUrl: it.imageUrl ?? null,
                        },
                        next,
                      )
                    }
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function QtyStepper({
  qty,
  onChange,
}: {
  qty: number;
  onChange: (n: number) => void;
}) {
  if (qty <= 0) {
    return (
      <Button size="sm" onClick={() => onChange(1)}>
        <Plus className="h-3.5 w-3.5" />
        Add
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-1 rounded-md border border-primary bg-primary-50">
      <button
        type="button"
        onClick={() => onChange(qty - 1)}
        className="flex h-8 w-8 items-center justify-center text-primary hover:bg-primary-100"
        aria-label="Decrease quantity"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-6 text-center text-sm font-bold text-primary">{qty}</span>
      <button
        type="button"
        onClick={() => onChange(qty + 1)}
        className="flex h-8 w-8 items-center justify-center text-primary hover:bg-primary-100"
        aria-label="Increase quantity"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// Re-export for consumer code that wants the type. Avoids the consumer
// having to remember it lives in `lib/restock-cart`.
export type { RestockCartItem };
