'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Download,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
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
import { ItemCategory, ItemCategoryLabels, type StoreInventoryItem } from '@aks/shared';
import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';
import { EmptyPanel, ErrorPanel } from '@/components/StatePanels';
import { api, unwrap } from '@/lib/api';
import { rupees } from '@/lib/format';

// Derived from the canonical @aks/shared enum so any new category (e.g.
// ELECTRONICS added on 2026-05-24) automatically shows up here. The earlier
// hardcoded list had DAIRY + PERSONAL_CARE which don't exist in the schema
// AND was missing MEDICINE/ELECTRONICS/OTHER → broken filter chips.
const CATEGORY_FILTERS: { label: string; value: string }[] = [
  { label: 'All', value: 'ALL' },
  ...Object.values(ItemCategory).map((v) => ({ label: ItemCategoryLabels[v], value: v })),
];

const STOCK_FILTERS = [
  { label: 'All', value: 'ALL' },
  { label: 'In stock', value: 'IN' },
  { label: 'Out of stock', value: 'OUT' },
] as const;
type StockFilter = (typeof STOCK_FILTERS)[number]['value'];

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
  const [stockFilter, setStockFilter] = useState<StockFilter>('ALL');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingItem, setEditingItem] = useState<StoreInventoryItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<StoreInventoryItem | null>(null);
  const [bulkPriceOpen, setBulkPriceOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const { data: items, isLoading, isError, refetch } = useMyInventory();

  const filtered = useMemo(() => {
    return (items ?? []).filter((item) => {
      const matchesSearch =
        search.trim() === '' || item.name.toLowerCase().includes(search.toLowerCase().trim());
      const matchesCategory = category === 'ALL' || item.category === category;
      const matchesStock =
        stockFilter === 'ALL' ||
        (stockFilter === 'IN' && item.stockQty > 0 && item.isAvailable) ||
        (stockFilter === 'OUT' && (item.stockQty === 0 || !item.isAvailable));
      return matchesSearch && matchesCategory && matchesStock;
    });
  }, [items, search, category, stockFilter]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((it) => selected.has(it.id));

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllFiltered() {
    if (allFilteredSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((it) => next.delete(it.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((it) => next.add(it.id));
        return next;
      });
    }
  }

  // Single-item OOS toggle — optimistic so it feels instant on slow networks.
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

  function exportCsv() {
    if (!items || items.length === 0) {
      toast.error('Nothing to export yet');
      return;
    }
    // Headers match what the bulk-import endpoint accepts so an exported
    // file can round-trip back in for batch edits.
    const header = ['catalogName', 'category', 'unit', 'price', 'stockQty', 'isAvailable'];
    const rows = items.map((it) => [
      it.name,
      it.category,
      it.unit,
      String(it.price),
      String(it.stockQty),
      String(it.isAvailable),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => csvEscape(cell)).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${items.length} rows`);
  }

  return (
    <div className="page-shell space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Inventory</h1>
          <p className="text-sm text-gray-500">
            {items?.length ?? 0} {items?.length === 1 ? 'item' : 'items'} listed
            {selected.size > 0 ? ` · ${selected.size} selected` : ''}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="gap-1">
            <Upload className="h-4 w-4" /> Import CSV
          </Button>
          <Button asChild size="sm">
            <Link href="/inventory/browse-catalog" className="gap-1">
              <Plus className="h-4 w-4" /> Browse catalog
            </Link>
          </Button>
        </div>
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {STOCK_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStockFilter(f.value)}
              className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition ${
                stockFilter === f.value
                  ? 'border-primary bg-primary-100 text-primary-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-primary-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {filtered.length > 0 ? (
          <button
            type="button"
            onClick={toggleSelectAllFiltered}
            className="text-xs font-semibold text-primary hover:text-primary-700"
          >
            {allFilteredSelected ? 'Clear selection' : `Select all ${filtered.length}`}
          </button>
        ) : null}
      </div>

      {/* Bulk action bar — appears when at least one row is selected */}
      {selected.size > 0 ? (
        <div className="sticky top-16 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 shadow-sm">
          <span className="text-sm font-semibold text-primary-700">
            {selected.size} selected
          </span>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setBulkPriceOpen(true)} className="gap-1">
              <Pencil className="h-4 w-4" /> Update prices
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelected(new Set())}
              className="gap-1"
            >
              <X className="h-4 w-4" /> Clear
            </Button>
          </div>
        </div>
      ) : null}

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
          title={
            search || stockFilter !== 'ALL' || category !== 'ALL'
              ? 'No items match these filters'
              : 'No products yet'
          }
          subtitle={
            search || stockFilter !== 'ALL' || category !== 'ALL'
              ? 'Try a different search term, category or stock filter.'
              : 'Browse the master catalog to add your first product.'
          }
          action={
            !(search || stockFilter !== 'ALL' || category !== 'ALL') ? (
              <Button asChild>
                <Link href="/inventory/browse-catalog">Browse catalog</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((item) => {
            const isSelected = selected.has(item.id);
            return (
              <li key={item.id}>
                <Card className={isSelected ? 'border-primary' : ''}>
                  <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-5">
                    {/* Bulk-select checkbox */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(item.id)}
                      aria-label={`Select ${item.name}`}
                      className="h-4 w-4 flex-shrink-0 cursor-pointer rounded border-gray-300 text-primary focus:ring-primary"
                    />

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
            );
          })}
        </ul>
      )}

      <EditItemDialog item={editingItem} onClose={() => setEditingItem(null)} />
      <ConfirmRemoveDialog
        item={deletingItem}
        onClose={() => setDeletingItem(null)}
        onConfirm={() => deletingItem && removeItem.mutate(deletingItem.id)}
        submitting={removeItem.isPending}
      />
      <BulkPriceDialog
        open={bulkPriceOpen}
        items={items ?? []}
        selectedIds={selected}
        onClose={() => setBulkPriceOpen(false)}
        onDone={() => {
          setBulkPriceOpen(false);
          setSelected(new Set());
        }}
      />
      <ImportCsvDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
      />
    </div>
  );
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
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

/**
 * Bulk price-update modal — applies one of two strategies across every
 * selected item:
 *   - SET: hard-set price to ₹X
 *   - DELTA_PCT: increase/decrease current price by X%
 *
 * There is no batch endpoint on the backend yet, so we fan out individual
 * PUT /items/:id requests in a `Promise.all` and report a summary. If we
 * ever add `PUT /items/bulk-update` we can swap this for a single call.
 */
function BulkPriceDialog({
  open,
  items,
  selectedIds,
  onClose,
  onDone,
}: {
  open: boolean;
  items: StoreInventoryItem[];
  selectedIds: Set<string>;
  onClose: () => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'SET' | 'DELTA_PCT'>('SET');
  const [value, setValue] = useState('');

  const targetItems = useMemo(
    () => items.filter((it) => selectedIds.has(it.id)),
    [items, selectedIds],
  );

  const bulk = useMutation({
    mutationFn: async () => {
      const v = parseFloat(value);
      if (!Number.isFinite(v)) throw new Error('Enter a valid number');
      if (mode === 'SET' && v <= 0) throw new Error('Price must be greater than zero');
      if (mode === 'DELTA_PCT' && v <= -100) throw new Error('Discount cannot be 100% or more');

      const results = await Promise.allSettled(
        targetItems.map((it) => {
          const nextPrice =
            mode === 'SET' ? v : Math.max(0.01, Number((it.price * (1 + v / 100)).toFixed(2)));
          return api.put(`/api/v1/items/${it.id}`, {
            price: nextPrice,
            stockQty: it.stockQty,
            isAvailable: it.isAvailable,
          });
        }),
      );
      const okCount = results.filter((r) => r.status === 'fulfilled').length;
      const failCount = results.length - okCount;
      return { okCount, failCount };
    },
    onSuccess: ({ okCount, failCount }) => {
      queryClient.invalidateQueries({ queryKey: ['storeInventory'] });
      if (failCount === 0) {
        toast.success(`Updated ${okCount} item${okCount === 1 ? '' : 's'}`);
      } else {
        toast.warning(`Updated ${okCount}, ${failCount} failed`);
      }
      setValue('');
      onDone();
    },
    onError: (err: Error) => toast.error(err.message || 'Bulk update failed'),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update prices for {targetItems.length} item{targetItems.length === 1 ? '' : 's'}</DialogTitle>
          <DialogDescription>
            Apply the same change to every selected item. Choose to set a new price or shift the
            current one by a percentage.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('SET')}
              className={`flex-1 rounded-md border px-3 py-2 text-sm font-semibold transition ${
                mode === 'SET'
                  ? 'border-primary bg-primary-50 text-primary-700'
                  : 'border-gray-200 bg-white text-gray-700'
              }`}
            >
              Set to ₹
            </button>
            <button
              type="button"
              onClick={() => setMode('DELTA_PCT')}
              className={`flex-1 rounded-md border px-3 py-2 text-sm font-semibold transition ${
                mode === 'DELTA_PCT'
                  ? 'border-primary bg-primary-50 text-primary-700'
                  : 'border-gray-200 bg-white text-gray-700'
              }`}
            >
              Change by %
            </button>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700" htmlFor="bulk-value">
              {mode === 'SET' ? 'New price (₹)' : 'Percentage change (e.g. 10 for +10%, -5 for −5%)'}
            </label>
            <Input
              id="bulk-value"
              type="number"
              step="0.01"
              inputMode="decimal"
              placeholder={mode === 'SET' ? '0.00' : '0'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
          </div>

          {targetItems.length <= 6 ? (
            <ul className="space-y-1 rounded-md bg-gray-50 p-3 text-xs text-gray-600">
              {targetItems.map((it) => (
                <li key={it.id} className="flex justify-between">
                  <span className="truncate">{it.name}</span>
                  <span className="font-mono">{rupees(it.price)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-500">
              Affects {targetItems.length} items. Pricing is applied per-item via PUT /items/:id.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={bulk.isPending}>
            Cancel
          </Button>
          <Button onClick={() => bulk.mutate()} loading={bulk.isPending}>
            Apply to {targetItems.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * CSV import via `POST /api/v1/items/bulk-import` (already exists on the
 * backend, see backend/src/routes/items.routes.ts). Headers expected:
 *   catalogName,price,stockQty,isAvailable
 * The exported CSV is a superset (also includes category + unit) and is
 * tolerated because the parser only looks at the columns it cares about.
 */
function ImportCsvDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    processed: number;
    upserted: number;
    parseErrors?: Array<{ line: number; error: string }>;
    upsertFailures?: Array<{ row: string; error: string }>;
  } | null>(null);

  function handleFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    file.text().then(setCsv).catch(() => toast.error('Could not read file'));
  }

  const importMutation = useMutation({
    mutationFn: () => api.post('/api/v1/items/bulk-import', { csv }).then((r) => r.data),
    onSuccess: (resp) => {
      const data = (resp?.data ?? resp) as {
        processed: number;
        upserted: number;
        parseErrors?: Array<{ line: number; error: string }>;
        upsertFailures?: Array<{ row: string; error: string }>;
      };
      setSummary(data);
      queryClient.invalidateQueries({ queryKey: ['storeInventory'] });
      if (data.upserted > 0) {
        toast.success(`Imported ${data.upserted} row${data.upserted === 1 ? '' : 's'}`);
      } else {
        toast.warning('No rows were imported');
      }
    },
    onError: (err: Error) => toast.error(err.message || 'Import failed'),
  });

  function reset() {
    setCsv('');
    setFileName(null);
    setSummary(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import inventory from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV with the header row{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
              catalogName,price,stockQty,isAvailable
            </code>
            . Existing items are updated, new ones are added.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => handleFile(e.target.files?.[0])}
            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-primary-700"
          />
          {fileName ? (
            <p className="text-xs text-gray-500">
              Loaded <span className="font-mono">{fileName}</span> ({csv.length.toLocaleString()}{' '}
              characters)
            </p>
          ) : null}

          {summary ? (
            <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
              <p>
                Processed <strong>{summary.processed}</strong> · Upserted{' '}
                <strong className="text-green-700">{summary.upserted}</strong>
              </p>
              {summary.parseErrors && summary.parseErrors.length > 0 ? (
                <details>
                  <summary className="cursor-pointer font-semibold text-red-700">
                    {summary.parseErrors.length} parse error
                    {summary.parseErrors.length === 1 ? '' : 's'}
                  </summary>
                  <ul className="mt-1 space-y-0.5 pl-4">
                    {summary.parseErrors.slice(0, 10).map((e) => (
                      <li key={e.line}>
                        Line {e.line}: {e.error}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {summary.upsertFailures && summary.upsertFailures.length > 0 ? (
                <details>
                  <summary className="cursor-pointer font-semibold text-amber-700">
                    {summary.upsertFailures.length} row
                    {summary.upsertFailures.length === 1 ? '' : 's'} skipped
                  </summary>
                  <ul className="mt-1 space-y-0.5 pl-4">
                    {summary.upsertFailures.slice(0, 10).map((e) => (
                      <li key={e.row}>
                        {e.row}: {e.error}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={importMutation.isPending}>
            {summary ? 'Done' : 'Cancel'}
          </Button>
          {!summary ? (
            <Button
              onClick={() => importMutation.mutate()}
              loading={importMutation.isPending}
              disabled={!csv.trim()}
            >
              Import
            </Button>
          ) : (
            <Button onClick={reset}>Import another file</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
