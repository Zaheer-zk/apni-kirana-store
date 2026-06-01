'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, IndianRupee, Loader2, TrendingDown, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';

// Finance reconciliation page. Surfaces the three numbers an admin cares
// about at month-end:
//   1. Collect from stores — commission owed on COD-paid orders that
//      stores already collected cash for.
//   2. Pay stores — net (subtotal - commission) on online-paid orders
//      the customer paid us for and the store delivered.
//   3. Pay drivers — sum of unpaid driver payouts.
// Per-store breakdown sits underneath so admin can click into specific
// stores to settle balances.

interface FinanceSummary {
  window: { from: string; to: string };
  collectFromStores: { amount: number; orderCount: number };
  payStores: { amount: number; orderCount: number };
  payDrivers: { amount: number; payoutCount: number };
  totals: { codGross: number; onlineGross: number };
}

interface ByStoreRow {
  storeId: string;
  storeName: string;
  city: string;
  ownerName: string | null;
  ownerPhone: string | null;
  codCommission: number;
  onlineNet: number;
  orderCount: number;
  netDue: number; // + = we owe them, - = they owe us
}

interface ByStoreResp {
  window: { from: string; to: string };
  items: ByStoreRow[];
}

function unwrap<T>(res: { data: { success?: boolean; data?: T } }): T {
  return (res.data?.data ?? (res.data as unknown as T)) as T;
}

function rupees(v: number): string {
  return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function FinancePage() {
  // Default window: current calendar month.
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [from, setFrom] = useState(isoDay(monthStart));
  const [to, setTo] = useState(isoDay(now));

  const summary = useQuery({
    queryKey: ['admin-finance-summary', from, to],
    queryFn: async () =>
      unwrap<FinanceSummary>(
        await api.get('/api/v1/admin/finance/summary', { params: { from, to } }),
      ),
  });

  const byStore = useQuery({
    queryKey: ['admin-finance-by-store', from, to],
    queryFn: async () =>
      unwrap<ByStoreResp>(
        await api.get('/api/v1/admin/finance/by-store', { params: { from, to } }),
      ),
  });

  const cards = useMemo(() => {
    if (!summary.data) return null;
    return [
      {
        label: 'Collect from stores',
        sub: `${summary.data.collectFromStores.orderCount} COD orders`,
        amount: summary.data.collectFromStores.amount,
        tone: 'amber',
        Icon: TrendingDown,
        href: '#by-store',
      },
      {
        label: 'Pay to stores',
        sub: `${summary.data.payStores.orderCount} online-paid orders`,
        amount: summary.data.payStores.amount,
        tone: 'emerald',
        Icon: TrendingUp,
        href: '#by-store',
      },
      {
        label: 'Pay to drivers',
        sub: `${summary.data.payDrivers.payoutCount} pending payouts`,
        amount: summary.data.payDrivers.amount,
        tone: 'violet',
        Icon: TrendingUp,
        href: '/payouts',
      },
    ];
  }, [summary.data]);

  const TONE: Record<string, { bg: string; text: string; border: string }> = {
    amber: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
    violet: { bg: 'bg-violet-50', text: 'text-violet-800', border: 'border-violet-200' },
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <IndianRupee className="h-6 w-6 text-primary" />
          Finance
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Money to collect from stores (COD commission) + money owed to stores
          (online-paid orders) + money owed to drivers (pending payouts). Defaults
          to this calendar month.
        </p>
      </header>

      {/* Date range */}
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:max-w-md">
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
          />
        </label>
      </div>

      {/* Top-line cards */}
      {summary.isLoading || !cards ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-32 animate-pulse bg-gray-100" />
          ))}
        </div>
      ) : summary.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Failed to load finance summary.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {cards.map((c) => {
            const tone = TONE[c.tone];
            return (
              <Link
                key={c.label}
                href={c.href}
                className={`block rounded-2xl border ${tone?.border} ${tone?.bg} p-5 transition hover:-translate-y-0.5 hover:shadow-md`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className={`text-xs font-semibold uppercase tracking-wider ${tone?.text}`}>{c.label}</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">{rupees(c.amount)}</p>
                    <p className="mt-1 text-xs text-gray-500">{c.sub}</p>
                  </div>
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full bg-white/70 ${tone?.text}`}>
                    <c.Icon className="h-4 w-4" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Per-store breakdown */}
      <section id="by-store" className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <header className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">Per-store balance</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            <span className="font-medium text-emerald-700">+</span> we owe the store ·{' '}
            <span className="font-medium text-amber-700">−</span> store owes us (COD commission)
          </p>
        </header>
        {byStore.isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : !byStore.data || byStore.data.items.length === 0 ? (
          <p className="p-10 text-center text-sm text-gray-400">
            No delivered orders in this window.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-5 py-3">Store</th>
                  <th className="px-5 py-3 text-right">Orders</th>
                  <th className="px-5 py-3 text-right">COD commission (collect)</th>
                  <th className="px-5 py-3 text-right">Online net (pay)</th>
                  <th className="px-5 py-3 text-right">Net due</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {byStore.data.items.map((s) => (
                  <tr key={s.storeId} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">{s.storeName}</p>
                      <p className="text-[11px] text-gray-500">
                        {s.city}
                        {s.ownerName ? ` · ${s.ownerName}` : ''}
                        {s.ownerPhone ? ` · ${s.ownerPhone}` : ''}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-right text-gray-700">{s.orderCount}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right font-mono text-amber-700">
                      {s.codCommission > 0 ? `-${rupees(s.codCommission)}` : '—'}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right font-mono text-emerald-700">
                      {s.onlineNet > 0 ? `+${rupees(s.onlineNet)}` : '—'}
                    </td>
                    <td
                      className={`whitespace-nowrap px-5 py-3 text-right font-mono font-bold ${
                        s.netDue >= 0 ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {s.netDue >= 0 ? '+' : '−'}
                      {rupees(Math.abs(s.netDue))}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/stores/${s.storeId}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-700"
                      >
                        Open
                        <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
