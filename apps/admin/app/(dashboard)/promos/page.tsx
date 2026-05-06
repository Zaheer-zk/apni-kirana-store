'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  X,
  Ticket,
  CheckCircle2,
  AlertCircle,
  Pause,
  Play,
} from 'lucide-react';
import { api } from '@/lib/api';
import DataTable, { Column } from '@/components/DataTable';

type DiscountType = 'FLAT' | 'PERCENT';

interface Promo {
  id: string;
  code: string;
  description: string | null;
  discountType: DiscountType;
  discountValue: number;
  maxDiscount: number | null;
  minOrderValue: number | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  usedCount: number;
  validFrom: string;
  validUntil: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PromoFormState {
  code: string;
  description: string;
  discountType: DiscountType;
  discountValue: string;
  maxDiscount: string;
  minOrderValue: string;
  usageLimit: string;
  perUserLimit: string;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
}

type FilterValue = 'all' | 'active' | 'inactive';

interface ToastState {
  id: number;
  type: 'success' | 'error';
  message: string;
}

const FILTER_OPTIONS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

function toLocalDateTimeInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nowLocalDateTimeInput(): string {
  return toLocalDateTimeInput(new Date().toISOString());
}

function emptyForm(): PromoFormState {
  return {
    code: '',
    description: '',
    discountType: 'PERCENT',
    discountValue: '',
    maxDiscount: '',
    minOrderValue: '',
    usageLimit: '',
    perUserLimit: '',
    validFrom: nowLocalDateTimeInput(),
    validUntil: '',
    isActive: true,
  };
}

function formatDiscount(p: Promo): string {
  if (p.discountType === 'PERCENT') {
    const max = p.maxDiscount != null ? ` (max ₹${p.maxDiscount.toLocaleString('en-IN')})` : '';
    return `${p.discountValue}% off${max}`;
  }
  return `₹${p.discountValue.toLocaleString('en-IN')} off`;
}

function formatValidity(p: Promo): string {
  if (!p.validUntil) return 'No expiry';
  const d = new Date(p.validUntil);
  if (Number.isNaN(d.getTime())) return 'No expiry';
  return `Valid until ${d.toISOString().slice(0, 10)}`;
}

export default function PromosPage() {
  const [filter, setFilter] = useState<FilterValue>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Promo | null>(null);
  const [form, setForm] = useState<PromoFormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);

  const [toast, setToast] = useState<ToastState | null>(null);

  const queryClient = useQueryClient();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const queryKey = ['admin-promos', filter] as const;

  const { data, isLoading, isError } = useQuery<Promo[]>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter === 'active') params.set('isActive', 'true');
      if (filter === 'inactive') params.set('isActive', 'false');
      const qs = params.toString();
      const res = await api.get<{ success: boolean; data: Promo[] }>(
        `/api/v1/promos${qs ? `?${qs}` : ''}`
      );
      return res.data.data ?? [];
    },
  });

  function invalidatePromos() {
    queryClient.invalidateQueries({ queryKey: ['admin-promos'] });
  }

  const createMutation = useMutation({
    mutationFn: async (payload: PromoFormState) => {
      const res = await api.post<{ success: boolean; data: Promo }>(
        '/api/v1/promos',
        sanitizePayload(payload)
      );
      return res.data.data;
    },
    onSuccess: () => {
      invalidatePromos();
      setToast({ id: Date.now(), type: 'success', message: 'Promo created.' });
      closeModal();
    },
    onError: (err: unknown) => handleMutationError(err, 'create'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: PromoFormState }) => {
      const res = await api.put<{ success: boolean; data: Promo }>(
        `/api/v1/promos/${id}`,
        sanitizePayload(payload)
      );
      return res.data.data;
    },
    onSuccess: () => {
      invalidatePromos();
      setToast({ id: Date.now(), type: 'success', message: 'Promo updated.' });
      closeModal();
    },
    onError: (err: unknown) => handleMutationError(err, 'update'),
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.put<{ success: boolean; data: Promo }>(
        `/api/v1/promos/${id}/toggle`
      );
      return res.data.data;
    },
    onSuccess: (promo) => {
      invalidatePromos();
      setToast({
        id: Date.now(),
        type: 'success',
        message: `Promo ${promo?.isActive ? 'resumed' : 'paused'}.`,
      });
    },
    onError: () => {
      setToast({ id: Date.now(), type: 'error', message: 'Failed to toggle promo.' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/v1/promos/${id}`);
    },
    onSuccess: () => {
      invalidatePromos();
      setToast({ id: Date.now(), type: 'success', message: 'Promo deleted.' });
    },
    onError: () => {
      setToast({ id: Date.now(), type: 'error', message: 'Failed to delete promo.' });
    },
  });

  function handleMutationError(err: unknown, kind: 'create' | 'update') {
    const e = err as {
      response?: { status?: number; data?: { error?: { message?: string } } };
    };
    const status = e?.response?.status;
    const message = e?.response?.data?.error?.message;
    if (status === 409) {
      setFormError(message ?? 'Code already exists');
      return;
    }
    setFormError(message ?? `Failed to ${kind} promo.`);
  }

  function sanitizePayload(payload: PromoFormState) {
    const body: Record<string, unknown> = {
      code: payload.code.trim().toUpperCase(),
      discountType: payload.discountType,
      discountValue: Number(payload.discountValue),
      isActive: payload.isActive,
    };

    const description = payload.description.trim();
    if (description) body.description = description;

    if (payload.discountType === 'PERCENT' && payload.maxDiscount.trim() !== '') {
      body.maxDiscount = Number(payload.maxDiscount);
    }

    if (payload.minOrderValue.trim() !== '') {
      body.minOrderValue = Number(payload.minOrderValue);
    }
    if (payload.usageLimit.trim() !== '') {
      body.usageLimit = Number(payload.usageLimit);
    }
    if (payload.perUserLimit.trim() !== '') {
      body.perUserLimit = Number(payload.perUserLimit);
    }

    if (payload.validFrom) {
      body.validFrom = new Date(payload.validFrom).toISOString();
    }
    if (payload.validUntil) {
      body.validUntil = new Date(payload.validUntil).toISOString();
    }

    return body;
  }

  function openCreateModal() {
    setEditing(null);
    setForm(emptyForm());
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(p: Promo) {
    setEditing(p);
    setForm({
      code: p.code,
      description: p.description ?? '',
      discountType: p.discountType,
      discountValue: String(p.discountValue),
      maxDiscount: p.maxDiscount != null ? String(p.maxDiscount) : '',
      minOrderValue: p.minOrderValue != null ? String(p.minOrderValue) : '',
      usageLimit: p.usageLimit != null ? String(p.usageLimit) : '',
      perUserLimit: p.perUserLimit != null ? String(p.perUserLimit) : '',
      validFrom: toLocalDateTimeInput(p.validFrom),
      validUntil: toLocalDateTimeInput(p.validUntil),
      isActive: p.isActive,
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

    if (!form.code.trim()) {
      setFormError('Code is required.');
      return;
    }
    if (form.discountValue.trim() === '' || Number.isNaN(Number(form.discountValue))) {
      setFormError('Discount value is required.');
      return;
    }
    if (Number(form.discountValue) <= 0) {
      setFormError('Discount value must be greater than zero.');
      return;
    }
    if (form.discountType === 'PERCENT' && Number(form.discountValue) > 100) {
      setFormError('Percent discount cannot exceed 100.');
      return;
    }

    if (editing) {
      updateMutation.mutate({ id: editing.id, payload: form });
    } else {
      createMutation.mutate(form);
    }
  }

  function handleToggle(p: Promo) {
    toggleMutation.mutate(p.id);
  }

  function handleDelete(p: Promo) {
    const confirmed = window.confirm(
      `Delete promo "${p.code}"? This cannot be undone.`
    );
    if (!confirmed) return;
    deleteMutation.mutate(p.id);
  }

  const promos = data ?? [];
  const total = promos.length;

  const columns: Column<Promo>[] = useMemo(
    () => [
      {
        key: 'code',
        header: 'Code',
        render: (p) => (
          <span className="inline-flex items-center rounded-md border border-primary-200 bg-primary-50 px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-wider text-primary">
            {p.code}
          </span>
        ),
      },
      {
        key: 'description',
        header: 'Description',
        render: (p) => (
          <p className="max-w-xs truncate text-sm text-gray-700">
            {p.description ?? <span className="text-gray-400">—</span>}
          </p>
        ),
      },
      {
        key: 'discount',
        header: 'Discount',
        render: (p) => <span className="text-gray-900">{formatDiscount(p)}</span>,
      },
      {
        key: 'minOrder',
        header: 'Min Order',
        render: (p) => (
          <span className="text-gray-700">
            {p.minOrderValue != null
              ? `₹${p.minOrderValue.toLocaleString('en-IN')}`
              : '—'}
          </span>
        ),
      },
      {
        key: 'used',
        header: 'Used / Limit',
        render: (p) => (
          <span className="font-medium text-gray-900 tabular-nums">
            {p.usedCount} / {p.usageLimit != null ? p.usageLimit : '∞'}
          </span>
        ),
      },
      {
        key: 'validity',
        header: 'Validity',
        render: (p) => <span className="text-xs text-gray-500">{formatValidity(p)}</span>,
      },
      {
        key: 'status',
        header: 'Status',
        render: (p) => (
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
              p.isActive
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-gray-100 text-gray-500 border-gray-200'
            }`}
          >
            {p.isActive ? 'Active' : 'Inactive'}
          </span>
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        render: (p) => (
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleToggle(p);
              }}
              disabled={toggleMutation.isPending}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              title={p.isActive ? 'Pause' : 'Resume'}
            >
              {p.isActive ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {p.isActive ? 'Pause' : 'Resume'}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                openEditModal(p);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(p);
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
    [toggleMutation.isPending, deleteMutation.isPending]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Promo Codes</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage discount codes available to customers
            {!isLoading &&
              ` • ${total.toLocaleString('en-IN')} ${total === 1 ? 'promo' : 'promos'}`}
          </p>
        </div>
        <button onClick={openCreateModal} className="btn-primary">
          <Plus className="mr-1.5 h-4 w-4" />
          Create promo
        </button>
      </div>

      {/* Filter chips */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          {FILTER_OPTIONS.map((opt) => {
            const active = filter === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'border-primary bg-primary text-white'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <DataTable
          columns={columns}
          rows={promos}
          isLoading={isLoading}
          isError={isError}
          emptyMessage="No promo codes found. Click 'Create promo' to add one."
        />
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center overflow-y-auto bg-gray-900/50 sm:items-center sm:p-4">
          <div className="card flex w-full max-w-2xl flex-col rounded-none p-4 sm:rounded-lg sm:p-6">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Ticket className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-gray-900">
                  {editing ? 'Edit promo' : 'Create promo'}
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className="input font-mono uppercase"
                    value={form.code}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))
                    }
                    required
                    maxLength={32}
                    placeholder="SAVE10"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Description
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={form.description}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, description: e.target.value }))
                    }
                    maxLength={200}
                    placeholder="e.g. Welcome 10% off"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Discount type <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="radio"
                      name="discountType"
                      value="PERCENT"
                      checked={form.discountType === 'PERCENT'}
                      onChange={() =>
                        setForm((f) => ({ ...f, discountType: 'PERCENT' }))
                      }
                      className="h-4 w-4 border-gray-300 text-primary focus:ring-primary"
                    />
                    Percent
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="radio"
                      name="discountType"
                      value="FLAT"
                      checked={form.discountType === 'FLAT'}
                      onChange={() =>
                        setForm((f) => ({ ...f, discountType: 'FLAT', maxDiscount: '' }))
                      }
                      className="h-4 w-4 border-gray-300 text-primary focus:ring-primary"
                    />
                    Flat
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Discount value <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="input pr-10"
                      value={form.discountValue}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, discountValue: e.target.value }))
                      }
                      required
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                      {form.discountType === 'PERCENT' ? '%' : '₹'}
                    </span>
                  </div>
                </div>

                {form.discountType === 'PERCENT' && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Max discount (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="input"
                      value={form.maxDiscount}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, maxDiscount: e.target.value }))
                      }
                      placeholder="Optional"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Min order value (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input"
                    value={form.minOrderValue}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, minOrderValue: e.target.value }))
                    }
                    placeholder="Optional"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Usage limit
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="input"
                    value={form.usageLimit}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, usageLimit: e.target.value }))
                    }
                    placeholder="Unlimited"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Per-user limit
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="input"
                    value={form.perUserLimit}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, perUserLimit: e.target.value }))
                    }
                    placeholder="Unlimited"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Valid from
                  </label>
                  <input
                    type="datetime-local"
                    className="input"
                    value={form.validFrom}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, validFrom: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Valid until
                  </label>
                  <input
                    type="datetime-local"
                    className="input"
                    value={form.validUntil}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, validUntil: e.target.value }))
                    }
                  />
                </div>
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
                Active (customers can apply this code)
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
                  {editing ? 'Save changes' : 'Create promo'}
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
