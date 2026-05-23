'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bike, CheckCircle2, Clock, LogOut } from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Card, CardContent } from '@aks/ui/components/card';
import { Skeleton } from '@aks/ui/components/skeleton';
import { api } from '@/lib/api';
import { clearSession, getStoredUser, type StoredUser } from '@/lib/auth';

interface PendingDriverProfile {
  id?: string;
  status?: string;
  vehicleType?: string;
  vehicleNumber?: string;
  licenseNumber?: string;
}

/**
 * Driver post-registration approval-pending screen. Mirrors
 * `apps/driver/app/(auth)/pending.tsx`.
 *
 * Polls `GET /drivers/stats/today` every 30 s so the moment admin approves
 * the account the page auto-advances to the dashboard. Driver can also sign
 * out from here.
 */
export default function PendingPage() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  const profileQuery = useQuery<PendingDriverProfile | null>({
    queryKey: ['driverProfile'],
    queryFn: async () => {
      try {
        const res = await api.get<{ success: boolean; data: PendingDriverProfile }>(
          '/api/v1/drivers/stats/today',
        );
        return res.data?.data ?? null;
      } catch {
        return null;
      }
    },
    refetchInterval: 30_000,
  });

  // Auto-advance to dashboard the moment admin approves.
  useEffect(() => {
    const status = profileQuery.data?.status;
    if (status && status !== 'PENDING_APPROVAL') {
      router.replace('/');
    }
  }, [profileQuery.data?.status, router]);

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
        <h1 className="text-2xl font-bold text-gray-900">Application under review</h1>
        <p className="mt-2 text-sm text-gray-600">
          Thanks for signing up{user?.name ? `, ${user.name.split(' ')[0]}` : ''}! Our team is
          verifying your details. You'll be notified the moment your account is approved.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="text-sm font-bold text-gray-900">What happens next?</h2>

          <TimelineRow
            state="done"
            title="Application received"
            body="We have your vehicle and licence details"
          />
          <TimelineRow
            state="active"
            title="Verification in progress"
            body="Most drivers are approved within 24–48 hours"
          />
          <TimelineRow
            state="pending"
            title="Start delivering"
            body="Go online from the dashboard once approved"
          />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="space-y-3 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
            Submitted details
          </p>
          {profileQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : (
            <>
              <DetailRow label="Vehicle">
                {profileQuery.data?.vehicleType ?? '—'}
                {profileQuery.data?.vehicleNumber ? ` · ${profileQuery.data.vehicleNumber}` : ''}
              </DetailRow>
              {profileQuery.data?.licenseNumber ? (
                <DetailRow label="Licence">{profileQuery.data.licenseNumber}</DetailRow>
              ) : null}
              <DetailRow label="Status">
                {profileQuery.data?.status ?? 'PENDING_APPROVAL'}
              </DetailRow>
            </>
          )}
        </CardContent>
      </Card>

      <Button variant="outline" size="lg" className="mt-6 w-full" onClick={handleLogout}>
        <LogOut className="h-4 w-4" />
        Sign out
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
        <Bike className="h-3 w-3" />
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
