'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CheckCircle2, Loader2, Search, X, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { ItemCategory } from '@aks/shared';

// Admin review queue for store-owner-submitted catalog requests.
// PENDING items get triage actions (approve → creates CatalogItem +
// links to store inventory; reject → records reviewNote). Already-actioned
// rows are shown read-only below for audit.

type Status = 'PENDING' | 'APPROVED' | 'REJECTED';

interface ReqRow {
  id: string;
  storeId: string;
  requestedBy: string;
  name: string;
  description: string | null;
  category: ItemCategory;
  defaultUnit: string;
  imageUrl: string | null;
  priceHint: number | null;
  status: Status;
  reviewNote: string | null;
  reviewedAt: string | null;
  catalogItemId: string | null;
  createdAt: string;
  store: { id: string; name: string; city: string } | null;
  requester: { id: string; name: string | null; phone: string | null } | null;
  catalogItem: { id: string; name: string; imageUrl: string | null } | null;
}

const STATUS_TABS: { value: Status; label: string; color: string }[] = [
  { value: 'PENDING', label: 'Pending', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'APPROVED', label: 'Approved', color: 'bg-green-50 text-green-700 border-green-200' },
  { value: 'REJECTED', label: 'Rejected', color: 'bg-red-50 text-red-700 border-red-200' },
];

export default function CatalogRequestsPage() {
  const [tab, setTab] = useState<Status>('PENDING');
  const [query, setQuery] = useState('');

  const { data, isLoading } = useQuery<ReqRow[]>({
    queryKey: ['catalogRequests', tab],
    queryFn: async () => {
      const res = await api.get('/api/v1/admin/catalog-requests', {
        params: { status: tab },
      });
      const payload = res.data?.data ?? res.data;
      return Array.isArray(payload) ? payload : (payload?.items ?? []);
    },
    refetchInterval: 30_000,
  });

  const rows = (data ?? []).filter((r) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      r.store?.name.toLowerCase().includes(q) ||
      r.requester?.phone?.includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Catalog item requests</h1>
        <p className="text-sm text-gray-600">
          Store owners submit new items here. Approve to create the catalog entry (auto-linked to
          their inventory) or reject with a short note.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
              tab === t.value
                ? t.color
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex w-full max-w-xs items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5">
          <Search className="h-4 w-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, store, phone…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-500">
          Nothing to review here.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <RequestCard key={r.id} req={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RequestCard({ req }: { req: ReqRow }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [showRejectBox, setShowRejectBox] = useState(false);

  const review = useMutation({
    mutationFn: async (action: 'APPROVED' | 'REJECTED') => {
      const res = await api.put(`/api/v1/admin/catalog-requests/${req.id}`, {
        status: action,
        reviewNote: note.trim() || undefined,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogRequests'] });
      setNote('');
      setShowRejectBox(false);
    },
  });

  const isPending = req.status === 'PENDING';

  return (
    <li className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-gray-900">{req.name}</h3>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-700">
              {req.category}
            </span>
            <span className="text-xs text-gray-500">unit: {req.defaultUnit}</span>
            {req.priceHint != null ? (
              <span className="text-xs text-gray-500">
                price hint: ₹{req.priceHint.toFixed(2)}
              </span>
            ) : null}
          </div>
          {req.description ? (
            <p className="mt-1 text-sm text-gray-600">{req.description}</p>
          ) : null}
          <p className="mt-2 text-xs text-gray-500">
            from <span className="font-medium text-gray-700">{req.store?.name ?? '—'}</span>
            {req.store?.city ? ` · ${req.store.city}` : ''} ·{' '}
            <span className="font-medium text-gray-700">
              {req.requester?.name ?? req.requester?.phone ?? '—'}
            </span>{' '}
            · {new Date(req.createdAt).toLocaleString()}
          </p>
          {req.reviewNote ? (
            <p className="mt-2 rounded-md bg-gray-50 px-2 py-1 text-xs text-gray-600">
              <span className="font-semibold">Admin note:</span> {req.reviewNote}
            </p>
          ) : null}
          {req.catalogItem ? (
            <p className="mt-2 text-xs text-green-700">
              Linked → {req.catalogItem.name}
            </p>
          ) : null}
        </div>

        {req.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={req.imageUrl}
            alt={req.name}
            className="h-16 w-16 flex-shrink-0 rounded-lg border border-gray-100 object-cover"
          />
        ) : null}
      </div>

      {isPending ? (
        <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
          {showRejectBox ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700">
                Reason (optional but recommended)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Why are you rejecting?"
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {!showRejectBox ? (
              <button
                type="button"
                onClick={() => review.mutate('APPROVED')}
                disabled={review.isPending}
                className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" />
                Approve
              </button>
            ) : null}
            {!showRejectBox ? (
              <button
                type="button"
                onClick={() => setShowRejectBox(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                <XCircle className="h-4 w-4" />
                Reject
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => review.mutate('REJECTED')}
                  disabled={review.isPending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                >
                  <Check className="h-4 w-4" />
                  Confirm rejection
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowRejectBox(false);
                    setNote('');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </li>
  );
}
