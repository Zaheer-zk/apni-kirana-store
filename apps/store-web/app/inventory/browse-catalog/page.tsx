'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  Package,
  Plus,
  Search,
} from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Input } from '@aks/ui/components/input';
import { Skeleton } from '@aks/ui/components/skeleton';
import { Card, CardContent } from '@aks/ui/components/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@aks/ui/components/dialog';
import { toast } from '@aks/ui/components/sonner';
import type { CatalogItemRow, StoreInventoryItem } from '@aks/shared';
import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';
import { EmptyPanel, ErrorPanel } from '@/components/StatePanels';
import { api, unwrapList } from '@/lib/api';

const CATEGORY_FILTERS: { label: string; value: string }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Grocery', value: 'GROCERY' },
  { label: 'Dairy', value: 'DAIRY' },
  { label: 'Beverages', value: 'BEVERAGES' },
  { label: 'Snacks', value: 'SNACKS' },
  { label: 'Personal care', value: 'PERSONAL_CARE' },
  { label: 'Household', value: 'HOUSEHOLD' },
];

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function BrowseCatalogPage() {
  return (
    <AuthGuard>
      <AppShell>
        <BrowseCatalogInner />
      </AppShell>
    </AuthGuard>
  );
}

function BrowseCatalogInner() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('ALL');
  const [addingItem, setAddingItem] = useState<CatalogItemRow | null>(null);
  const debouncedSearch = useDebounced(search, 300);

  // Owner's existing inventory — used to render "Already added" pills.
  const { data: myInventory } = useQuery<StoreInventoryItem[]>({
    queryKey: ['storeInventory'],
    queryFn: async () => {
      const res = await api.get('/api/v1/stores/me/items', { params: { limit: 200 } });
      return unwrapList<StoreInventoryItem>(res.data);
    },
  });
  const myCatalogIds = useMemo(
    () => new Set((myInventory ?? []).map((i) => i.catalogItemId)),
    [myInventory],
  );

  // Catalog browse / search
  const {
    data: catalogItems,
    isLoading,
    isError,
    refetch,
  } = useQuery<CatalogItemRow[]>({
    queryKey: ['catalog', debouncedSearch, category],
    queryFn: async () => {
      if (debouncedSearch.trim()) {
        const res = await api.get('/api/v1/catalog/search/q', {
          params: { q: debouncedSearch.trim() },
        });
        return unwrapList<CatalogItemRow>(res.data);
      }
      const res = await api.get('/api/v1/catalog', {
        params: {
          ...(category !== 'ALL' ? { category } : {}),
          page: 1,
          limit: 100,
        },
      });
      return unwrapList<CatalogItemRow>(res.data);
    },
    staleTime: 30_000,
  });

  // When searching, filter by category client-side (search ignores category param)
  const visible = useMemo(() => {
    if (!catalogItems) return [];
    if (category === 'ALL' || !debouncedSearch.trim()) return catalogItems;
    return catalogItems.filter((it) => it.category === category);
  }, [catalogItems, category, debouncedSearch]);

  const addMutation = useMutation({
    mutationFn: ({ catalogItemId, price, stockQty }: { catalogItemId: string; price: number; stockQty: number }) =>
      api
        .post('/api/v1/items', { catalogItemId, price, stockQty, isAvailable: true })
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storeInventory'] });
      setAddingItem(null);
      toast.success('Added to your store');
    },
    onError: (err: Error) => {
      const msg = err.message || 'Could not add item';
      if (msg.toLowerCase().includes('already')) {
        toast.error('This item is already in your store');
      } else {
        toast.error(msg);
      }
    },
  });

  return (
    <div className="page-shell space-y-5">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link href="/inventory" className="gap-1">
          <ArrowLeft className="h-4 w-4" />
          Back to inventory
        </Link>
      </Button>

      <header>
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Browse master catalog</h1>
        <p className="text-sm text-gray-500">
          Find items, set your price and add them to your store. Customers see your price and
          stock in real time.
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            type="search"
            placeholder="Search the catalog…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 sm:flex-wrap">
          {CATEGORY_FILTERS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value)}
              className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition ${
                category === c.value
                  ? 'border-primary bg-primary-100 text-primary-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-primary-200'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorPanel message="Couldn't load the catalog." onRetry={() => refetch()} />
      ) : visible.length === 0 ? (
        <EmptyPanel
          icon={<Search className="h-6 w-6" />}
          title={debouncedSearch ? 'No results' : 'No items in this category'}
          subtitle={
            debouncedSearch
              ? 'Try a different search term or category.'
              : 'Try a different category.'
          }
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((item) => {
            const added = myCatalogIds.has(item.id);
            const carry = item._count?.storeItems ?? 0;
            return (
              <li key={item.id}>
                <Card>
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary">
                      <Package className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900">{item.name}</p>
                      <p className="truncate text-xs text-gray-500">
                        {item.unit} · {item.category}
                      </p>
                      {carry > 0 ? (
                        <p className="mt-1 text-xs text-gray-400">
                          Carried by {carry} store{carry !== 1 ? 's' : ''}
                        </p>
                      ) : null}
                    </div>
                    {added ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Added
                      </span>
                    ) : (
                      <Button size="sm" onClick={() => setAddingItem(item)} className="gap-1">
                        <Plus className="h-4 w-4" /> Add
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <AddToStoreDialog
        item={addingItem}
        onClose={() => setAddingItem(null)}
        onSubmit={(price, stockQty) => {
          if (!addingItem) return;
          addMutation.mutate({ catalogItemId: addingItem.id, price, stockQty });
        }}
        submitting={addMutation.isPending}
      />
    </div>
  );
}

function AddToStoreDialog({
  item,
  onClose,
  onSubmit,
  submitting,
}: {
  item: CatalogItemRow | null;
  onClose: () => void;
  onSubmit: (price: number, stockQty: number) => void;
  submitting: boolean;
}) {
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');

  // Reset when a different item opens
  useEffect(() => {
    setPrice('');
    setStock('');
  }, [item?.id]);

  function submit() {
    const p = parseFloat(price);
    const s = parseInt(stock, 10);
    if (!Number.isFinite(p) || p <= 0) return toast.error('Enter a valid price');
    if (!Number.isFinite(s) || s < 0) return toast.error('Enter a valid stock quantity');
    onSubmit(p, s);
  }

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to your store</DialogTitle>
          <DialogDescription>
            {item ? `${item.name} · ${item.unit} · ${item.category}` : null}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700" htmlFor="add-price">
              Price (₹)
            </label>
            <Input
              id="add-price"
              type="number"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700" htmlFor="add-stock">
              Stock quantity
            </label>
            <Input
              id="add-stock"
              type="number"
              inputMode="numeric"
              placeholder="0"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} loading={submitting}>
            Add to store
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
