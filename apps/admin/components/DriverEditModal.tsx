'use client';

import { useState, FormEvent } from 'react';
import dynamic from 'next/dynamic';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Loader2, MapPin } from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@aks/shared';

// Leaflet uses window/document at module scope — must be client-only
const LocationMap = dynamic(() => import('@/components/LocationMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[240px] items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500">
      Loading map…
    </div>
  ),
});

/** The subset of driver fields an admin can edit via PUT /admin/drivers/:id. */
export interface EditableDriver {
  id: string;
  name: string;
  vehicleType: string;
  vehicleNumber: string;
  licenseNumber?: string | null;
  /** Last-known GPS location — nullable, read-only. */
  currentLat?: number | null;
  currentLng?: number | null;
}

const VEHICLE_TYPES = [
  { value: 'BIKE', label: 'Bike' },
  { value: 'SCOOTER', label: 'Scooter' },
  { value: 'CAR', label: 'Car' },
];

interface Props {
  driver: EditableDriver;
  onClose: () => void;
}

/** Modal for an admin to edit a driver's vehicle details. */
export default function DriverEditModal({ driver, onClose }: Props) {
  const queryClient = useQueryClient();

  const [vehicleType, setVehicleType] = useState(driver.vehicleType || 'BIKE');
  const [vehicleNumber, setVehicleNumber] = useState(driver.vehicleNumber ?? '');
  const [licenseNumber, setLicenseNumber] = useState(driver.licenseNumber ?? '');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {};
      if (vehicleType) body.vehicleType = vehicleType;
      if (vehicleNumber.trim()) body.vehicleNumber = vehicleNumber.trim();
      if (licenseNumber.trim()) body.licenseNumber = licenseNumber.trim();

      const { data } = await api.put<ApiResponse<unknown>>(
        `/api/v1/admin/drivers/${driver.id}`,
        body,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-drivers'], refetchType: 'all' });
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
    if (!vehicleNumber.trim()) return setError('Vehicle number is required.');
    mutation.mutate();
  }

  return (
    <Shell title={`Edit ${driver.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Vehicle type">
          <select
            className="input"
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value)}
          >
            {VEHICLE_TYPES.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Vehicle number">
          <input
            className="input"
            value={vehicleNumber}
            onChange={(e) => setVehicleNumber(e.target.value)}
            placeholder="e.g. DL01AB1234"
            required
          />
        </Field>
        <Field label="License number">
          <input
            className="input"
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
            placeholder="Driving licence number"
          />
        </Field>

        <Field label="Last-known location">
          {driver.currentLat != null && driver.currentLng != null ? (
            <LocationMap lat={driver.currentLat} lng={driver.currentLng} height={240} />
          ) : (
            <div className="flex h-[240px] flex-col items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500">
              <MapPin className="h-6 w-6 text-gray-300" />
              No location reported yet
            </div>
          )}
        </Field>

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
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
