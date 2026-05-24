'use client';

import { useState, FormEvent } from 'react';
import dynamic from 'next/dynamic';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@aks/shared';

// Leaflet uses window/document at module scope — must be client-only
const LocationMap = dynamic(() => import('@/components/LocationMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[280px] items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500">
      Loading map…
    </div>
  ),
});

/** The subset of store fields an admin can edit via PUT /admin/stores/:id. */
export interface EditableStore {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  lat: number;
  lng: number;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  openTime?: string | null;
  closeTime?: string | null;
}

const CATEGORIES = [
  { value: 'GROCERY', label: 'Grocery' },
  { value: 'PHARMACY', label: 'Pharmacy' },
  { value: 'GENERAL', label: 'General' },
  { value: 'RESTAURANT', label: 'Restaurant' },
];

interface Props {
  store: EditableStore;
  onClose: () => void;
}

/** Modal for an admin to edit a store's details. */
export default function StoreEditModal({ store, onClose }: Props) {
  const queryClient = useQueryClient();

  const [name, setName] = useState(store.name ?? '');
  const [description, setDescription] = useState(store.description ?? '');
  const [category, setCategory] = useState(store.category ?? 'GROCERY');
  const [lat, setLat] = useState(store.lat != null ? String(store.lat) : '');
  const [lng, setLng] = useState(store.lng != null ? String(store.lng) : '');
  const [street, setStreet] = useState(store.street ?? '');
  const [city, setCity] = useState(store.city ?? '');
  const [state, setState] = useState(store.state ?? '');
  const [pincode, setPincode] = useState(store.pincode ?? '');
  const [openTime, setOpenTime] = useState(store.openTime ?? '');
  const [closeTime, setCloseTime] = useState(store.closeTime ?? '');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      // Build a partial payload — only send fields the admin actually filled in
      // so blank inputs don't wipe existing values.
      const body: Record<string, unknown> = {};
      if (name.trim()) body.name = name.trim();
      if (description.trim()) body.description = description.trim();
      if (category) body.category = category;
      if (lat.trim()) body.lat = Number(lat);
      if (lng.trim()) body.lng = Number(lng);
      if (street.trim()) body.street = street.trim();
      if (city.trim()) body.city = city.trim();
      if (state.trim()) body.state = state.trim();
      if (pincode.trim()) body.pincode = pincode.trim();
      if (openTime.trim()) body.openTime = openTime.trim();
      if (closeTime.trim()) body.closeTime = closeTime.trim();

      const { data } = await api.put<ApiResponse<unknown>>(
        `/api/v1/admin/stores/${store.id}`,
        body,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-store', store.id] });
      queryClient.invalidateQueries({ queryKey: ['admin-stores'] });
      onClose();
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: ApiResponse<unknown> } })?.response?.data?.error ??
          (err as Error)?.message ??
          'Something went wrong.',
      );
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Name is required.');
    if (lat.trim() && Number.isNaN(Number(lat))) return setError('Latitude must be a number.');
    if (lng.trim() && Number.isNaN(Number(lng))) return setError('Longitude must be a number.');
    if (pincode.trim() && !/^\d{6}$/.test(pincode.trim())) {
      return setError('Pincode must be exactly 6 digits.');
    }
    if (openTime.trim() && !/^\d{2}:\d{2}$/.test(openTime.trim())) {
      return setError('Open time must be in HH:MM format.');
    }
    if (closeTime.trim() && !/^\d{2}:\d{2}$/.test(closeTime.trim())) {
      return setError('Close time must be in HH:MM format.');
    }
    mutation.mutate();
  }

  return (
    <Shell title="Edit store" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Store name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Description">
          <textarea
            className="input"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description"
          />
        </Field>
        <Field label="Category">
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Location">
          <LocationMap
            lat={Number(lat)}
            lng={Number(lng)}
            onChange={(nextLat, nextLng) => {
              setLat(String(Number(nextLat.toFixed(6))));
              setLng(String(Number(nextLng.toFixed(6))));
            }}
          />
          <p className="mt-1.5 text-xs text-gray-400">
            Tap or drag the marker, or paste coordinates below.
          </p>
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Latitude">
            <input
              className="input"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="28.616"
            />
          </Field>
          <Field label="Longitude">
            <input
              className="input"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="77.209"
            />
          </Field>
        </div>

        <Field label="Street">
          <input className="input" value={street} onChange={(e) => setStreet(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="City">
            <input className="input" value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label="State">
            <input className="input" value={state} onChange={(e) => setState(e.target.value)} />
          </Field>
        </div>
        <Field label="Pincode">
          <input
            className="input"
            value={pincode}
            onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6-digit pincode"
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Open time (HH:MM)">
            <input
              className="input"
              value={openTime}
              onChange={(e) => setOpenTime(e.target.value)}
              placeholder="09:00"
            />
          </Field>
          <Field label="Close time (HH:MM)">
            <input
              className="input"
              value={closeTime}
              onChange={(e) => setCloseTime(e.target.value)}
              placeholder="21:00"
            />
          </Field>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
          <button type="submit" disabled={mutation.isPending} className="btn-primary flex-1">
            {mutation.isPending ? (
              <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            ) : (
              'Save changes'
            )}
          </button>
        </div>
      </form>
    </Shell>
  );
}

function Shell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center overflow-y-auto bg-black/40 sm:items-center sm:p-4">
      <div className="w-full max-h-screen overflow-y-auto rounded-none bg-white p-4 shadow-xl sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}
