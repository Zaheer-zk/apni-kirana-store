'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Save, Loader2, CheckCircle } from 'lucide-react';
import { api } from '@/lib/api';
import {
  BASE_DELIVERY_FEE,
  PER_KM_DELIVERY_FEE,
  COMMISSION_PERCENT,
  DEFAULT_STORE_RADIUS_KM,
  MAX_STORE_RADIUS_KM,
} from '@aks/shared';

interface PlatformSettings {
  deliveryRadiusKm: number;
  baseDeliveryFee: number;
  perKmFee: number;
  commissionPercent: number;
}

export default function SettingsPage() {
  const [form, setForm] = useState<PlatformSettings>({
    deliveryRadiusKm: DEFAULT_STORE_RADIUS_KM,
    baseDeliveryFee: BASE_DELIVERY_FEE,
    perKmFee: PER_KM_DELIVERY_FEE,
    commissionPercent: COMMISSION_PERCENT * 100,
  });
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery<PlatformSettings>({
    queryKey: ['admin-settings'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: PlatformSettings }>(
        '/api/v1/admin/settings'
      );
      return res.data.data!;
    },
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const mutation = useMutation({
    mutationFn: (settings: PlatformSettings) =>
      api.put('/api/v1/admin/settings', settings),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate(form);
  }

  function setField<K extends keyof PlatformSettings>(key: K, val: PlatformSettings[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Configure platform-wide delivery and commission rules</p>
      </div>

      <div className="card max-w-2xl">
        {isLoading ? (
          <div className="p-8 space-y-6 animate-pulse">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-40 rounded bg-gray-200" />
                <div className="h-10 rounded bg-gray-100" />
              </div>
            ))}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-8 space-y-7">
            {/* Delivery Radius */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">
                  Delivery Radius
                </label>
                <span className="text-sm font-semibold text-primary">
                  {form.deliveryRadiusKm} km
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={MAX_STORE_RADIUS_KM}
                step={0.5}
                value={form.deliveryRadiusKm}
                onChange={(e) => setField('deliveryRadiusKm', parseFloat(e.target.value))}
                className="w-full h-2 rounded-full appearance-none bg-gray-200 accent-primary cursor-pointer"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>1 km</span>
                <span>{MAX_STORE_RADIUS_KM} km</span>
              </div>
              <p className="mt-1.5 text-xs text-gray-400">
                Radius within which customers can discover a store.
              </p>
            </div>

            {/* Base Delivery Fee */}
            <div>
              <label htmlFor="baseDeliveryFee" className="block mb-1.5 text-sm font-medium text-gray-700">
                Base Delivery Fee (₹)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                <input
                  id="baseDeliveryFee"
                  type="number"
                  min={0}
                  step={1}
                  value={form.baseDeliveryFee}
                  onChange={(e) => setField('baseDeliveryFee', parseFloat(e.target.value))}
                  className="input pl-7"
                />
              </div>
              <p className="mt-1.5 text-xs text-gray-400">
                Flat fee charged on every order before per-km charges.
              </p>
            </div>

            {/* Per-km Fee */}
            <div>
              <label htmlFor="perKmFee" className="block mb-1.5 text-sm font-medium text-gray-700">
                Per-km Delivery Fee (₹ / km)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                <input
                  id="perKmFee"
                  type="number"
                  min={0}
                  step={0.5}
                  value={form.perKmFee}
                  onChange={(e) => setField('perKmFee', parseFloat(e.target.value))}
                  className="input pl-7"
                />
              </div>
              <p className="mt-1.5 text-xs text-gray-400">
                Additional fee per kilometre of delivery distance.
              </p>
            </div>

            {/* Commission */}
            <div>
              <label htmlFor="commission" className="block mb-1.5 text-sm font-medium text-gray-700">
                Platform Commission (%)
              </label>
              <div className="relative">
                <input
                  id="commission"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={form.commissionPercent}
                  onChange={(e) => setField('commissionPercent', parseFloat(e.target.value))}
                  className="input pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
              </div>
              <p className="mt-1.5 text-xs text-gray-400">
                Percentage of order subtotal retained as platform commission.
              </p>
            </div>

            {/* Summary */}
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-sm">
              <p className="font-medium text-gray-700 mb-2">Fee preview for a 3 km order of ₹500:</p>
              <div className="space-y-1 text-gray-500">
                <div className="flex justify-between">
                  <span>Base fee</span>
                  <span>₹{form.baseDeliveryFee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Distance (3 km × ₹{form.perKmFee})</span>
                  <span>₹{(form.perKmFee * 3).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Commission ({form.commissionPercent}% of ₹500)</span>
                  <span>₹{((form.commissionPercent / 100) * 500).toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-1 font-semibold text-gray-800">
                  <span>Total delivery fee</span>
                  <span>₹{(form.baseDeliveryFee + form.perKmFee * 3).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Error */}
            {mutation.isError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                Failed to save settings. Please try again.
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-4 pt-2">
              <button type="submit" disabled={mutation.isPending} className="btn-primary">
                {mutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Settings
                  </>
                )}
              </button>

              {saved && (
                <span className="inline-flex items-center gap-1.5 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  Saved successfully
                </span>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
