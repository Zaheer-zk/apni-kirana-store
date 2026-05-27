'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, MapPin } from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Card, CardContent } from '@aks/ui/components/card';
import { toast } from '@aks/ui/components/sonner';
import { api } from '@/lib/api';

// Multi-select chip picker for the driver's serving zones. Backed by:
//   GET  /api/v1/zones            — list of active platform zones (public)
//   GET  /api/v1/drivers/me/zones — current selection
//   PUT  /api/v1/drivers/me/zones — replace { zoneIds }
// Empty selection means "serve city-wide" (backward compat for old drivers).

type Zone = {
  id: string;
  name: string;
  city: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  isActive: boolean;
};

function unwrap<T>(res: { data: { success?: boolean; data?: T } }): T {
  return (res.data?.data ?? (res.data as unknown as T)) as T;
}

export function ServingZones() {
  const queryClient = useQueryClient();

  const allZones = useQuery({
    queryKey: ['zones', 'public'],
    queryFn: async () => unwrap<Zone[]>(await api.get('/api/v1/zones')),
  });

  const myZones = useQuery({
    queryKey: ['drivers', 'me', 'zones'],
    queryFn: async () => unwrap<Zone[]>(await api.get('/api/v1/drivers/me/zones')),
  });

  const [pending, setPending] = useState<Set<string> | null>(null);
  // Source of truth: pending edits if user is mid-change, else the saved set.
  const selected = useMemo(() => {
    if (pending !== null) return pending;
    return new Set((myZones.data ?? []).map((z) => z.id));
  }, [pending, myZones.data]);

  const dirty = pending !== null;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      return api.put('/api/v1/drivers/me/zones', { zoneIds: ids });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers', 'me', 'zones'] });
      setPending(null);
      toast.success(
        selected.size === 0
          ? 'Service zones cleared — you can receive orders city-wide.'
          : `Updated — you'll get offers from ${selected.size} zone(s).`,
      );
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not save zones'),
  });

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPending(next);
  }

  function reset() {
    setPending(null);
  }

  // Group zones by city for cleaner UX in multi-city deployments.
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

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 h-5 w-5 text-gray-500" />
          <div>
            <p className="text-sm font-semibold text-gray-900">Serving zones</p>
            <p className="text-xs text-gray-500">
              Tap to select the zones you want orders from. Leave empty to receive
              any nearby order in the city.
            </p>
          </div>
        </div>

        {allZones.isLoading || myZones.isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          </div>
        ) : byCity.length === 0 ? (
          <p className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500">
            No zones configured yet. You&apos;ll receive any nearby order until admin sets up zones.
          </p>
        ) : (
          <div className="space-y-3">
            {byCity.map(([city, zones]) => (
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
            ))}
          </div>
        )}

        {dirty ? (
          <div className="flex items-center justify-between border-t border-gray-100 pt-3">
            <span className="text-xs text-gray-500">
              {selected.size === 0
                ? 'Will save: city-wide (no zone restriction)'
                : `Will save: ${selected.size} zone(s)`}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={reset} disabled={saveMutation.isPending}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
                Save
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
