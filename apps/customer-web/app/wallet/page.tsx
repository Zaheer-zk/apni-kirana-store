'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Loader2, Wallet as WalletIcon } from 'lucide-react';
import { Badge } from '@aks/ui/components/badge';
import { Skeleton } from '@aks/ui/components/skeleton';
import { AppHeader } from '@/components/AppHeader';
import { ErrorPanel } from '@/components/StatePanels';
import { api, unwrap } from '@/lib/api';
import { useUser } from '@/lib/use-user';

type WalletTxn = {
  id: string;
  kind: 'REFUND' | 'PROMO_CREDIT' | 'GOODWILL' | 'ORDER_PAYMENT' | 'ADJUSTMENT';
  amount: number; // signed paise
  balanceAfter: number;
  orderId: string | null;
  note: string | null;
  actorId: string | null;
  createdAt: string;
};

type WalletView = {
  balance: number; // paise
  currency: string;
  transactions: WalletTxn[];
};

const KIND_LABEL: Record<WalletTxn['kind'], string> = {
  REFUND: 'Refund',
  PROMO_CREDIT: 'Promo credit',
  GOODWILL: 'Goodwill credit',
  ORDER_PAYMENT: 'Order payment',
  ADJUSTMENT: 'Adjustment',
};

const KIND_TONE: Record<WalletTxn['kind'], 'success' | 'info' | 'warning' | 'destructive' | 'secondary'> = {
  REFUND: 'success',
  PROMO_CREDIT: 'info',
  GOODWILL: 'info',
  ORDER_PAYMENT: 'destructive',
  ADJUSTMENT: 'warning',
};

function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function WalletPage() {
  // Auth-gate: bounce to /login if not signed in.
  useUser({ redirectIfUnauthed: '/login?next=/wallet' });

  const [showLimit, setShowLimit] = useState(50);
  const walletQuery = useQuery({
    queryKey: ['wallet', showLimit],
    queryFn: async () => {
      const res = await api.get('/api/v1/users/me/wallet', { params: { limit: showLimit } });
      return unwrap<WalletView>(res.data);
    },
  });

  return (
    <>
      <AppHeader />
      <main className="page-shell py-6 sm:py-10">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Your wallet</h1>
          <p className="mt-1 text-sm text-gray-500">
            Refunds from cancelled orders, promo credits, and goodwill credits land here.
          </p>
        </header>

        {/* Balance card */}
        <section className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary-700 p-6 text-white shadow-md sm:p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
              <WalletIcon className="h-6 w-6" aria-hidden />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-white/80">Available balance</p>
              {walletQuery.isLoading ? (
                <Skeleton className="mt-1 h-9 w-32 bg-white/30" />
              ) : (
                <p className="mt-0.5 text-3xl font-bold sm:text-4xl">
                  {formatRupees(walletQuery.data?.balance ?? 0)}
                </p>
              )}
            </div>
          </div>
          <p className="mt-3 text-xs text-white/70">
            Use at checkout to pay for your next order. No expiry.
          </p>
        </section>

        {/* Transactions */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Transactions</h2>

          {walletQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : walletQuery.isError ? (
            <ErrorPanel
              message="Couldn't load your wallet transactions."
              onRetry={() => walletQuery.refetch()}
            />
          ) : !walletQuery.data || walletQuery.data.transactions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
              <WalletIcon className="mx-auto h-10 w-10 text-gray-300" aria-hidden />
              <p className="mt-3 text-sm font-semibold text-gray-700">Your wallet is empty</p>
              <p className="mt-1 text-xs text-gray-500">
                Cancel an order or earn promo credits to fill it up.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              {walletQuery.data.transactions.map((txn) => {
                const isCredit = txn.amount > 0;
                const sign = isCredit ? '+' : '−';
                return (
                  <li key={txn.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={KIND_TONE[txn.kind]}>{KIND_LABEL[txn.kind]}</Badge>
                        <span className="text-xs text-gray-500">{formatDate(txn.createdAt)}</span>
                      </div>
                      {txn.note ? (
                        <p className="mt-1 truncate text-sm text-gray-700">{txn.note}</p>
                      ) : null}
                      {txn.orderId ? (
                        <Link
                          href={`/orders/${txn.orderId}`}
                          className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-700"
                        >
                          Order #{txn.orderId.slice(-6)}
                          <ChevronRight className="h-3 w-3" aria-hidden />
                        </Link>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-base font-bold ${isCredit ? 'text-emerald-600' : 'text-gray-700'}`}
                      >
                        {sign} {formatRupees(Math.abs(txn.amount))}
                      </p>
                      <p className="mt-0.5 text-[11px] text-gray-400">
                        Balance: {formatRupees(txn.balanceAfter)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {walletQuery.data && walletQuery.data.transactions.length >= showLimit ? (
            <button
              type="button"
              onClick={() => setShowLimit((n) => n + 50)}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              {walletQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Load more
            </button>
          ) : null}
        </section>
      </main>
    </>
  );
}
