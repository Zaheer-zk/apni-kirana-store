'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bike,
  Car,
  CheckCircle2,
  KeyRound,
  LogOut,
  Pencil,
  Phone,
  Star,
} from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Card, CardContent } from '@aks/ui/components/card';
import { Input } from '@aks/ui/components/input';
import { Label } from '@aks/ui/components/label';
import { Avatar, AvatarFallback } from '@aks/ui/components/avatar';
import { Skeleton } from '@aks/ui/components/skeleton';
import { Separator } from '@aks/ui/components/separator';
import { toast } from '@aks/ui/components/sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@aks/ui/components/dialog';
import { AppHeader } from '@/components/AppHeader';
import { RequireAuth } from '@/components/RequireAuth';
import { api } from '@/lib/api';
import { clearSession, getStoredUser, setStoredUser, type StoredUser } from '@/lib/auth';
import { rupeesPrecise } from '@/lib/format';

interface MeResponse {
  id: string;
  name?: string | null;
  phone: string;
  email?: string | null;
  role: string;
  createdAt?: string;
}

interface DriverEarningsResponse {
  totalEarnings?: number;
  rating?: number;
  totalRatings?: number;
  totalDeliveries?: number;
  todayDeliveries?: number;
}

interface DriverStatsResponse {
  vehicleType?: string;
  vehicleNumber?: string;
  licenseNumber?: string;
  status?: string;
  rating?: number;
  totalRatings?: number;
}

export default function ProfilePage() {
  return (
    <RequireAuth>
      <AppHeader />
      <main className="page-shell py-6">
        <ProfileBody />
      </main>
    </RequireAuth>
  );
}

function ProfileBody() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => setUser(getStoredUser()), []);

  const meQuery = useQuery<MeResponse>({
    queryKey: ['userMe'],
    queryFn: async () => {
      const r = await api.get<{ success: boolean; data: MeResponse }>('/api/v1/users/me');
      return r.data?.data;
    },
  });

  const driverQuery = useQuery<DriverStatsResponse | null>({
    queryKey: ['driverStatsToday'],
    queryFn: async () => {
      try {
        const r = await api.get<{ success: boolean; data: DriverStatsResponse }>(
          '/api/v1/drivers/stats/today',
        );
        return r.data?.data ?? null;
      } catch {
        return null;
      }
    },
  });

  const earningsQuery = useQuery<DriverEarningsResponse>({
    queryKey: ['driverEarnings'],
    queryFn: async () => {
      const r = await api.get<{ success: boolean; data: DriverEarningsResponse }>(
        '/api/v1/drivers/earnings',
      );
      return r.data?.data ?? {};
    },
  });

  const meEditMutation = useMutation({
    mutationFn: async (values: { name: string }) => {
      const r = await api.put<{ success: boolean; data: MeResponse }>(
        '/api/v1/users/me',
        values,
      );
      return r.data?.data;
    },
    onSuccess: (data) => {
      toast.success('Profile updated');
      if (user && data) {
        const next: StoredUser = { ...user, name: data.name ?? user.name };
        setStoredUser(next);
        setUser(next);
      }
      queryClient.invalidateQueries({ queryKey: ['userMe'] });
      setEditOpen(false);
    },
    onError: (err: Error) => toast.error(err.message || 'Could not update profile'),
  });

  function handleLogout() {
    clearSession();
    router.replace('/login');
  }

  const me = meQuery.data;
  const driver = driverQuery.data;
  const earnings = earningsQuery.data;

  const rating = driver?.rating ?? earnings?.rating ?? 0;
  const totalRatings = driver?.totalRatings ?? earnings?.totalRatings ?? 0;
  const vehicleType = driver?.vehicleType ?? '—';
  const vehicleNumber = driver?.vehicleNumber ?? '—';
  const licenseNumber = driver?.licenseNumber ?? '—';

  const memberSince = me?.createdAt
    ? new Date(me.createdAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '—';

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">My profile</h1>
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4" /> Edit
        </Button>
      </header>

      {/* Hero card */}
      <Card>
        <CardContent className="space-y-4 p-6 text-center">
          <div className="flex justify-center">
            <Avatar className="h-20 w-20">
              <AvatarFallback className="text-xl">
                {initials(me?.name ?? user?.name ?? user?.phone ?? 'D')}
              </AvatarFallback>
            </Avatar>
          </div>
          {meQuery.isLoading ? (
            <div className="mx-auto h-6 w-40">
              <Skeleton className="h-6 w-full" />
            </div>
          ) : (
            <h2 className="text-xl font-bold text-gray-900">{me?.name ?? 'Driver'}</h2>
          )}
          <p className="flex items-center justify-center gap-1 text-sm text-gray-500">
            <Phone className="h-3.5 w-3.5" />
            +91 {me?.phone ?? user?.phone}
          </p>

          {rating > 0 ? (
            <div className="flex items-center justify-center gap-1 text-sm text-gray-700">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={
                    i < Math.round(rating) ? 'h-4 w-4 fill-warning text-warning' : 'h-4 w-4 text-gray-300'
                  }
                />
              ))}
              <span className="ml-1 font-semibold">{rating.toFixed(1)}</span>
              {totalRatings ? (
                <span className="text-xs text-gray-500">({totalRatings} ratings)</span>
              ) : null}
            </div>
          ) : null}

          <Separator />

          <div className="grid grid-cols-3 gap-2 text-center">
            <SummaryStat
              label="Lifetime"
              value={rupeesPrecise(earnings?.totalEarnings ?? 0)}
              loading={earningsQuery.isLoading}
            />
            <SummaryStat
              label="Deliveries"
              value={String(earnings?.totalDeliveries ?? 0)}
              loading={earningsQuery.isLoading}
            />
            <SummaryStat
              label="Status"
              value={driver?.status ?? '—'}
              loading={driverQuery.isLoading}
            />
          </div>
        </CardContent>
      </Card>

      {/* Vehicle info */}
      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
          Vehicle information
        </h3>
        <Card>
          <CardContent className="divide-y divide-gray-100 p-0">
            <InfoRow label="Vehicle type" icon={vehicleType === 'CAR' ? <Car className="h-4 w-4" /> : <Bike className="h-4 w-4" />}>
              {humanVehicle(vehicleType)}
            </InfoRow>
            <InfoRow label="Vehicle number">{vehicleNumber}</InfoRow>
            <InfoRow label="Licence number">{licenseNumber}</InfoRow>
          </CardContent>
        </Card>
        <p className="mt-2 text-xs text-gray-500">
          Vehicle details can only be updated by the admin team. Contact support if anything
          here is wrong.
        </p>
      </section>

      {/* Account */}
      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Account</h3>
        <Card>
          <CardContent className="divide-y divide-gray-100 p-0">
            <InfoRow label="Role">
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Driver
              </span>
            </InfoRow>
            <InfoRow label="Member since">{memberSince}</InfoRow>
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button asChild variant="outline" size="lg">
          <Link href="/change-password">
            <KeyRound className="h-4 w-4" /> Change password
          </Link>
        </Button>
        <Button variant="outline" size="lg" onClick={handleLogout}>
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </div>

      <EditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        defaultName={me?.name ?? user?.name ?? ''}
        onSubmit={(name) => meEditMutation.mutate({ name })}
        submitting={meEditMutation.isPending}
      />
    </div>
  );
}

function SummaryStat({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  return (
    <div>
      {loading ? (
        <Skeleton className="mx-auto h-5 w-12" />
      ) : (
        <p className="truncate text-sm font-bold text-gray-900">{value}</p>
      )}
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </p>
    </div>
  );
}

function InfoRow({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="flex items-center gap-1 font-semibold text-gray-900">
        {icon}
        {children}
      </span>
    </div>
  );
}

function EditDialog({
  open,
  onOpenChange,
  defaultName,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName: string;
  onSubmit: (name: string) => void;
  submitting: boolean;
}) {
  const [name, setName] = useState(defaultName);
  useEffect(() => setName(defaultName), [defaultName, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>
            You can update your display name. Vehicle and contact details are managed by the
            admin team.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="edit-name">Full name</Label>
          <Input
            id="edit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Chotu Singh"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onSubmit(name.trim())} loading={submitting} disabled={name.trim().length < 2}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'D';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

function humanVehicle(v: string): string {
  if (v === 'BIKE') return 'Bike';
  if (v === 'SCOOTER') return 'Scooter';
  if (v === 'CAR') return 'Car';
  return v;
}
