'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@aks/ui/components/dialog';
import { Input } from '@aks/ui/components/input';
import { Label } from '@aks/ui/components/label';
import { toast } from '@aks/ui/components/sonner';
import {
  addressFormSchema,
  type AddressFormInput,
  type SavedAddress,
} from '@/lib/addresses';

// Leaflet only works in the browser — `react-leaflet` reads `window` at
// import time. Lazy-load with SSR disabled.
const LocationMap = dynamic(
  () => import('@aks/ui/components/location-map').then((m) => m.LocationMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-72 items-center justify-center rounded-md border border-gray-200 bg-gray-100">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    ),
  },
);

interface AddressFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: SavedAddress | null;
  onSubmit: (values: AddressFormInput) => Promise<void>;
  submitting?: boolean;
  /**
   * When true, the "Set as default" checkbox is hidden. Use for the very
   * first address — backend forces isDefault on the first row so the toggle
   * is meaningless.
   */
  hideDefaultToggle?: boolean;
}

const EMPTY: AddressFormInput = {
  label: 'Home',
  street: '',
  city: '',
  state: '',
  pincode: '',
  lat: 0,
  lng: 0,
  isDefault: false,
};

export function AddressFormDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
  submitting = false,
  hideDefaultToggle = false,
}: AddressFormDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<AddressFormInput>({
    resolver: zodResolver(addressFormSchema),
    defaultValues: EMPTY,
  });

  // Reset whenever the dialog opens with a different initial address.
  useEffect(() => {
    if (!open) return;
    reset(
      initial
        ? {
            label: initial.label,
            street: initial.street,
            city: initial.city,
            state: initial.state,
            pincode: initial.pincode,
            lat: initial.lat,
            lng: initial.lng,
            isDefault: initial.isDefault,
          }
        : EMPTY,
    );
  }, [open, initial, reset]);

  const lat = watch('lat');
  const lng = watch('lng');

  async function submit(values: AddressFormInput) {
    if (!Number.isFinite(values.lat) || !Number.isFinite(values.lng) || (values.lat === 0 && values.lng === 0)) {
      toast.error('Please pin a location on the map');
      return;
    }
    try {
      await onSubmit(values);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save address');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit address' : 'Add a new address'}</DialogTitle>
          <DialogDescription>
            Drag the map until the pin sits on your gate. We use this to match you with
            the nearest open store.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <div>
            <LocationMap
              fallback={initial ? { lat: initial.lat, lng: initial.lng } : null}
              skipInitialGeolocate={!!initial}
              onChange={({ lat, lng }) => {
                setValue('lat', lat, { shouldValidate: true });
                setValue('lng', lng, { shouldValidate: true });
              }}
            />
            <p className="mt-1 text-xs text-gray-500">
              Pinned at{' '}
              <span className="font-mono">
                {Number.isFinite(lat) ? lat.toFixed(5) : '—'}, {Number.isFinite(lng) ? lng.toFixed(5) : '—'}
              </span>
            </p>
            {(errors.lat || errors.lng) ? (
              <p className="mt-1 text-xs text-destructive">
                {errors.lat?.message ?? errors.lng?.message}
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Label"
              htmlFor="label"
              error={errors.label?.message}
              hint="e.g. Home, Work, Mom's place"
            >
              <Input id="label" autoFocus={!initial} {...register('label')} />
            </Field>
            <Field label="Pincode" htmlFor="pincode" error={errors.pincode?.message}>
              <Input
                id="pincode"
                inputMode="numeric"
                maxLength={6}
                placeholder="6 digits"
                {...register('pincode')}
              />
            </Field>
          </div>

          <Field
            label="Street / building / landmark"
            htmlFor="street"
            error={errors.street?.message}
          >
            <Input id="street" {...register('street')} placeholder="House 12, Lane 4, near park" />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="City" htmlFor="city" error={errors.city?.message}>
              <Input id="city" {...register('city')} />
            </Field>
            <Field label="State" htmlFor="state" error={errors.state?.message}>
              <Input id="state" {...register('state')} />
            </Field>
          </div>

          {!hideDefaultToggle ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                {...register('isDefault')}
              />
              Set as my default delivery address
            </label>
          ) : null}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              {initial ? 'Save changes' : 'Save address'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-gray-500">{hint}</p>
      ) : null}
    </div>
  );
}
