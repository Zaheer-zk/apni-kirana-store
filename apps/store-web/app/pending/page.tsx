'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, LogOut, Store as StoreIcon } from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Card, CardContent } from '@aks/ui/components/card';
import { Skeleton } from '@aks/ui/components/skeleton';
import { api } from '@/lib/api';
import {
  clearSession,
  getStoredUser,
  setStoredStore,
  type StoredUser,
} from '@/lib/auth';

/**
 * Store-owner approval-pending screen. Mirrors `apps/driver-web/app/pending`
 * and the equivalent store-portal mobile flow.
 *
 * The token issued by `/auth/login-password` (or `/auth/verify-otp`) for a
 * PENDING_APPROVAL store works for `/auth/me` + `/stores/me` only — every
 * mutating endpoint returns 403 via the `requireApproved` middleware. So
 * we poll `/stores/me` every 30s and the moment status flips to `ACTIVE`
 * we route the owner to the dashboard.
 */
interface PendingStoreProfile {
  id?: string;
  name?: string;
  status?: string;
  category?: string;
  city?: string;
  state?: string;
}

export default function StorePendingPage() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const t = useTranslations('pending');

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  const storeQuery = useQuery<PendingStoreProfile | null>({
    queryKey: ['storeMe', 'pending'],
    queryFn: async () => {
      try {
        const res = await api.get<{ success: boolean; data: PendingStoreProfile }>(
          '/api/v1/stores/me',
        );
        const store = res.data?.data ?? null;
        // Mirror to localStorage so AppShell has the latest snapshot the
        // instant we route to '/'.
        if (store) setStoredStore(store as unknown as Parameters<typeof setStoredStore>[0]);
        return store;
      } catch {
        return null;
      }
    },
    refetchInterval: 30_000,
    // Surface a fresh value on tab focus too — owners often check this page
    // intermittently while waiting for the email.
    refetchOnWindowFocus: true,
  });

  // Auto-advance to dashboard the moment admin approves.
  useEffect(() => {
    const status = storeQuery.data?.status;
    if (status && status !== 'PENDING_APPROVAL' && status !== 'SUSPENDED') {
      router.replace('/');
    }
  }, [storeQuery.data?.status, router]);

  function handleLogout() {
    clearSession();
    router.replace('/login');
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-10">
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-warningLight">
          <Clock className="h-12 w-12 text-warning" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">
          {t('title')}
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Thanks for signing up{user?.name ? `, ${user.name.split(' ')[0]}` : ''}! Our team is
          reviewing your store details. You&apos;ll be notified the moment your store goes live.
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Estimated review time: 24–48 hours.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="text-sm font-bold text-gray-900">What happens next?</h2>

          <TimelineRow
            state="done"
            title="Store details received"
            body="We have your store profile and location"
          />
          <TimelineRow
            state="active"
            title="Verification in progress"
            body="Most stores are approved within 24–48 hours"
          />
          <TimelineRow
            state="pending"
            title="Start accepting orders"
            body="Open your store from the dashboard once approved"
          />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="space-y-3 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
            Submitted details
          </p>
          {storeQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : (
            <>
              <DetailRow label="Store">{storeQuery.data?.name ?? '—'}</DetailRow>
              {storeQuery.data?.category ? (
                <DetailRow label="Category">{storeQuery.data.category}</DetailRow>
              ) : null}
              {storeQuery.data?.city ? (
                <DetailRow label="Location">
                  {storeQuery.data.city}
                  {storeQuery.data.state ? `, ${storeQuery.data.state}` : ''}
                </DetailRow>
              ) : null}
              <DetailRow label="Status">
                {storeQuery.data?.status ?? 'PENDING_APPROVAL'}
              </DetailRow>
            </>
          )}
        </CardContent>
      </Card>

      <Button variant="outline" size="lg" className="mt-6 w-full" onClick={handleLogout}>
        <LogOut className="h-4 w-4" />
        {t('signOut')}
      </Button>

      <p className="mt-6 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} Quick Easy Mart · Apni Kirana Store
      </p>
    </main>
  );
}

function TimelineRow({
  state,
  title,
  body,
}: {
  state: 'done' | 'active' | 'pending';
  title: string;
  body: string;
}) {
  const dot =
    state === 'done' ? (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white">
        <CheckCircle2 className="h-4 w-4" />
      </div>
    ) : state === 'active' ? (
      <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-warning bg-warningLight">
        <div className="h-2 w-2 rounded-full bg-warning" />
      </div>
    ) : (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-gray-400">
        <StoreIcon className="h-3 w-3" />
      </div>
    );
  return (
    <div className="flex items-start gap-3">
      {dot}
      <div className="flex-1">
        <p
          className={
            state === 'active'
              ? 'text-sm font-bold text-warning'
              : state === 'pending'
                ? 'text-sm font-bold text-gray-400'
                : 'text-sm font-bold text-gray-900'
          }
        >
          {title}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">{body}</p>
      </div>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-semibold text-gray-900">{children}</span>
    </div>
  );
}
