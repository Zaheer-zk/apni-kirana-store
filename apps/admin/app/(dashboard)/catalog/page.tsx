'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Loader2,
  X,
  ChevronLeft,
  ChevronRight,
  Package,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import DataTable, { Column } from '@/components/DataTable';
import { ItemCategory } from '@aks/shared';

interface CatalogItem {
  id: string;
  name: string;
  description: string | null;
  category: ItemCategory;
  defaultUnit: string;
  imageUrl: string | null;
  isActive: boolean;
  _count?: { storeItems: number };
  createdAt?: string;
  updatedAt?: string;
}

interface CatalogResponse {
  items: CatalogItem[];
  total: number;
  page: number;
  pages: number;
}

interface CatalogFormState {
  name: string;
  description: string;
  category: ItemCategory;
  defaultUnit: string;
  imageUrl: string;
  isActive: boolean;
}

const CATEGORY_OPTIONS: { value: ItemCategory | ''; label: string }[] = [
  { value: '', label: 'All categories' },
  { value: ItemCategory.GROCERY, label: 'Grocery' },
  { value: ItemCategory.MEDICINE, label: 'Medicine' },
  { value: ItemCategory.HOUSEHOLD, label: 'Household' },
  { value: ItemCategory.SNACKS, label: 'Snacks' },
  { value: ItemCategory.BEVERAGES, label: 'Beverages' },
  { value: ItemCategory.OTHER, label: 'Other' },
];

const CATEGORY_FORM_OPTIONS = CATEGORY_OPTIONS.filter((c) => c.value !== '');

const CATEGORY_EMOJI: Record<ItemCategory, string> = {
  [ItemCategory.GROCERY]: '🥬',
  [ItemCategory.MEDICINE]: '💊',
  [ItemCategory.HOUSEHOLD]: '🧴',
  [ItemCategory.SNACKS]: '🍪',
  [ItemCategory.BEVERAGES]: '🥤',
  [ItemCategory.OTHER]: '📦',
};

const CATEGORY_BADGE_CLASSES: Record<ItemCategory, string> = {
  [ItemCategory.GROCERY]: 'bg-green-50 text-green-700 border-green-200',
  [ItemCategory.MEDICINE]: 'bg-red-50 text-red-700 border-red-200',
  [ItemCategory.HOUSEHOLD]: 'bg-blue-50 text-blue-700 border-blue-200',
  [ItemCategory.SNACKS]: 'bg-amber-50 text-amber-700 border-amber-200',
  [ItemCategory.BEVERAGES]: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  [ItemCategory.OTHER]: 'bg-gray-100 text-gray-600 border-gray-200',
};

function CategoryBadge({ category }: { category: ItemCategory }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${CATEGORY_BADGE_CLASSES[category] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}
    >
      {category.charAt(0) + category.slice(1).toLowerCase()}
    </span>
  );
}

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

interface ToastState {
  id: number;
  type: 'success' | 'error';
  message: string;
}

const PAGE_SIZE = 20;

const EMPTY_FORM: CatalogFormState = {
  name: '',
  description: '',
  category: ItemCategory.GROCERY,
  defaultUnit: '',
  imageUrl: '',
  isActive: true,
};

export default function CatalogPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ItemCategory | ''>('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounced(search, 300);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [form, setForm] = useState<CatalogFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const [toast, setToast] = useState<ToastState | null>(null);

  const queryClient = useQueryClient();

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, category]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const queryKey = ['admin-catalog', debouncedSearch, category, page] as const;

  const { data, isLoading, isError } = useQuery<CatalogResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('q', debouncedSearch);
      if (category) params.set('category', category);
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      const res = await api.get<{ success: boolean; data: CatalogResponse }>(
        `/api/v1/catalog?${params.toString()}`
      );
      return res.data.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: CatalogFormState) => {
      const res = await api.post<{ success: boolean; data: CatalogItem }>(
        '/api/v1/catalog',
        sanitizePayload(payload)
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-catalog'] });
      setToast({ id: Date.now(), type: 'success', message: 'Catalog item created.' });
      closeModal();
    },
    onError: (err: unknown) => handleMutationError(err, 'create'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: CatalogFormState }) => {
      const res = await api.put<{ success: boolean; data: CatalogItem }>(
        `/api/v1/catalog/${id}`,
        sanitizePayload(payload)
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-catalog'] });
      setToast({ id: Date.now(), type: 'success', message: 'Catalog item updated.' });
      closeModal();
    },
    onError: (err: unknown) => handleMutationError(err, 'update'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/v1/catalog/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-catalog'] });
      setToast({ id: Date.now(), type: 'success', message: 'Catalog item deleted.' });
    },
    onError: () => {
      setToast({ id: Date.now(), type: 'error', message: 'Failed to delete catalog item.' });
    },
  });

  function handleMutationError(err: unknown, kind: 'create' | 'update') {
    const e = err as { response?: { status?: number; data?: { error?: { message?: string } } } };
    const status = e?.response?.status;
    const message = e?.response?.data?.error?.message;
    if (status === 409) {
      setFormError(message ?? 'A catalog item with this name already exists.');
      return;
    }
    setFormError(message ?? `Failed to ${kind} catalog item.`);
  }

  function sanitizePayload(payload: CatalogFormState) {
    return {
      name: payload.name.trim(),
      description: payload.description.trim() || undefined,
      category: payload.category,
      defaultUnit: payload.defaultUnit.trim(),
      imageUrl: payload.imageUrl.trim() || undefined,
      isActive: payload.isActive,
    };
  }

  function openCreateModal() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(item: CatalogItem) {
    setEditing(item);
    setForm({
      name: item.name,
      description: item.description ?? '',
      category: item.category,
      defaultUnit: item.defaultUnit,
      imageUrl: item.imageUrl ?? '',
      isActive: item.isActive,
    });
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setFormError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!form.name.trim()) {
      setFormError('Name is required.');
      return;
    }
    if (!form.defaultUnit.trim()) {
      setFormError('Default unit is required.');
      return;
    }

    if (editing) {
      updateMutation.mutate({ id: editing.id, payload: form });
    } else {
      createMutation.mutate(form);
    }
  }

  function handleDelete(item: CatalogItem) {
    const confirmed = window.confirm(
      `Delete "${item.name}" from the catalog? This cannot be undone.`
    );
    if (!confirmed) return;
    deleteMutation.mutate(item.id);
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  const columns: Column<CatalogItem>[] = useMemo(
    () => [
      {
        key: 'image',
        header: '',
        render: (item) => (
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-gray-100 text-lg">
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.imageUrl}
                alt={item.name}
                className="h-10 w-10 object-cover"
              />
            ) : (
              <span aria-hidden>{CATEGORY_EMOJI[item.category] ?? '📦'}</span>
            )}
          </div>
        ),
      },
      {
        key: 'name',
        header: 'Name',
        render: (item) => (
          <div>
            <p className="font-medium text-gray-900">{item.name}</p>
            {item.description && (
              <p className="mt-0.5 max-w-xs truncate text-xs text-gray-400">
                {item.description}
              </p>
            )}
          </div>
        ),
      },
      {
        key: 'category',
        header: 'Category',
        render: (item) => <CategoryBadge category={item.category} />,
      },
      {
        key: 'defaultUnit',
        header: 'Default Unit',
        render: (item) => <span className="text-gray-700">{item.defaultUnit}</span>,
      },
      {
        key: 'stores',
        header: 'Carried By',
        render: (item) => (
          <span className="text-gray-700">
            {item._count?.storeItems ?? 0} {(item._count?.storeItems ?? 0) === 1 ? 'store' : 'stores'}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (item) => (
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
              item.isActive
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-gray-100 text-gray-500 border-gray-200'
            }`}
          >
            {item.isActive ? 'Active' : 'Inactive'}
          </span>
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        render: (item) => (
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                openEditModal(item);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(item);
              }}
              disabled={deleteMutation.isPending}
              className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Delete
            </button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deleteMutation.isPending]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catalog</h1>
          <p className="mt-1 text-sm text-gray-500">
            Master catalog of items shared across all stores
            {!isLoading && ` • ${total.toLocaleString('en-IN')} ${total === 1 ? 'item' : 'items'}`}
          </p>
        </div>
        <button onClick={openCreateModal} className="btn-primary">
          <Plus className="mr-1.5 h-4 w-4" />
          Add catalog item
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9"
            />
          </div>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ItemCategory | '')}
            className="input w-48"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {(search || category) && (
            <button
              onClick={() => {
                setSearch('');
                setCategory('');
              }}
              className="text-sm text-gray-400 underline hover:text-gray-700"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <DataTable
          columns={columns}
          rows={items}
          isLoading={isLoading}
          isError={isError}
          emptyMessage="No catalog items found. Click 'Add catalog item' to create one."
        />

        {/* Pagination */}
        {!isLoading && !isError && total > 0 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3 text-sm text-gray-500">
            <p>
              Page <span className="font-medium text-gray-900">{page}</span> of{' '}
              <span className="font-medium text-gray-900">{pages}</span> •{' '}
              {total.toLocaleString('en-IN')} total
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/50 p-4 sm:items-center">
          <div className="card w-full max-w-lg p-6">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-gray-900">
                  {editing ? 'Edit catalog item' : 'Add catalog item'}
                </h2>
              </div>
              <button
                onClick={closeModal}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  maxLength={120}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Description
                </label>
                <textarea
                  className="input min-h-[72px]"
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  maxLength={500}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    className="input"
                    value={form.category}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, category: e.target.value as ItemCategory }))
                    }
                  >
                    {CATEGORY_FORM_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Default unit <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. kg, L, pcs"
                    value={form.defaultUnit}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, defaultUnit: e.target.value }))
                    }
                    required
                    maxLength={20}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Image URL
                </label>
                <input
                  type="url"
                  className="input"
                  placeholder="https://…"
                  value={form.imageUrl}
                  onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  checked={form.isActive}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, isActive: e.target.checked }))
                  }
                />
                Active (visible to stores when adding inventory)
              </label>

              {formError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="btn-secondary"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  )}
                  {editing ? 'Save changes' : 'Create item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <div
            className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg ${
              toast.type === 'success'
                ? 'border-green-200 bg-white text-green-800'
                : 'border-red-200 bg-white text-red-800'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 text-red-600" />
            )}
            <span>{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="ml-2 text-gray-400 hover:text-gray-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
