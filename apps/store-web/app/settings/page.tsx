'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  BellOff,
  Clock3,
  Info,
  Lock,
  MapPin,
  Moon,
  Phone,
  Save,
  Settings as SettingsIcon,
} from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Input } from '@aks/ui/components/input';
import { Label } from '@aks/ui/components/label';
import { Card, CardContent, CardHeader, CardTitle } from '@aks/ui/components/card';
import { Skeleton } from '@aks/ui/components/skeleton';
import { toast } from '@aks/ui/components/sonner';
import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';
import { ErrorPanel } from '@/components/StatePanels';
import { api } from '@/lib/api';
import { getStoredStore, setStoredStore } from '@/lib/auth';
import {
  getCurrentSubscription,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/lib/web-push';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

interface StoreMe {
  id: string;
  name?: string;
  openTime?: string;
  closeTime?: string;
  isOpen?: boolean;
  isWholesaler?: boolean;
}

interface NotificationPrefs {
  orderUpdates?: boolean;
  newOrderAlerts?: boolean;
  rescindedAlerts?: boolean;
  earningsSummary?: boolean;
  dailySummary?: boolean;
  promotional?: boolean;
}

export default function SettingsPage() {
  return (
    <AuthGuard>
      <AppShell>
        <div className="page-shell space-y-6">
          <header className="space-y-1">
            <span className="section-eyebrow">Account</span>
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Settings</h1>
            <p className="text-sm text-gray-500">
              Operating hours, notifications and account controls in one place.
            </p>
          </header>

          <OperatingHoursSection />
          <NotificationsSection />
          <PushSection />
          <DeliveryRadiusSection />
          <AccountSection />
        </div>
      </AppShell>
    </AuthGuard>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Operating hours
// ────────────────────────────────────────────────────────────────────────────

function OperatingHoursSection() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery<StoreMe>({
    queryKey: ['storeMe'],
    queryFn: async () => {
      const res = await api.get('/api/v1/stores/me');
      return (res.data?.data ?? res.data) as StoreMe;
    },
  });

  const [open, setOpen] = useState('09:00');
  const [close, setClose] = useState('21:00');
  const [alwaysOpen, setAlwaysOpen] = useState(false);
  const [errors, setErrors] = useState<{ open?: string; close?: string }>({});

  // Hydrate inputs once the store loads.
  useEffect(() => {
    if (!data) return;
    setOpen(data.openTime ?? '09:00');
    setClose(data.closeTime ?? '21:00');
    setAlwaysOpen(data.openTime === '00:00' && data.closeTime === '23:59');
  }, [data]);

  function handleAlwaysOpen(next: boolean) {
    setAlwaysOpen(next);
    if (next) {
      setOpen('00:00');
      setClose('23:59');
      setErrors({});
    }
  }

  function validate(): boolean {
    const next: { open?: string; close?: string } = {};
    if (!TIME_REGEX.test(open)) next.open = 'Use HH:MM (24h) format';
    if (!TIME_REGEX.test(close)) next.close = 'Use HH:MM (24h) format';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  const update = useMutation({
    mutationFn: async () => {
      if (!data?.id) throw new Error('Store id missing');
      const res = await api.put(`/api/v1/stores/${data.id}`, {
        openTime: open,
        closeTime: close,
      });
      return res.data?.data ?? res.data;
    },
    onSuccess: () => {
      // Update the cached store snapshot so AppShell's open/closed pill is
      // consistent with the new hours.
      const stored = getStoredStore() ?? {};
      setStoredStore({ ...stored, openTime: open, closeTime: close });
      queryClient.invalidateQueries({ queryKey: ['storeMe'] });
      toast.success('Operating hours updated');
    },
    onError: (err: Error) => toast.error(err.message || 'Could not save hours'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    update.mutate();
  }

  if (isLoading) {
    return <SkeletonCard />;
  }
  if (isError || !data) {
    return (
      <Card>
        <CardContent className="p-5">
          <ErrorPanel message="Couldn't load your store profile." onRetry={() => refetch()} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock3 className="h-4 w-4 text-primary" /> Operating hours
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <ToggleRow
            icon={<Moon className="h-4 w-4 text-primary" />}
            label="24/7 store"
            sub="Open all day, every day"
            on={alwaysOpen}
            onChange={handleAlwaysOpen}
          />

          <div className={`grid gap-4 sm:grid-cols-2 ${alwaysOpen ? 'opacity-60' : ''}`}>
            <div className="space-y-1.5">
              <Label htmlFor="openTime">Opening time</Label>
              <Input
                id="openTime"
                type="time"
                value={open}
                onChange={(e) => {
                  setOpen(e.target.value);
                  if (alwaysOpen) setAlwaysOpen(false);
                }}
                disabled={alwaysOpen}
              />
              {errors.open ? <p className="text-xs text-destructive">{errors.open}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="closeTime">Closing time</Label>
              <Input
                id="closeTime"
                type="time"
                value={close}
                onChange={(e) => {
                  setClose(e.target.value);
                  if (alwaysOpen) setAlwaysOpen(false);
                }}
                disabled={alwaysOpen}
              />
              {errors.close ? <p className="text-xs text-destructive">{errors.close}</p> : null}
            </div>
          </div>

          <p className="rounded-md bg-primary-50 px-3 py-2 text-xs text-primary-700">
            Times are in 24-hour format. Use the Open/Closed pill in the top bar to pause new
            orders without changing your hours.
          </p>

          <div className="flex justify-end">
            <Button type="submit" loading={update.isPending} className="gap-1">
              <Save className="h-4 w-4" /> Save hours
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Notification preferences (in-app/email/whatever — backend persists, channel
// dispatcher honours these flags downstream).
// ────────────────────────────────────────────────────────────────────────────

function NotificationsSection() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery<NotificationPrefs>({
    queryKey: ['notificationPrefs'],
    queryFn: async () => {
      const res = await api.get('/api/v1/users/me/preferences');
      return (res.data?.data ?? res.data) as NotificationPrefs;
    },
  });

  const update = useMutation({
    mutationFn: (patch: Partial<NotificationPrefs>) =>
      api.put('/api/v1/users/me/preferences', patch).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationPrefs'] });
      toast.success('Preferences saved');
    },
    onError: (err: Error) => toast.error(err.message || 'Could not save preferences'),
  });

  if (isLoading) {
    return <SkeletonCard />;
  }
  if (isError) {
    return (
      <Card>
        <CardContent className="p-5">
          <ErrorPanel
            message="Couldn't load notification preferences."
            onRetry={() => refetch()}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4 text-primary" /> Notification preferences
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <ToggleRow
          label="New order alerts"
          sub="Buzz when a customer order is matched to your store."
          on={data?.newOrderAlerts ?? true}
          onChange={(v) => update.mutate({ newOrderAlerts: v })}
          disabled={update.isPending}
        />
        <ToggleRow
          label="Order updates"
          sub="Driver assigned, picked up and delivered events."
          on={data?.orderUpdates ?? true}
          onChange={(v) => update.mutate({ orderUpdates: v })}
          disabled={update.isPending}
        />
        <ToggleRow
          label="Cancellation alerts"
          sub="Notify when a customer cancels an accepted order."
          on={data?.rescindedAlerts ?? true}
          onChange={(v) => update.mutate({ rescindedAlerts: v })}
          disabled={update.isPending}
        />
        <ToggleRow
          label="Daily earnings summary"
          sub="Get a once-a-day total of your earnings."
          on={data?.earningsSummary ?? false}
          onChange={(v) => update.mutate({ earningsSummary: v })}
          disabled={update.isPending}
        />
        <ToggleRow
          label="Promotional updates"
          sub="Platform news, promos and feature announcements."
          on={data?.promotional ?? true}
          onChange={(v) => update.mutate({ promotional: v })}
          disabled={update.isPending}
        />
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Web Push subscription
// ────────────────────────────────────────────────────────────────────────────

type PushState = 'checking' | 'unsupported' | 'denied' | 'subscribed' | 'idle';

function PushSection() {
  const [state, setState] = useState<PushState>('checking');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!isPushSupported()) {
        if (!cancelled) setState('unsupported');
        return;
      }
      if (Notification.permission === 'denied') {
        if (!cancelled) setState('denied');
        return;
      }
      const sub = await getCurrentSubscription();
      if (cancelled) return;
      setState(sub ? 'subscribed' : 'idle');
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleEnable() {
    setBusy(true);
    try {
      const sub = await subscribeToPush();
      if (sub) {
        setState('subscribed');
        toast.success('Push notifications enabled');
      } else if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        setState('denied');
        toast.error('Push permission was denied');
      } else {
        toast.error('Could not enable push — check your browser settings');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    try {
      await unsubscribeFromPush();
      setState('idle');
      toast.success('Push notifications disabled');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {state === 'subscribed' ? (
            <Bell className="h-4 w-4 text-primary" />
          ) : (
            <BellOff className="h-4 w-4 text-primary" />
          )}{' '}
          Browser push
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {state === 'checking' ? (
          <Skeleton className="h-6 w-48" />
        ) : state === 'unsupported' ? (
          <p className="text-sm text-gray-600">
            Your browser doesn't support web push notifications. Use the mobile store-portal app
            for background alerts.
          </p>
        ) : state === 'denied' ? (
          <p className="text-sm text-gray-600">
            Push permission is currently denied. Re-enable notifications for this site in your
            browser settings, then refresh.
          </p>
        ) : state === 'subscribed' ? (
          <>
            <p className="text-sm text-gray-700">
              Push notifications are <strong>on</strong>. We'll alert you when new orders arrive,
              even when this tab is in the background.
            </p>
            <Button variant="outline" size="sm" onClick={handleDisable} disabled={busy}>
              Disable push
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-700">
              Get a desktop notification the moment a new order is matched to your store — works
              even with the tab in the background.
            </p>
            <Button onClick={handleEnable} loading={busy} className="gap-1">
              <Bell className="h-4 w-4" /> Enable push
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Delivery radius (display-only — backend uses a city-wide DeliveryZone and
// the matching engine's hard-coded 5km radius today; per-store override is
// noted in the Returned findings).
// ────────────────────────────────────────────────────────────────────────────

function DeliveryRadiusSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4 text-primary" /> Delivery radius
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <p className="font-semibold">Managed by the platform for now.</p>
            <p className="mt-1 text-amber-800">
              Customers within roughly 5 km of your pinned location see your store. Per-store
              radius overrides aren't supported yet — contact support if you need to adjust this.
              Use the location pin in your profile to make sure the geofence catches the right
              neighbourhood.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href="/profile/edit">Edit pin location</Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Account
// ────────────────────────────────────────────────────────────────────────────

function AccountSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SettingsIcon className="h-4 w-4 text-primary" /> Account & security
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <ul className="divide-y divide-gray-100">
          <RowLink
            href="/profile"
            icon={<Phone className="h-4 w-4 text-gray-500" />}
            label="Store profile"
            sub="Name, address, category and location pin."
          />
          <RowLink
            href="/change-password"
            icon={<Lock className="h-4 w-4 text-gray-500" />}
            label="Change password"
            sub="Rotate your password — recommended every few months."
          />
        </ul>
      </CardContent>
    </Card>
  );
}

function RowLink({
  href,
  icon,
  label,
  sub,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="-mx-2 flex items-center gap-3 rounded-md px-2 py-3 transition hover:bg-gray-50"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
          {icon}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">{label}</p>
          <p className="text-xs text-gray-500">{sub}</p>
        </div>
      </Link>
    </li>
  );
}

function ToggleRow({
  icon,
  label,
  sub,
  on,
  onChange,
  disabled,
}: {
  icon?: React.ReactNode;
  label: string;
  sub: string;
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      {icon ? (
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-100">
          {icon}
        </div>
      ) : null}
      <div className="flex-1">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">{sub}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
          on ? 'bg-primary' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            on ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

function SkeletonCard() {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-20 w-full" />
      </CardContent>
    </Card>
  );
}
