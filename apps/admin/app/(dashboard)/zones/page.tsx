'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';

// Leaflet uses window/document at module scope — must be client-only
const ZoneMapPicker = dynamic(() => import('@/components/ZoneMapPicker'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[320px] items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500">
      Loading map…
    </div>
  ),
});
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  X,
  Map as MapIcon,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import DataTable, { Column } from '@/components/DataTable';

interface Zone {
  id: string;
  name: string;
  city: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  baseDeliveryFee: number;
  perKmFee: number;
  commissionRate: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ZoneFormState {
  name: string;
  city: string;
  centerLat: string;
  centerLng: string;
  radiusKm: string;
  baseDeliveryFee: string;
  perKmFee: string;
  commissionRate: string;
  isActive: boolean;
}

interface ToastState {
  id: number;
  type: 'success' | 'error';
  message: string;
}

function emptyForm(): ZoneFormState {
  return {
    name: '',
    city: '',
    centerLat: '',
    centerLng: '',
    radiusKm: '',
    baseDeliveryFee: '',
    perKmFee: '',
    commissionRate: '',
    isActive: true,
  };
}

// Common Indian cities — instant lookup, no network needed. Falls back to
// OpenStreetMap Nominatim for anything not in this list (debounced).
const CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
  delhi: { lat: 28.6315, lng: 77.2167 },
  'new delhi': { lat: 28.6315, lng: 77.2167 },
  mumbai: { lat: 19.076, lng: 72.8777 },
  bangalore: { lat: 12.9716, lng: 77.5946 },
  bengaluru: { lat: 12.9716, lng: 77.5946 },
  chennai: { lat: 13.0827, lng: 80.2707 },
  kolkata: { lat: 22.5726, lng: 88.3639 },
  hyderabad: { lat: 17.385, lng: 78.4867 },
  pune: { lat: 18.5204, lng: 73.8567 },
  ahmedabad: { lat: 23.0225, lng: 72.5714 },
  jaipur: { lat: 26.9124, lng: 75.7873 },
  surat: { lat: 21.1702, lng: 72.8311 },
  lucknow: { lat: 26.8467, lng: 80.9462 },
  kanpur: { lat: 26.4499, lng: 80.3319 },
  nagpur: { lat: 21.1458, lng: 79.0882 },
  indore: { lat: 22.7196, lng: 75.8577 },
  bhopal: { lat: 23.2599, lng: 77.4126 },
  patna: { lat: 25.5941, lng: 85.1376 },
  vadodara: { lat: 22.3072, lng: 73.1812 },
  ghaziabad: { lat: 28.6692, lng: 77.4538 },
  ludhiana: { lat: 30.901, lng: 75.8573 },
  agra: { lat: 27.1767, lng: 78.0081 },
  nashik: { lat: 19.9975, lng: 73.7898 },
  faridabad: { lat: 28.4089, lng: 77.3178 },
  meerut: { lat: 28.9845, lng: 77.7064 },
  rajkot: { lat: 22.3039, lng: 70.8022 },
  varanasi: { lat: 25.3176, lng: 82.9739 },
  amritsar: { lat: 31.634, lng: 74.8723 },
  noida: { lat: 28.5355, lng: 77.391 },
  gurgaon: { lat: 28.4595, lng: 77.0266 },
  gurugram: { lat: 28.4595, lng: 77.0266 },
};

async function geocodeCity(city: string): Promise<{ lat: number; lng: number } | null> {
  // 1) Local lookup (instant)
  const key = city.trim().toLowerCase();
  if (CITY_CENTERS[key]) return CITY_CENTERS[key];

  // 2) Nominatim (OpenStreetMap) — free, no key, ~1 req/s soft limit
  try {
    const url =
      'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=' +
      encodeURIComponent(city);
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!res.ok) return null;
    const json = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!json[0]) return null;
    return { lat: parseFloat(json[0].lat), lng: parseFloat(json[0].lon) };
  } catch {
    return null;
  }
}

export default function ZonesPage() {
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Zone | null>(null);
  const [form, setForm] = useState<ZoneFormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Auto-center the map when city changes — local lookup first, then Nominatim
  // for anything not in the bundled list. Debounced so we don't spam on typing.
  // Only auto-fills when the user hasn't already pinned a location.
  useEffect(() => {
    if (!modalOpen) return;
    const city = form.city.trim();
    if (city.length < 3) return;
    // Skip if user has already pinned a location (avoid overriding manual edits)
    if (form.centerLat && form.centerLng) return;
    const handle = setTimeout(async () => {
      const center = await geocodeCity(city);
      if (!center) return;
      setForm((f) =>
        // Re-check inside the setter so a pin made during the await wins
        f.centerLat || f.centerLng
          ? f
          : {
              ...f,
              centerLat: center.lat.toFixed(6),
              centerLng: center.lng.toFixed(6),
            },
      );
    }, 600);
    return () => clearTimeout(handle);
  }, [form.city, modalOpen, form.centerLat, form.centerLng]);

  const { data, isLoading, isError } = useQuery<Zone[]>({
    queryKey: ['admin-zones'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: Zone[] }>(
        '/api/v1/admin/zones'
      );
      return res.data.data ?? [];
    },
  });

  function invalidateZones() {
    queryClient.invalidateQueries({ queryKey: ['admin-zones'] });
  }

  function sanitizePayload(payload: ZoneFormState) {
    return {
      name: payload.name.trim(),
      city: payload.city.trim(),
      centerLat: Number(payload.centerLat),
      centerLng: Number(payload.centerLng),
      radiusKm: Number(payload.radiusKm),
      baseDeliveryFee: Number(payload.baseDeliveryFee),
      perKmFee: Number(payload.perKmFee),
      commissionRate: Number(payload.commissionRate),
      isActive: payload.isActive,
    };
  }

  const createMutation = useMutation({
    mutationFn: async (payload: ZoneFormState) => {
      const res = await api.post<{ success: boolean; data: Zone }>(
        '/api/v1/admin/zones',
        sanitizePayload(payload)
      );
      return res.data.data;
    },
    onSuccess: () => {
      invalidateZones();
      setToast({ id: Date.now(), type: 'success', message: 'Zone created.' });
      closeModal();
    },
    onError: (err: unknown) => handleMutationError(err, 'create'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: ZoneFormState }) => {
      const res = await api.put<{ success: boolean; data: Zone }>(
        `/api/v1/admin/zones/${id}`,
        sanitizePayload(payload)
      );
      return res.data.data;
    },
    onSuccess: () => {
      invalidateZones();
      setToast({ id: Date.now(), type: 'success', message: 'Zone updated.' });
      closeModal();
    },
    onError: (err: unknown) => handleMutationError(err, 'update'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/v1/admin/zones/${id}`);
    },
    onSuccess: () => {
      invalidateZones();
      setToast({ id: Date.now(), type: 'success', message: 'Zone deleted.' });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setToast({
        id: Date.now(),
        type: 'error',
        message: e?.response?.data?.error?.message ?? 'Failed to delete zone.',
      });
    },
  });

  function handleMutationError(err: unknown, kind: 'create' | 'update') {
    const e = err as {
      response?: { status?: number; data?: { error?: { message?: string } } };
    };
    const status = e?.response?.status;
    const message = e?.response?.data?.error?.message;
    if (status === 409) {
      setFormError(message ?? 'Zone with this name already exists.');
      return;
    }
    setFormError(message ?? `Failed to ${kind} zone.`);
  }

  function openCreateModal() {
    setEditing(null);
    setForm(emptyForm());
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(z: Zone) {
    setEditing(z);
    setForm({
      name: z.name,
      city: z.city,
      centerLat: String(z.centerLat),
      centerLng: String(z.centerLng),
      radiusKm: String(z.radiusKm),
      baseDeliveryFee: String(z.baseDeliveryFee),
      perKmFee: String(z.perKmFee),
      commissionRate: String(z.commissionRate),
      isActive: z.isActive,
    });
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setFormError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!form.name.trim()) {
      setFormError('Name is required.');
      return;
    }
    if (!form.city.trim()) {
      setFormError('City is required.');
      return;
    }

    const numericFields: { key: keyof ZoneFormState; label: string }[] = [
      { key: 'centerLat', label: 'Center latitude' },
      { key: 'centerLng', label: 'Center longitude' },
      { key: 'radiusKm', label: 'Radius (km)' },
      { key: 'baseDeliveryFee', label: 'Base delivery fee' },
      { key: 'perKmFee', label: 'Per-km fee' },
      { key: 'commissionRate', label: 'Commission rate' },
    ];

    for (const f of numericFields) {
      const v = form[f.key];
      if (typeof v !== 'string' || v.trim() === '' || Number.isNaN(Number(v))) {
        setFormError(`${f.label} is required.`);
        return;
      }
    }

    if (Number(form.commissionRate) < 0 || Number(form.commissionRate) > 1) {
      setFormError('Commission rate must be between 0 and 1 (e.g. 0.1 for 10%).');
      return;
    }

    if (editing) {
      updateMutation.mutate({ id: editing.id, payload: form });
    } else {
      createMutation.mutate(form);
    }
  }

  function handleDelete(z: Zone) {
    const confirmed = window.confirm(
      `Delete zone "${z.name}"? This cannot be undone.`
    );
    if (!confirmed) return;
    deleteMutation.mutate(z.id);
  }

  const zones = data ?? [];
  const total = zones.length;

  const columns: Column<Zone>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'Name',
        render: (z) => <span className="font-medium text-gray-900">{z.name}</span>,
      },
      {
        key: 'city',
        header: 'City',
        render: (z) => <span className="text-gray-700">{z.city}</span>,
      },
      {
        key: 'center',
        header: 'Center',
        render: (z) => (
          <span className="font-mono text-xs text-gray-600 tabular-nums">
            {z.centerLat.toFixed(5)}, {z.centerLng.toFixed(5)}
          </span>
        ),
      },
      {
        key: 'radius',
        header: 'Radius (km)',
        render: (z) => (
          <span className="text-gray-700 tabular-nums">{z.radiusKm}</span>
        ),
      },
      {
        key: 'baseFee',
        header: 'Base fee (₹)',
        render: (z) => (
          <span className="text-gray-700 tabular-nums">
            ₹{z.baseDeliveryFee.toLocaleString('en-IN')}
          </span>
        ),
      },
      {
        key: 'perKmFee',
        header: 'Per-km fee (₹)',
        render: (z) => (
          <span className="text-gray-700 tabular-nums">
            ₹{z.perKmFee.toLocaleString('en-IN')}
          </span>
        ),
      },
      {
        key: 'commission',
        header: 'Commission %',
        render: (z) => (
          <span className="text-gray-700 tabular-nums">
            {(z.commissionRate * 100).toFixed(1)}%
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (z) => (
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
              z.isActive
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-gray-100 text-gray-500 border-gray-200'
            }`}
          >
            {z.isActive ? 'Active' : 'Inactive'}
          </span>
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        render: (z) => (
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                openEditModal(z);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(z);
              }}
              disabled={deleteMutation.isPending}
              className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Delete
            </button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deleteMutation.isPending]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Delivery Zones</h1>
          <p className="mt-1 text-sm text-gray-500">
            Configure service areas, pricing and commissions
            {!isLoading &&
              ` • ${total.toLocaleString('en-IN')} ${total === 1 ? 'zone' : 'zones'}`}
          </p>
        </div>
        <button onClick={openCreateModal} className="btn-primary">
          <Plus className="mr-1.5 h-4 w-4" />
          Create zone
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <DataTable
          columns={columns}
          rows={zones}
          isLoading={isLoading}
          isError={isError}
          emptyMessage="No delivery zones yet. Click 'Create zone' to add one."
        />
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center overflow-y-auto bg-gray-900/50 sm:items-center sm:p-4">
          <div className="card flex w-full max-w-2xl flex-col rounded-none p-4 sm:rounded-lg sm:p-6">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <MapIcon className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-gray-900">
                  {editing ? 'Edit zone' : 'Create zone'}
                </h2>
              </div>
              <button
                onClick={closeModal}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    required
                    maxLength={80}
                    placeholder="e.g. South Mumbai"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    City <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={form.city}
                    onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                    required
                    maxLength={80}
                    placeholder="e.g. Mumbai"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Pin zone center on map
                </label>
                <p className="mb-2 text-xs text-gray-500">
                  Click anywhere or drag the marker. The green circle shows the
                  delivery radius.
                </p>
                <ZoneMapPicker
                  lat={Number(form.centerLat) || 28.6315}
                  lng={Number(form.centerLng) || 77.2167}
                  radiusKm={Number(form.radiusKm) || 5}
                  onChange={({ lat, lng }) =>
                    setForm((f) => ({
                      ...f,
                      centerLat: String(lat.toFixed(6)),
                      centerLng: String(lng.toFixed(6)),
                    }))
                  }
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Center latitude <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    className="input"
                    value={form.centerLat}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, centerLat: e.target.value }))
                    }
                    required
                    placeholder="28.6315"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Center longitude <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    className="input"
                    value={form.centerLng}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, centerLng: e.target.value }))
                    }
                    required
                    placeholder="77.2167"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Radius (km) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    className="input"
                    value={form.radiusKm}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, radiusKm: e.target.value }))
                    }
                    required
                    placeholder="5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Base delivery fee (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input"
                    value={form.baseDeliveryFee}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, baseDeliveryFee: e.target.value }))
                    }
                    required
                    placeholder="20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Per-km fee (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input"
                    value={form.perKmFee}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, perKmFee: e.target.value }))
                    }
                    required
                    placeholder="5"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Commission rate (0–1) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    max="1"
                    className="input"
                    value={form.commissionRate}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, commissionRate: e.target.value }))
                    }
                    required
                    placeholder="0.1"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  checked={form.isActive}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, isActive: e.target.checked }))
                  }
                />
                Active (matching is enabled in this zone)
              </label>

              {formError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="btn-secondary"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  )}
                  {editing ? 'Save changes' : 'Create zone'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <div
            className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg ${
              toast.type === 'success'
                ? 'border-green-200 bg-white text-green-800'
                : 'border-red-200 bg-white text-red-800'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 text-red-600" />
            )}
            <span>{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="ml-2 text-gray-400 hover:text-gray-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
