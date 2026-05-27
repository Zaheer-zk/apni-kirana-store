'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, X } from 'lucide-react';
import { api } from '@/lib/api';

// Admin-side override for a driver's serving zones. Pre-loads the driver's
// current selection, lets admin add/remove via chip toggles, replaces the
// full set on Save (matches the backend PUT /admin/drivers/:id/zones
// semantics). Mirrors the driver-web ServingZones picker for parity.

interface Zone {
  id: string;
  name: string;
  city: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  isActive: boolean;
}

interface Props {
  driverId: string;
  driverName: string;
  onClose: () => void;
}

function unwrap<T>(res: { data: { success?: boolean; data?: T } }): T {
  return (res.data?.data ?? (res.data as unknown as T)) as T;
}

export default function DriverZonesModal({ driverId, driverName, onClose }: Props) {
  const queryClient = useQueryClient();

  const allZones = useQuery({
    queryKey: ['admin', 'zones'],
    queryFn: async () => unwrap<Zone[]>(await api.get('/api/v1/admin/zones')),
  });

  const current = useQuery({
    queryKey: ['admin', 'drivers', driverId, 'zones'],
    queryFn: async () => unwrap<Zone[]>(await api.get(`/api/v1/admin/drivers/${driverId}/zones`)),
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Seed selection from the driver's current zones once they load.
  useEffect(() => {
    if (current.data) setSelected(new Set(current.data.map((z) => z.id)));
  }, [current.data]);

  const save = useMutation({
    mutationFn: async () => {
      return api.put(`/api/v1/admin/drivers/${driverId}/zones`, {
        zoneIds: Array.from(selected),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'drivers', driverId, 'zones'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'drivers'] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to update zones'),
  });

  // Group by city for cleaner UX in multi-city deployments.
  const byCity = useMemo(() => {
    const map = new Map<string, Zone[]>();
    for (const z of allZones.data ?? []) {
      if (!z.isActive) continue;
      const list = map.get(z.city) ?? [];
      list.push(z);
      map.set(z.city, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [allZones.data]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  const loading = allZones.isLoading || current.isLoading;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 px-4 py-6 sm:items-center">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Serving zones</h2>
            <p className="text-xs text-gray-500">Override for {driverName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : byCity.length === 0 ? (
            <p className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500">
              No zones configured yet. Create zones from the <strong>Zones</strong> page first.
            </p>
          ) : (
            byCity.map(([city, zones]) => (
              <div key={city}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {city}
                </p>
                <div className="flex flex-wrap gap-2">
                  {zones.map((z) => {
                    const on = selected.has(z.id);
                    return (
                      <button
                        type="button"
                        key={z.id}
                        onClick={() => toggle(z.id)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          on
                            ? 'border-primary bg-primary text-white shadow-sm'
                            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {on ? <Check className="h-3 w-3" /> : null}
                        {z.name}
                        <span className={`ml-1 text-[10px] ${on ? 'text-white/70' : 'text-gray-400'}`}>
                          {z.radiusKm}km
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {error ? (
          <div className="mx-5 mb-3 rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {error}
          </div>
        ) : null}

        <footer className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
          <span className="text-xs text-gray-500">
            {selected.size === 0
              ? '⚠ Saves as: no zones (driver stops receiving offers)'
              : `${selected.size} zone(s) selected`}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                save.mutate();
              }}
              disabled={save.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save zones
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
