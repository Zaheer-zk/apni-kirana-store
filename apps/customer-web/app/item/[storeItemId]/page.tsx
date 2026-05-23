'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Clock, MapPin, Minus, Plus, ShieldCheck, Star } from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Badge } from '@aks/ui/components/badge';
import { Skeleton } from '@aks/ui/components/skeleton';
import { Separator } from '@aks/ui/components/separator';
import { toast } from '@aks/ui/components/sonner';
import { AppHeader } from '@/components/AppHeader';
import { SwitchStoreDialog } from '@/components/SwitchStoreDialog';
import { EmptyPanel, ErrorPanel } from '@/components/StatePanels';
import { api, unwrap } from '@/lib/api';
import { useCart, type CartStoreContext } from '@/lib/cart';
import { distance as fmtDistance, etaWindow, rupees } from '@/lib/format';

interface ItemDetail {
  storeItem: {
    id: string;
    price: number;
    stockQty: number;
    isAvailable: boolean;
  };
  catalogItem: {
    id: string;
    name: string;
    description?: string | null;
    category: string;
    defaultUnit?: string | null;
    imageUrl?: string | null;
  };
  store: {
    id: string;
    name: string;
    rating: number;
    isOpen: boolean;
    distanceKm?: number | null;
  };
}

export default function ItemDetailPage() {
  const router = useRouter();
  const params = useParams<{ storeItemId: string }>();
  const id = params.storeItemId;

  const [qty, setQty] = useState(1);
  const { add, replaceStore, store: cartStore } = useCart();
  const [pending, setPending] = useState<{
    store: CartStoreContext;
    line: Parameters<typeof add>[1];
  } | null>(null);

  const itemQuery = useQuery({
    queryKey: ['item-detail', id],
    queryFn: async () => {
      const res = await api.get(`/api/v1/items/${id}`);
      return unwrap<ItemDetail>(res.data);
    },
    enabled: !!id,
  });

  function buildLine() {
    if (!itemQuery.data) return null;
    const { storeItem, catalogItem, store } = itemQuery.data;
    const ctx: CartStoreContext = {
      storeId: store.id,
      storeName: store.name,
      etaMinutes:
        store.distanceKm != null ? Math.max(15, Math.round(store.distanceKm * 5) + 5) : undefined,
    };
    const line = {
      storeItemId: storeItem.id,
      catalogItemId: catalogItem.id,
      name: catalogItem.name,
      price: storeItem.price,
      unit: catalogItem.defaultUnit ?? '1 unit',
      imageUrl: catalogItem.imageUrl ?? null,
      maxStock: storeItem.stockQty,
      qty,
    };
    return { ctx, line };
  }

  function handleAdd() {
    const built = buildLine();
    if (!built) return;
    const { ctx, line } = built;
    const result = add(ctx, line);
    if (result === 'conflict') {
      setPending({ store: ctx, line });
      return;
    }
    toast.success(`${line.name} added to cart`);
  }

  function confirmReplace() {
    if (!pending) return;
    replaceStore(pending.store, pending.line);
    toast.success(`Cart switched to ${pending.store.storeName}`);
    setPending(null);
  }

  return (
    <>
      <AppHeader showSearch={false} />

      <div className="border-b border-gray-200 bg-white">
        <div className="page-shell flex items-center gap-3 py-3">
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))}
            aria-label="Back"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="truncate text-base font-semibold text-gray-800">
            {itemQuery.data?.catalogItem.name ?? 'Item'}
          </h1>
        </div>
      </div>

      <main className="page-shell py-6">
        {itemQuery.isLoading ? (
          <LoadingSkeleton />
        ) : itemQuery.isError ? (
          <ErrorPanel
            message="Couldn't load this item."
            onRetry={() => itemQuery.refetch()}
          />
        ) : !itemQuery.data ? (
          <EmptyPanel
            icon={<Star className="h-6 w-6" />}
            title="Item not found"
            subtitle="The store may have stopped carrying this item."
            action={
              <Button asChild variant="default">
                <Link href="/search">Search for something else</Link>
              </Button>
            }
          />
        ) : (
          <Detail
            data={itemQuery.data}
            qty={qty}
            setQty={setQty}
            onAdd={handleAdd}
          />
        )}
      </main>

      <SwitchStoreDialog
        open={!!pending}
        currentStore={cartStore?.storeName ?? null}
        newStore={pending?.store.storeName ?? null}
        onCancel={() => setPending(null)}
        onConfirm={confirmReplace}
      />
    </>
  );
}

function Detail({
  data,
  qty,
  setQty,
  onAdd,
}: {
  data: ItemDetail;
  qty: number;
  setQty: (n: number) => void;
  onAdd: () => void;
}) {
  const { storeItem, catalogItem, store } = data;
  const outOfStock = !storeItem.isAvailable || storeItem.stockQty <= 0;
  const distance = fmtDistance(store.distanceKm);
  const eta = etaWindow(store.distanceKm);

  return (
    <div className="grid gap-8 sm:grid-cols-2">
      {/* Image */}
      <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
        {catalogItem.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={catalogItem.imageUrl}
            alt={catalogItem.name}
            className="aspect-square w-full object-cover"
          />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100">
            <span className="text-7xl font-bold text-primary-700">
              {catalogItem.name.slice(0, 1).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Details */}
      <div className="flex flex-col gap-4">
        <div>
          <Badge variant="secondary" className="mb-2">
            {prettyCategory(catalogItem.category)}
          </Badge>
          <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">{catalogItem.name}</h2>
          <p className="mt-1 text-sm text-gray-500">{catalogItem.defaultUnit ?? '1 unit'}</p>
        </div>

        <div className="flex items-end gap-2">
          <span className="text-3xl font-bold text-gray-900">{rupees(storeItem.price)}</span>
          <span className="pb-1 text-sm text-gray-500">inclusive of all taxes</span>
        </div>

        {catalogItem.description ? (
          <p className="text-sm leading-relaxed text-gray-600">{catalogItem.description}</p>
        ) : null}

        <Separator />

        {/* Store card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Sold by</p>
              <p className="text-base font-semibold text-gray-900">{store.name}</p>
            </div>
            <Badge variant={store.isOpen ? 'success' : 'warning'}>
              {store.isOpen ? 'Open now' : 'Closed'}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-gray-600">
            <span className="inline-flex items-center gap-1">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {store.rating.toFixed(1)} rating
            </span>
            {distance ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {distance} away
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {eta}
            </span>
          </div>
        </div>

        {/* Qty + Add to cart */}
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
          <QtyStepper
            value={qty}
            onChange={setQty}
            max={Math.max(1, storeItem.stockQty)}
            disabled={outOfStock}
          />
          <Button
            size="lg"
            className="flex-1"
            disabled={outOfStock}
            onClick={onAdd}
          >
            {outOfStock ? 'Out of stock' : `Add ${qty} to cart · ${rupees(storeItem.price * qty)}`}
          </Button>
        </div>

        <p className="flex items-center gap-2 text-xs text-gray-500">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Cash on delivery available · Free returns on damaged items
        </p>
      </div>
    </div>
  );
}

function QtyStepper({
  value,
  onChange,
  max,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  max: number;
  disabled?: boolean;
}) {
  return (
    <div
      className="inline-flex h-12 items-center overflow-hidden rounded-xl border border-gray-300 bg-white"
      aria-disabled={disabled}
    >
      <button
        type="button"
        className="flex h-full w-10 items-center justify-center text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={disabled || value <= 1}
        aria-label="Decrease quantity"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="w-10 text-center text-base font-semibold text-gray-900">{value}</span>
      <button
        type="button"
        className="flex h-full w-10 items-center justify-center text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
        aria-label="Increase quantity"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid gap-8 sm:grid-cols-2">
      <Skeleton className="aspect-square w-full rounded-3xl" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}

function prettyCategory(cat: string): string {
  return cat.charAt(0) + cat.slice(1).toLowerCase();
}
