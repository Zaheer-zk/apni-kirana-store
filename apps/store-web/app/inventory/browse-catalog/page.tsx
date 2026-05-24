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
  Trash2,
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
import { rupees } from '@/lib/format';

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

interface PendingRow {
  catalogItemId: string;
  name: string;
  category: string;
  unit: string;
  price: string;
  stockQty: string;
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
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const debouncedSearch = useDebounced(search, 300);

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

  const visible = useMemo(() => {
    if (!catalogItems) return [];
    if (category === 'ALL' || !debouncedSearch.trim()) return catalogItems;
    return catalogItems.filter((it) => it.category === category);
  }, [catalogItems, category, debouncedSearch]);

  const pendingIds = useMemo(() => new Set(pending.map((p) => p.catalogItemId)), [pending]);

  function queueItem(item: CatalogItemRow) {
    if (pendingIds.has(item.id) || myCatalogIds.has(item.id)) return;
    setPending((prev) => [
      ...prev,
      {
        catalogItemId: item.id,
        name: item.name,
        category: item.category,
        unit: item.unit,
        price: '',
        stockQty: '',
      },
    ]);
  }

  function removeFromQueue(id: string) {
    setPending((prev) => prev.filter((p) => p.catalogItemId !== id));
  }

  function updateQueueField(id: string, field: 'price' | 'stockQty', value: string) {
    setPending((prev) =>
      prev.map((p) => (p.catalogItemId === id ? { ...p, [field]: value } : p)),
    );
  }

  // Single-item add (still useful when only one row needs to be added).
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

  // Bulk-add fan-out — there's no batched endpoint so we POST per row in
  // parallel via Promise.allSettled and report a summary.
  const bulkAdd = useMutation({
    mutationFn: async () => {
      // Validate all rows up-front so the user can fix mistakes in one pass.
      const rows = pending.map((p) => {
        const price = parseFloat(p.price);
        const stockQty = parseInt(p.stockQty, 10);
        if (!Number.isFinite(price) || price <= 0) {
          throw new Error(`Invalid price for ${p.name}`);
        }
        if (!Number.isFinite(stockQty) || stockQty < 0) {
          throw new Error(`Invalid stock for ${p.name}`);
        }
        return { catalogItemId: p.catalogItemId, price, stockQty, name: p.name };
      });
      const results = await Promise.allSettled(
        rows.map((r) =>
          api.post('/api/v1/items', {
            catalogItemId: r.catalogItemId,
            price: r.price,
            stockQty: r.stockQty,
            isAvailable: true,
          }),
        ),
      );
      const okCount = results.filter((r) => r.status === 'fulfilled').length;
      const failCount = results.length - okCount;
      return { okCount, failCount };
    },
    onSuccess: ({ okCount, failCount }) => {
      queryClient.invalidateQueries({ queryKey: ['storeInventory'] });
      if (failCount === 0) {
        toast.success(`Added ${okCount} item${okCount === 1 ? '' : 's'} to your store`);
      } else {
        toast.warning(`Added ${okCount}, ${failCount} failed (likely already in your store)`);
      }
      setPending([]);
      setBulkConfirmOpen(false);
    },
    onError: (err: Error) => toast.error(err.message || 'Bulk add failed'),
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
          Find items, set your price and add them to your store. Add several at once with the
          batch tray.
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

      {/* Catalog list */}
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
            const queued = pendingIds.has(item.id);
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
                    ) : queued ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeFromQueue(item.id)}
                        className="gap-1"
                      >
                        <Trash2 className="h-4 w-4" /> Remove
                      </Button>
                    ) : (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => queueItem(item)}
                          className="gap-1"
                        >
                          <Plus className="h-4 w-4" /> Queue
                        </Button>
                        <Button size="sm" onClick={() => setAddingItem(item)} className="gap-1">
                          Add now
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {/* Batch tray (sticky at the bottom on mobile, side-rail-ish on desktop) */}
      {pending.length > 0 ? (
        <div className="sticky bottom-4 z-30 rounded-xl border-2 border-primary bg-white p-4 shadow-lg sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-gray-900">
              Batch queue ({pending.length})
            </h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPending([])}>
                Clear
              </Button>
              <Button size="sm" onClick={() => setBulkConfirmOpen(true)}>
                Add all to store
              </Button>
            </div>
          </div>
          <ul className="space-y-2 max-h-72 overflow-y-auto">
            {pending.map((row) => (
              <li
                key={row.catalogItemId}
                className="flex flex-col gap-2 rounded-md border border-gray-200 p-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{row.name}</p>
                  <p className="text-xs text-gray-500">
                    {row.unit} · {row.category}
                  </p>
                </div>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  placeholder="Price (₹)"
                  value={row.price}
                  onChange={(e) => updateQueueField(row.catalogItemId, 'price', e.target.value)}
                  className="sm:w-32"
                  aria-label={`Price for ${row.name}`}
                />
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="Stock"
                  value={row.stockQty}
                  onChange={(e) => updateQueueField(row.catalogItemId, 'stockQty', e.target.value)}
                  className="sm:w-24"
                  aria-label={`Stock for ${row.name}`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeFromQueue(row.catalogItemId)}
                  className="text-gray-500 hover:text-red-700"
                  aria-label={`Remove ${row.name} from queue`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <AddToStoreDialog
        item={addingItem}
        onClose={() => setAddingItem(null)}
        onSubmit={(price, stockQty) => {
          if (!addingItem) return;
          addMutation.mutate({ catalogItemId: addingItem.id, price, stockQty });
        }}
        submitting={addMutation.isPending}
      />

      {/* Confirm + submit the entire queue. We don't reuse AddToStoreDialog
          because we want the operator to see the per-row prices before
          firing off the parallel POSTs. */}
      <Dialog open={bulkConfirmOpen} onOpenChange={(o) => !o && setBulkConfirmOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {pending.length} item{pending.length === 1 ? '' : 's'} to your store?</DialogTitle>
            <DialogDescription>
              We'll send one POST per row. Any rows you've left blank or with invalid prices will
              cause the batch to abort before any item is added.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-1 max-h-60 overflow-y-auto rounded-md bg-gray-50 p-3 text-xs">
            {pending.map((row) => {
              const price = parseFloat(row.price);
              const stockQty = parseInt(row.stockQty, 10);
              const ok = Number.isFinite(price) && price > 0 && Number.isFinite(stockQty) && stockQty >= 0;
              return (
                <li key={row.catalogItemId} className="flex justify-between">
                  <span className="truncate">{row.name}</span>
                  <span className={`font-mono ${ok ? 'text-gray-700' : 'text-red-600'}`}>
                    {ok ? `${rupees(price)} · ${stockQty}` : 'incomplete'}
                  </span>
                </li>
              );
            })}
          </ul>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkConfirmOpen(false)}
              disabled={bulkAdd.isPending}
            >
              Back
            </Button>
            <Button onClick={() => bulkAdd.mutate()} loading={bulkAdd.isPending}>
              Add all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
