'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Search, X } from 'lucide-react';
import { api } from '@/lib/api';

type WalletUser = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  role: string;
};

type WalletRow = {
  id: string;
  userId: string;
  balance: number; // paise
  createdAt: string;
  updatedAt: string;
  user: WalletUser;
};

type WalletsResponse = {
  items: WalletRow[];
  total: number;
  page: number;
  limit: number;
};

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function WalletsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creditFor, setCreditFor] = useState<WalletRow | null>(null);

  const walletsQuery = useQuery({
    queryKey: ['admin-wallets', search, page],
    queryFn: async () => {
      const res = await api.get<{ success: true; data: WalletsResponse }>('/api/v1/admin/wallets', {
        params: { search: search || undefined, page, limit: 20 },
      });
      return res.data.data;
    },
  });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Wallets</h1>
          <p className="text-sm text-gray-500">
            All customer wallets. Click a row to view transactions or issue a goodwill credit.
          </p>
        </div>
      </header>

      <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
        <Search className="h-4 w-4 text-gray-400" aria-hidden />
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search by name, phone, or email…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
        />
      </div>

      {walletsQuery.isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-gray-200 bg-white py-12">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : walletsQuery.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Failed to load wallets.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3">Last updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {walletsQuery.data?.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                    No wallets found.
                  </td>
                </tr>
              ) : (
                walletsQuery.data?.items.map((w) => (
                  <tr key={w.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{w.user.name ?? '—'}</p>
                      <p className="text-xs text-gray-500">
                        {w.user.phone ? `+91 ${w.user.phone}` : ''}{w.user.email ? ` · ${w.user.email}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{w.user.role}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">
                      {rupees(w.balance)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(w.updatedAt).toLocaleDateString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setCreditFor(w)}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        <Plus className="h-3 w-3" /> Credit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {walletsQuery.data && walletsQuery.data.total > walletsQuery.data.limit ? (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            Page {walletsQuery.data.page} of {Math.ceil(walletsQuery.data.total / walletsQuery.data.limit)}
            {' · '}
            {walletsQuery.data.total} wallets
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
              disabled={page * (walletsQuery.data.limit ?? 20) >= walletsQuery.data.total}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-gray-200 px-3 py-1 disabled:opacity-50"
            >
              Next →
            </button>
          </div>
        </div>
      ) : null}

      {creditFor ? <CreditDrawer wallet={creditFor} onClose={() => setCreditFor(null)} /> : null}
    </div>
  );
}

// ─── Credit drawer ───────────────────────────────────────────────────────────

function CreditDrawer({ wallet, onClose }: { wallet: WalletRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [amountRupees, setAmountRupees] = useState('');
  const [kind, setKind] = useState<'GOODWILL' | 'ADJUSTMENT' | 'PROMO_CREDIT'>('GOODWILL');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const creditMutation = useMutation({
    mutationFn: async () => {
      const amount = Number(amountRupees);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a positive amount');
      if (!note.trim()) throw new Error('Note is required');
      return api.post(`/api/v1/admin/wallets/${wallet.userId}/credit`, {
        amountRupees: amount,
        kind,
        note: note.trim(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-wallets'] });
      queryClient.invalidateQueries({ queryKey: ['admin-refunds'] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to credit'),
  });

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 px-4 py-6 sm:items-center">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Issue credit</h2>
            <p className="text-xs text-gray-500">{wallet.user.name ?? wallet.user.phone}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            creditMutation.mutate();
          }}
          className="space-y-4 p-5"
        >
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600">
              Amount (₹)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amountRupees}
              onChange={(e) => setAmountRupees(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600">Kind</label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="GOODWILL">Goodwill</option>
              <option value="PROMO_CREDIT">Promo credit</option>
              <option value="ADJUSTMENT">Adjustment</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600">Note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              required
              placeholder="Reason shown to the customer in their wallet history."
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {error ? (
            <div className="rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</div>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creditMutation.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
            >
              {creditMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Issue credit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
