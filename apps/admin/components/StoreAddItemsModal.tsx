'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Plus, Search, X } from 'lucide-react';
import { api } from '@/lib/api';

// Admin pre-stocks a store's inventory by picking catalog items + setting
// per-item prices. Designed for onboarding non-technical store owners who
// don't want to use the store-portal app. Posts a single bulk request to
// POST /admin/stores/:id/items/bulk — backend skips items the store
// already carries (idempotent).

interface CatalogItem {
  id: string;
  name: string;
  category: string;
  defaultUnit: string;
}

interface Props {
  storeId: string;
  storeName: string;
  onClose: () => void;
}

interface DraftItem {
  catalogItemId: string;
  name: string;
  unit: string;
  price: string; // string so user can clear the field
  stockQty: string;
}

function unwrap<T>(res: { data: { success?: boolean; data?: T } }): T {
  return (res.data?.data ?? (res.data as unknown as T)) as T;
}

export default function StoreAddItemsModal({ storeId, storeName, onClose }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Map<string, DraftItem>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const catalog = useQuery({
    queryKey: ['admin-catalog', search],
    queryFn: async () =>
      unwrap<CatalogItem[]>(
        await api.get('/api/v1/catalog', { params: { search: search || undefined, limit: 100 } }),
      ),
    staleTime: 30_000,
  });

  function toggle(item: CatalogItem) {
    const next = new Map(drafts);
    if (next.has(item.id)) {
      next.delete(item.id);
    } else {
      next.set(item.id, {
        catalogItemId: item.id,
        name: item.name,
        unit: item.defaultUnit,
        price: '',
        stockQty: '0',
      });
    }
    setDrafts(next);
  }

  function updateDraft(id: string, patch: Partial<DraftItem>) {
    const next = new Map(drafts);
    const cur = next.get(id);
    if (!cur) return;
    next.set(id, { ...cur, ...patch });
    setDrafts(next);
  }

  const save = useMutation({
    mutationFn: async () => {
      const items = [...drafts.values()].map((d) => ({
        catalogItemId: d.catalogItemId,
        price: Number(d.price),
        stockQty: Number(d.stockQty) || 0,
      }));
      if (items.length === 0) throw new Error('Pick at least one item');
      for (const it of items) {
        if (!Number.isFinite(it.price) || it.price <= 0) {
          throw new Error('Each item needs a positive price');
        }
      }
      return api.post(`/api/v1/admin/stores/${storeId}/items/bulk`, { items });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin-store', storeId] });
      const data = (res as { data?: { data?: { added?: number; skippedDuplicate?: number } } }).data
        ?.data;
      const added = data?.added ?? 0;
      const dupes = data?.skippedDuplicate ?? 0;
      setError(null);
      onClose();
      // Caller has no toast facility on the page — surface success via
      // a brief alert so admin sees what happened.
      if (typeof window !== 'undefined') {
        window.alert(
          `Added ${added} item(s). ${dupes ? `Skipped ${dupes} the store already had.` : ''}`,
        );
      }
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to add items'),
  });

  const filtered = useMemo(() => catalog.data ?? [], [catalog.data]);
  const draftList = useMemo(() => [...drafts.values()], [drafts]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 px-4 py-6 sm:items-center">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Pre-stock inventory</h2>
            <p className="text-xs text-gray-500">{storeName}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Catalog browser */}
        <div className="border-b border-gray-100 px-5 py-3">
          <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              type="search"
              placeholder="Search catalog (e.g. rice, soap)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
          </div>
        </div>

        <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[1fr_1fr]">
          {/* Left: catalog list */}
          <div className="overflow-y-auto border-b border-gray-100 lg:border-b-0 lg:border-r">
            {catalog.isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="p-6 text-center text-sm text-gray-400">No catalog items match.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {filtered.map((c) => {
                  const on = drafts.has(c.id);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => toggle(c)}
                        className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-gray-50 ${on ? 'bg-primary/5' : ''}`}
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-900">{c.name}</p>
                          <p className="text-[11px] text-gray-500">
                            {c.category} · {c.defaultUnit}
                          </p>
                        </div>
                        {on ? (
                          <Check className="h-4 w-4 text-primary" />
                        ) : (
                          <Plus className="h-4 w-4 text-gray-400" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Right: drafts (set price + stock) */}
          <div className="overflow-y-auto">
            {draftList.length === 0 ? (
              <p className="p-6 text-center text-sm text-gray-400">
                Pick items from the catalog on the left.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {draftList.map((d) => (
                  <li key={d.catalogItemId} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">{d.name}</p>
                        <p className="text-[11px] text-gray-500">{d.unit}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggle({ id: d.catalogItemId, name: d.name, category: '', defaultUnit: d.unit })}
                        className="text-xs text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="block text-[10px] uppercase tracking-wider text-gray-500">
                        Price ₹
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={d.price}
                          onChange={(e) => updateDraft(d.catalogItemId, { price: e.target.value })}
                          className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
                        />
                      </label>
                      <label className="block text-[10px] uppercase tracking-wider text-gray-500">
                        Stock
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={d.stockQty}
                          onChange={(e) => updateDraft(d.catalogItemId, { stockQty: e.target.value })}
                          className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
                        />
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {error ? (
          <div className="mx-5 mt-3 rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {error}
          </div>
        ) : null}

        <footer className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
          <span className="text-xs text-gray-500">{drafts.size} item(s) ready to add</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                save.mutate();
              }}
              disabled={save.isPending || drafts.size === 0}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Add items
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
