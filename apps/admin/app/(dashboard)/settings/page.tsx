'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Save,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Truck,
  Coins,
  Map as MapIcon,
  Clock,
  RotateCcw,
  Radio,
  Workflow,
} from 'lucide-react';
import { api } from '@/lib/api';

type MatchingMode = 'BROADCAST' | 'CASCADE';

interface PlatformSettings {
  baseDeliveryFee: number;
  perKmFee: number;
  commissionPercent: number;
  deliveryRadiusKm: number;
  storeAcceptTimeoutMinutes: number;
  driverAcceptTimeoutSeconds: number;
  storeMatchingMode: MatchingMode;
  driverMatchingMode: MatchingMode;
}

const DEFAULTS: PlatformSettings = {
  baseDeliveryFee: 30,
  perKmFee: 5,
  commissionPercent: 10,
  deliveryRadiusKm: 5,
  storeAcceptTimeoutMinutes: 3,
  driverAcceptTimeoutSeconds: 60,
  storeMatchingMode: 'BROADCAST',
  driverMatchingMode: 'BROADCAST',
};

// parseFloat('') is NaN, which React treats as undefined and flips a
// controlled input to uncontrolled. Collapse '' and NaN to 0 so the input
// always has a defined value.
function parseNumber(raw: string): number {
  if (raw === '') return 0;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

function NumberField({
  id,
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
  prefix,
  suffix,
}: {
  id: string;
  label: string;
  hint: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
      </label>
      <div className="relative">
        {prefix ? (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
            {prefix}
          </span>
        ) : null}
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseNumber(e.target.value))}
          className={`input ${prefix ? 'pl-7' : ''} ${suffix ? 'pr-8' : ''}`}
        />
        {suffix ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
            {suffix}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-xs text-gray-400">{hint}</p>
    </div>
  );
}

function ModeRadio({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: MatchingMode;
  onChange: (m: MatchingMode) => void;
}) {
  const opts: { v: MatchingMode; title: string; sub: string; icon: React.ReactNode }[] = [
    {
      v: 'BROADCAST',
      title: 'Broadcast',
      sub: 'Notify top candidates in parallel — first to accept wins.',
      icon: <Radio className="h-4 w-4" />,
    },
    {
      v: 'CASCADE',
      title: 'Cascade',
      sub: 'Offer to the best one first; on timeout/decline, try the next.',
      icon: <Workflow className="h-4 w-4" />,
    },
  ];
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {opts.map((o) => {
          const selected = value === o.v;
          return (
            <button
              key={o.v}
              type="button"
              onClick={() => onChange(o.v)}
              className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                selected
                  ? 'border-primary bg-primary-50'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}
            >
              <span
                className={`mt-0.5 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${
                  selected ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {o.icon}
              </span>
              <span>
                <span
                  className={`block text-sm font-semibold ${
                    selected ? 'text-primary' : 'text-gray-900'
                  }`}
                >
                  {o.title}
                </span>
                <span className="mt-0.5 block text-xs text-gray-500">{o.sub}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-gray-400">{hint}</p>
    </div>
  );
}

function SectionCard({
  title,
  icon,
  description,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="border-b border-gray-100 px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          {icon}
          {title}
        </h2>
        <p className="mt-0.5 text-xs text-gray-500">{description}</p>
      </div>
      <div className="space-y-5 p-5">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PlatformSettings>(DEFAULTS);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<PlatformSettings>({
    queryKey: ['admin-settings'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: PlatformSettings }>(
        '/api/v1/admin/settings',
      );
      // Defensive: always return a fully-populated object so every input
      // stays controlled even if the API drops a field.
      return { ...DEFAULTS, ...(res.data?.data ?? {}) };
    },
  });

  useEffect(() => {
    if (data) setForm((prev) => ({ ...prev, ...data }));
  }, [data]);

  const mutation = useMutation({
    mutationFn: async (settings: PlatformSettings) => {
      const res = await api.put<{ success: boolean; data: PlatformSettings }>(
        '/api/v1/admin/settings',
        settings,
      );
      return res.data.data;
    },
    onSuccess: (saved) => {
      setSavedAt(Date.now());
      // Hydrate form with the persisted values (DB-normalised).
      setForm((prev) => ({ ...prev, ...saved }));
      queryClient.setQueryData(['admin-settings'], saved);
      // Auto-clear the green pill after 3s
      setTimeout(() => setSavedAt(null), 3000);
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate(form);
  }

  function setField<K extends keyof PlatformSettings>(key: K, val: PlatformSettings[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  const dirty =
    !!data &&
    (Object.keys(form) as (keyof PlatformSettings)[]).some((k) => form[k] !== data[k]);

  function reset() {
    if (data) setForm(data);
  }

  // Live preview of how a 3 km, ₹500 order is priced under the current form.
  const previewDistance = 3;
  const previewSubtotal = 500;
  const previewDelivery = form.baseDeliveryFee + form.perKmFee * previewDistance;
  const previewCommission = (form.commissionPercent / 100) * previewSubtotal;
  const previewTotal = previewSubtotal + previewDelivery;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 rounded shimmer" />
        <div className="h-4 w-72 rounded shimmer" />
        <div className="card h-64 mt-6" />
        <div className="card h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform settings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Pricing, search radius, accept timeouts and matching mode. Changes apply
            within seconds — no redeploy needed.
          </p>
        </div>
        {data ? (
          <p className="text-xs text-gray-400">
            Last saved{' '}
            {data && 'updatedAt' in (data as object)
              ? new Date(
                  (data as PlatformSettings & { updatedAt?: string }).updatedAt ?? '',
                ).toLocaleString('en-IN')
              : '—'}
          </p>
        ) : null}
      </div>

      {isError ? (
        <div className="card flex items-center gap-3 border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4" />
          Couldn&apos;t load settings.{' '}
          <button onClick={() => refetch()} className="underline">
            Retry
          </button>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <SectionCard
            title="Pricing"
            icon={<Coins className="h-4 w-4 text-primary" />}
            description="Used to compute the delivery fee and commission on every new order."
          >
            <NumberField
              id="baseDeliveryFee"
              label="Base delivery fee"
              hint="Flat amount added to every order before per-km charges."
              value={form.baseDeliveryFee}
              onChange={(v) => setField('baseDeliveryFee', v)}
              min={0}
              max={1000}
              step={1}
              prefix="₹"
            />
            <NumberField
              id="perKmFee"
              label="Per-km fee"
              hint="Multiplied by the haversine distance between store and dropoff."
              value={form.perKmFee}
              onChange={(v) => setField('perKmFee', v)}
              min={0}
              max={500}
              step={0.5}
              prefix="₹"
            />
            <NumberField
              id="commissionPercent"
              label="Platform commission"
              hint="Percentage of the order subtotal retained by the platform."
              value={form.commissionPercent}
              onChange={(v) => setField('commissionPercent', v)}
              min={0}
              max={50}
              step={0.5}
              suffix="%"
            />
          </SectionCard>

          <SectionCard
            title="Coverage"
            icon={<MapIcon className="h-4 w-4 text-primary" />}
            description="How far we search when matching a store to an order."
          >
            <NumberField
              id="deliveryRadiusKm"
              label="Delivery radius"
              hint="Initial search radius. If no store within radius carries the items, we fall back city-wide."
              value={form.deliveryRadiusKm}
              onChange={(v) => setField('deliveryRadiusKm', v)}
              min={0.5}
              max={50}
              step={0.5}
              suffix="km"
            />
          </SectionCard>

          <SectionCard
            title="Timeouts"
            icon={<Clock className="h-4 w-4 text-primary" />}
            description="How long stores and drivers have to accept an offer before we retry."
          >
            <NumberField
              id="storeAcceptTimeoutMinutes"
              label="Store accept window"
              hint="If no candidate accepts within this window, the order falls back to a wider set or admin rescue."
              value={form.storeAcceptTimeoutMinutes}
              onChange={(v) => setField('storeAcceptTimeoutMinutes', Math.round(v))}
              min={1}
              max={60}
              step={1}
              suffix="min"
            />
            <NumberField
              id="driverAcceptTimeoutSeconds"
              label="Driver accept window"
              hint="Per-driver window in cascade mode; doubled before re-broadcasting in broadcast mode."
              value={form.driverAcceptTimeoutSeconds}
              onChange={(v) => setField('driverAcceptTimeoutSeconds', Math.round(v))}
              min={15}
              max={600}
              step={5}
              suffix="sec"
            />
          </SectionCard>

          <SectionCard
            title="Matching mode"
            icon={<Truck className="h-4 w-4 text-primary" />}
            description="Broadcast offers to many in parallel, or cascade to the best one at a time."
          >
            <ModeRadio
              label="Stores"
              hint="Broadcast is faster but more disruptive. Cascade preserves first-priority for the top match."
              value={form.storeMatchingMode}
              onChange={(m) => setField('storeMatchingMode', m)}
            />
            <ModeRadio
              label="Drivers"
              hint="Same trade-off as stores. Most operators run both in broadcast for speed."
              value={form.driverMatchingMode}
              onChange={(m) => setField('driverMatchingMode', m)}
            />
          </SectionCard>
        </div>

        {/* Live preview */}
        <div className="card">
          <div className="border-b border-gray-100 px-5 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Live preview · 3&nbsp;km order of ₹{previewSubtotal}
            </p>
          </div>
          <div className="grid grid-cols-2 divide-x divide-gray-100 sm:grid-cols-4">
            <div className="px-5 py-4">
              <p className="text-xs text-gray-400">Subtotal</p>
              <p className="text-base font-semibold text-gray-900">
                ₹{previewSubtotal.toFixed(2)}
              </p>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-gray-400">Delivery fee</p>
              <p className="text-base font-semibold text-gray-900">
                ₹{previewDelivery.toFixed(2)}
              </p>
              <p className="mt-0.5 text-[11px] text-gray-400">
                ₹{form.baseDeliveryFee} + {previewDistance}×₹{form.perKmFee}
              </p>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-gray-400">Commission</p>
              <p className="text-base font-semibold text-gray-900">
                ₹{previewCommission.toFixed(2)}
              </p>
              <p className="mt-0.5 text-[11px] text-gray-400">
                {form.commissionPercent}% of subtotal
              </p>
            </div>
            <div className="bg-gray-50 px-5 py-4">
              <p className="text-xs text-gray-400">Customer pays</p>
              <p className="text-lg font-bold text-gray-900">₹{previewTotal.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {mutation.isError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {mutation.error instanceof Error
              ? mutation.error.message
              : 'Failed to save settings. Please try again.'}
          </div>
        ) : null}

        <div className="sticky bottom-0 z-10 -mx-4 mt-2 flex flex-wrap items-center gap-3 border-t border-gray-100 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border sm:px-5">
          <button
            type="submit"
            disabled={mutation.isPending || !dirty}
            className="btn-primary"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save changes
              </>
            )}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={!dirty || mutation.isPending}
            className="btn-secondary"
          >
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            Discard
          </button>
          {dirty ? (
            <span className="text-xs text-amber-600">You have unsaved changes</span>
          ) : null}
          {savedAt ? (
            <span className="ml-auto inline-flex items-center gap-1.5 text-sm text-emerald-600">
              <CheckCircle className="h-4 w-4" />
              Saved
            </span>
          ) : null}
        </div>
      </form>
    </div>
  );
}
