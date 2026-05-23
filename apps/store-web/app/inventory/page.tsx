'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Package,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Input } from '@aks/ui/components/input';
import { Card, CardContent } from '@aks/ui/components/card';
import { Skeleton } from '@aks/ui/components/skeleton';
import { Badge } from '@aks/ui/components/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@aks/ui/components/dialog';
import { toast } from '@aks/ui/components/sonner';
import type { StoreInventoryItem } from '@aks/shared';
import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';
import { EmptyPanel, ErrorPanel } from '@/components/StatePanels';
import { api, unwrap } from '@/lib/api';
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

/**
 * `useMyInventory` — hits `/api/v1/stores/me/items` so we don't need the
 * store id client-side. Mirrors `apps/store-portal/app/(tabs)/inventory.tsx`
 * `useMyInventory()` so the two surfaces share a cache shape.
 */
function useMyInventory() {
  return useQuery<StoreInventoryItem[]>({
    queryKey: ['storeInventory'],
    queryFn: async () => {
      const res = await api.get('/api/v1/stores/me/items', { params: { limit: 200 } });
      const payload = unwrap<{ items?: StoreInventoryItem[] } | StoreInventoryItem[]>(res.data);
      if (Array.isArray(payload)) return payload;
      return payload?.items ?? [];
    },
  });
}

export default function InventoryPage() {
  return (
    <AuthGuard>
      <AppShell>
        <InventoryInner />
      </AppShell>
    </AuthGuard>
  );
}

function InventoryInner() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('ALL');
  const [editingItem, setEditingItem] = useState<StoreInventoryItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<StoreInventoryItem | null>(null);

  const { data: items, isLoading, isError, refetch } = useMyInventory();

  const filtered = useMemo(() => {
    return (items ?? []).filter((item) => {
      const matchesSearch =
        search.trim() === '' || item.name.toLowerCase().includes(search.toLowerCase().trim());
      const matchesCategory = category === 'ALL' || item.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [items, search, category]);

  const toggleAvailability = useMutation({
    mutationFn: ({ id }: { id: string; isAvailable: boolean }) =>
      api.put(`/api/v1/items/${id}/toggle-availability`).then((r) => r.data),
    onMutate: async ({ id, isAvailable }) => {
      await queryClient.cancelQueries({ queryKey: ['storeInventory'] });
      const previous = queryClient.getQueryData<StoreInventoryItem[]>(['storeInventory']);
      queryClient.setQueryData<StoreInventoryItem[]>(['storeInventory'], (old) =>
        (old ?? []).map((it) => (it.id === id ? { ...it, isAvailable } : it)),
      );
      return { previous };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['storeInventory'], ctx.previous);
      toast.error(err.message || 'Could not update availability');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['storeInventory'] }),
  });

  const removeItem = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/items/${id}`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storeInventory'] });
      toast.success('Removed from your store');
      setDeletingItem(null);
    },
    onError: (err: Error) => toast.error(err.message || 'Could not remove item'),
  });

  return (
    <div className="page-shell space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Inventory</h1>
          <p className="text-sm text-gray-500">
            {items?.length ?? 0} {items?.length === 1 ? 'item' : 'items'} listed.
          </p>
        </div>
        <Button asChild>
          <Link href="/inventory/browse-catalog" className="gap-1">
            <Plus className="h-4 w-4" /> Browse catalog
          </Link>
        </Button>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            type="search"
            placeholder="Search your inventory…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
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
        <ErrorPanel message="Couldn't load your inventory." onRetry={() => refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyPanel
          icon={<Package className="h-6 w-6" />}
          title={search ? 'No items match your search' : 'No products yet'}
          subtitle={
            search
              ? 'Try a different search term or category.'
              : 'Browse the master catalog to add your first product.'
          }
          action={
            !search ? (
              <Button asChild>
                <Link href="/inventory/browse-catalog">Browse catalog</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        // Cards on phones, table-style rows on tablets+
        <ul className="space-y-3">
          {filtered.map((item) => (
            <li key={item.id}>
              <Card>
                <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-5">
                  <div className="flex flex-1 items-center gap-3 sm:min-w-0">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary">
                      <Package className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900">{item.name}</p>
                      <p className="truncate text-xs text-gray-500">
                        {item.unit} · {item.category}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 text-sm">
                    <div>
                      <p className="text-xs uppercase text-gray-400">Price</p>
                      <p className="font-semibold text-gray-900">{rupees(item.price)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-gray-400">Stock</p>
                      {item.stockQty === 0 ? (
                        <Badge variant="destructive">Out</Badge>
                      ) : (
                        <p className="font-semibold text-gray-900">{item.stockQty}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs uppercase text-gray-400">Available</p>
                      <Toggle
                        on={item.isAvailable}
                        onChange={(next) =>
                          toggleAvailability.mutate({ id: item.id, isAvailable: next })
                        }
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 sm:ml-auto">
                    <Button variant="outline" size="sm" onClick={() => setEditingItem(item)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => setDeletingItem(item)}
                      aria-label={`Remove ${item.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <EditItemDialog item={editingItem} onClose={() => setEditingItem(null)} />
      <ConfirmRemoveDialog
        item={deletingItem}
        onClose={() => setDeletingItem(null)}
        onConfirm={() => deletingItem && removeItem.mutate(deletingItem.id)}
        submitting={removeItem.isPending}
      />
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        on ? 'bg-primary' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          on ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function EditItemDialog({
  item,
  onClose,
}: {
  item: StoreInventoryItem | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [price, setPrice] = useState<string>(item ? String(item.price) : '');
  const [stock, setStock] = useState<string>(item ? String(item.stockQty) : '');

  // Reset inputs whenever a new item opens (Dialog stays mounted)
  if (item && (price === '' || stock === '')) {
    if (price === '') setPrice(String(item.price));
    if (stock === '') setStock(String(item.stockQty));
  }

  const update = useMutation({
    mutationFn: () => {
      if (!item) throw new Error('No item');
      return api
        .put(`/api/v1/items/${item.id}`, {
          price: parseFloat(price),
          stockQty: parseInt(stock, 10),
          isAvailable: item.isAvailable,
        })
        .then((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storeInventory'] });
      toast.success('Item updated');
      handleClose();
    },
    onError: (err: Error) => toast.error(err.message || 'Could not save changes'),
  });

  function handleClose() {
    setPrice('');
    setStock('');
    onClose();
  }

  function submit() {
    const p = parseFloat(price);
    const s = parseInt(stock, 10);
    if (!Number.isFinite(p) || p <= 0) return toast.error('Enter a valid price');
    if (!Number.isFinite(s) || s < 0) return toast.error('Enter a valid stock quantity');
    update.mutate();
  }

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit item</DialogTitle>
          <DialogDescription>
            {item ? `${item.name} · ${item.unit}` : null}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700" htmlFor="price">
              Price (₹)
            </label>
            <Input
              id="price"
              type="number"
              step="0.01"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700" htmlFor="stock">
              Stock quantity
            </label>
            <Input
              id="stock"
              type="number"
              inputMode="numeric"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={update.isPending}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmRemoveDialog({
  item,
  onClose,
  onConfirm,
  submitting,
}: {
  item: StoreInventoryItem | null;
  onClose: () => void;
  onConfirm: () => void;
  submitting: boolean;
}) {
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove from your store?</DialogTitle>
          <DialogDescription>
            {item ? `"${item.name}" will no longer appear in customer search results.` : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} loading={submitting}>
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
