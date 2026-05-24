'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, RefreshCcw, X } from 'lucide-react';
import { api } from '@/lib/api';

type Payout = {
  id: string;
  driverId: string;
  periodStart: string;
  periodEnd: string;
  orderCount: number;
  gross: number;
  deductions: number;
  net: number;
  status: 'PENDING' | 'PAID' | 'FAILED';
  reference: string | null;
  notes: string | null;
  paidAt: string | null;
  driver: {
    id: string;
    user: { id: string; name: string | null; phone: string | null; email: string | null };
  };
};

type Response = { items: Payout[]; total: number; page: number; limit: number };

const STATUS_BADGE: Record<Payout['status'], string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-red-100 text-red-700',
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function PayoutsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'ALL' | Payout['status']>('PENDING');
  const [page, setPage] = useState(1);
  const [markPaidFor, setMarkPaidFor] = useState<Payout | null>(null);

  const q = useQuery({
    queryKey: ['admin-payouts', status, page],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: Response }>('/api/v1/admin/payouts', {
        params: {
          status: status === 'ALL' ? undefined : status,
          page,
          limit: 30,
        },
      });
      return res.data.data;
    },
  });

  const aggregateMutation = useMutation({
    mutationFn: async () => api.post('/api/v1/admin/payouts/aggregate', { lastWeek: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-payouts'] }),
  });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Driver payouts</h1>
          <p className="text-sm text-gray-500">
            Weekly aggregated payouts. Use 'Aggregate last week' to roll up newly-delivered orders.
          </p>
        </div>
        <button
          type="button"
          onClick={() => aggregateMutation.mutate()}
          disabled={aggregateMutation.isPending}
          className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {aggregateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          Aggregate last week
        </button>
      </header>

      {/* Status tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {(['PENDING', 'PAID', 'FAILED', 'ALL'] as const).map((s) => (
          <button
            type="button"
            key={s}
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition ${
              status === s
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-gray-200 bg-white py-12">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : q.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Failed to load payouts.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3">Driver</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3 text-right">Orders</th>
                <th className="px-4 py-3 text-right">Gross</th>
                <th className="px-4 py-3 text-right">Deductions</th>
                <th className="px-4 py-3 text-right">Net</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {q.data?.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                    No payouts match.
                  </td>
                </tr>
              ) : (
                q.data?.items.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{p.driver.user.name ?? '—'}</p>
                      <p className="text-xs text-gray-500">{p.driver.user.phone}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600">
                      {fmtDate(p.periodStart)} – {fmtDate(p.periodEnd)}
                    </td>
                    <td className="px-4 py-3 text-right">{p.orderCount}</td>
                    <td className="px-4 py-3 text-right font-mono">₹{p.gross.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-500">
                      {p.deductions > 0 ? `−₹${p.deductions.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">
                      ₹{p.net.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${STATUS_BADGE[p.status]}`}>
                        {p.status}
                      </span>
                      {p.reference ? <p className="mt-0.5 text-[10px] text-gray-500">UTR: {p.reference}</p> : null}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.status === 'PENDING' ? (
                        <button
                          type="button"
                          onClick={() => setMarkPaidFor(p)}
                          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700"
                        >
                          <CheckCircle2 className="h-3 w-3" /> Mark paid
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {q.data && q.data.total > q.data.limit ? (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            Page {q.data.page} of {Math.ceil(q.data.total / q.data.limit)} · {q.data.total} payouts
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-gray-200 px-3 py-1 disabled:opacity-50"
            >
              ← Prev
            </button>
            <button
              type="button"
              disabled={page * q.data.limit >= q.data.total}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-gray-200 px-3 py-1 disabled:opacity-50"
            >
              Next →
            </button>
          </div>
        </div>
      ) : null}

      {markPaidFor ? <MarkPaidDialog payout={markPaidFor} onClose={() => setMarkPaidFor(null)} /> : null}
    </div>
  );
}

// ─── Mark-paid dialog (with optional deductions adjustment) ─────────────────

function MarkPaidDialog({ payout, onClose }: { payout: Payout; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [deductions, setDeductions] = useState(String(payout.deductions));
  const [notes, setNotes] = useState(payout.notes ?? '');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);

  const adjustedNet = Math.max(0, payout.gross - (Number(deductions) || 0));

  const mark = useMutation({
    mutationFn: async () => {
      if (!reference.trim()) throw new Error('Bank reference / UTR is required');
      const ded = Number(deductions);
      if (!Number.isFinite(ded) || ded < 0) throw new Error('Deductions must be a non-negative number');
      // 1. Save deductions/notes if they changed
      if (ded !== payout.deductions || notes !== (payout.notes ?? '')) {
        await api.put(`/api/v1/admin/payouts/${payout.id}`, {
          deductions: ded,
          notes: notes.trim() || undefined,
        });
      }
      // 2. Mark paid
      return api.post(`/api/v1/admin/payouts/${payout.id}/mark-paid`, {
        reference: reference.trim(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-payouts'] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to mark paid'),
  });

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 px-4 py-6 sm:items-center">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Mark payout paid</h2>
            <p className="text-xs text-gray-500">
              {payout.driver.user.name} · {payout.orderCount} orders
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            mark.mutate();
          }}
          className="space-y-4 p-5"
        >
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Gross</span>
              <span className="font-mono">₹{payout.gross.toFixed(2)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-gray-600">Deductions</span>
              <span className="font-mono">−₹{(Number(deductions) || 0).toFixed(2)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between border-t border-gray-200 pt-1 text-base font-semibold">
              <span>Net</span>
              <span className="font-mono">₹{adjustedNet.toFixed(2)}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600">
              Deductions (₹)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={deductions}
              onChange={(e) => setDeductions(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600">
              Bank reference / UTR
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              required
              placeholder="UTR123456789"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</div> : null}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={mark.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
            >
              {mark.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Mark paid
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
