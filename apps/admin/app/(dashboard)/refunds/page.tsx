'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

type RefundKind = 'REFUND' | 'GOODWILL' | 'ADJUSTMENT' | 'PROMO_CREDIT' | 'ORDER_PAYMENT';

type RefundRow = {
  id: string;
  kind: RefundKind;
  amount: number; // signed paise (+credit / -debit)
  balanceAfter: number;
  note: string | null;
  orderId: string | null;
  actorId: string | null;
  createdAt: string;
  wallet: {
    id: string;
    user: { id: string; name: string | null; phone: string | null; email: string | null };
  };
  order: { id: string; total: number; status: string } | null;
};

type Response = { items: RefundRow[]; total: number; page: number; limit: number };

const KIND_BADGE: Record<RefundKind, string> = {
  REFUND: 'bg-emerald-100 text-emerald-700',
  GOODWILL: 'bg-blue-100 text-blue-700',
  PROMO_CREDIT: 'bg-violet-100 text-violet-700',
  ADJUSTMENT: 'bg-amber-100 text-amber-700',
  ORDER_PAYMENT: 'bg-gray-100 text-gray-700',
};

function rupees(paise: number): string {
  const sign = paise < 0 ? '−' : '+';
  const abs = Math.abs(paise) / 100;
  return `${sign} ₹${abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function RefundsPage() {
  const [kind, setKind] = useState<'ALL' | RefundKind>('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ['admin-refunds', kind, from, to, page],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: Response }>('/api/v1/admin/refunds', {
        params: {
          kind: kind === 'ALL' ? undefined : kind,
          from: from || undefined,
          to: to || undefined,
          page,
          limit: 30,
        },
      });
      return res.data.data;
    },
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Refunds & credits</h1>
        <p className="text-sm text-gray-500">
          Every wallet transaction. Refunds, goodwill credits, promo credits, and adjustments are
          shown by default; pass <code className="rounded bg-gray-100 px-1">ALL</code> to include
          order-payment debits.
        </p>
      </header>

      {/* Filters */}
      <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-gray-600">
          Kind
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as 'ALL' | RefundKind);
              setPage(1);
            }}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal text-gray-900"
          >
            <option value="ALL">All credits</option>
            <option value="REFUND">Refunds only</option>
            <option value="GOODWILL">Goodwill only</option>
            <option value="PROMO_CREDIT">Promo only</option>
            <option value="ADJUSTMENT">Adjustments only</option>
            <option value="ORDER_PAYMENT">Order payments (debits)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-gray-600">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal text-gray-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-gray-600">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm normal-case font-normal text-gray-900"
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => {
              setKind('ALL');
              setFrom('');
              setTo('');
              setPage(1);
            }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Clear filters
          </button>
        </div>
      </div>

      {/* Table */}
      {q.isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-gray-200 bg-white py-12">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : q.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Failed to load refunds.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Kind</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Note</th>
                <th className="px-4 py-3">Order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {q.data?.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                    No transactions match.
                  </td>
                </tr>
              ) : (
                q.data?.items.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{fmtDate(r.createdAt)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{r.wallet.user.name ?? '—'}</p>
                      <p className="text-xs text-gray-500">{r.wallet.user.phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${KIND_BADGE[r.kind]}`}
                      >
                        {r.kind.replace('_', ' ')}
                      </span>
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-mono font-semibold ${r.amount > 0 ? 'text-emerald-600' : 'text-gray-700'}`}>
                      {rupees(r.amount)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      <span className="line-clamp-2 max-w-xs">{r.note ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      {r.orderId ? (
                        <Link
                          href={`/orders/${r.orderId}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-700"
                        >
                          #{r.orderId.slice(-6)}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
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

      {/* Pagination */}
      {q.data && q.data.total > q.data.limit ? (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            Page {q.data.page} of {Math.ceil(q.data.total / q.data.limit)} · {q.data.total} transactions
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
    </div>
  );
}
