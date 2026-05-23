'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Clock3,
  Edit,
  MapPin,
  Phone,
  Store,
} from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@aks/ui/components/card';
import { Skeleton } from '@aks/ui/components/skeleton';
import { Badge } from '@aks/ui/components/badge';
import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';
import { ErrorPanel } from '@/components/StatePanels';
import { api } from '@/lib/api';

interface StoreMeFull {
  id: string;
  name: string;
  description?: string | null;
  category?: string;
  lat?: number;
  lng?: number;
  isOpen?: boolean;
  status?: string;
  street?: string;
  city?: string;
  state?: string;
  pincode?: string;
  openTime?: string;
  closeTime?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
  _count?: { items?: number };
}

export default function ProfilePage() {
  return (
    <AuthGuard>
      <AppShell>
        <ProfileInner />
      </AppShell>
    </AuthGuard>
  );
}

function ProfileInner() {
  const { data, isLoading, isError, refetch } = useQuery<StoreMeFull>({
    queryKey: ['storeMe', 'full'],
    queryFn: async () => {
      const res = await api.get('/api/v1/stores/me');
      return (res.data?.data ?? res.data) as StoreMeFull;
    },
  });

  if (isLoading) {
    return (
      <div className="page-shell space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="page-shell">
        <ErrorPanel message="Couldn't load your store profile." onRetry={() => refetch()} />
      </div>
    );
  }

  // Backend stores street/city/state/pincode directly on the Store row, but
  // some older code path returns them nested under `address`. Be tolerant.
  const street = data.street ?? data.address?.street ?? '—';
  const city = data.city ?? data.address?.city ?? '—';
  const state = data.state ?? data.address?.state ?? '—';
  const pincode = data.pincode ?? data.address?.pincode ?? '—';

  return (
    <div className="page-shell space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Store profile</h1>
          <p className="text-sm text-gray-500">
            Customers see this information when they search nearby. Keep it up to date.
          </p>
        </div>
        <Button asChild>
          <Link href="/profile/edit" className="gap-1">
            <Edit className="h-4 w-4" /> Edit details
          </Link>
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Store className="h-4 w-4 text-primary" /> About your store
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs uppercase text-gray-400">Store name</p>
            <p className="text-base font-semibold text-gray-900">{data.name}</p>
          </div>
          {data.description ? (
            <div>
              <p className="text-xs uppercase text-gray-400">Description</p>
              <p className="text-sm text-gray-700">{data.description}</p>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {data.category ? <Badge variant="secondary">{data.category}</Badge> : null}
            {data.status ? (
              <Badge variant={data.status === 'ACTIVE' ? 'success' : 'warning'}>
                {data.status}
              </Badge>
            ) : null}
            <Badge variant={data.isOpen ? 'success' : 'destructive'}>
              {data.isOpen ? 'Open' : 'Closed'}
            </Badge>
            {typeof data._count?.items === 'number' ? (
              <Badge variant="outline">
                {data._count.items} {data._count.items === 1 ? 'item' : 'items'}
              </Badge>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4 text-primary" /> Address & location
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-gray-900">{street}</p>
          <p className="text-sm text-gray-600">
            {city}, {state} — {pincode}
          </p>
          {typeof data.lat === 'number' && typeof data.lng === 'number' ? (
            <p className="text-xs text-gray-400">
              Pinned at {data.lat.toFixed(5)}, {data.lng.toFixed(5)}
            </p>
          ) : (
            <p className="text-xs text-amber-700">
              No location pinned yet — customers won't see your store until you add one.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock3 className="h-4 w-4 text-primary" /> Operating hours
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-700">
            {data.openTime ?? '09:00'} – {data.closeTime ?? '21:00'}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Toggle "Open/Closed" in the top bar to pause new orders without changing hours.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="h-4 w-4 text-primary" /> Account & security
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button asChild variant="outline">
            <Link href="/change-password">Change password</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
