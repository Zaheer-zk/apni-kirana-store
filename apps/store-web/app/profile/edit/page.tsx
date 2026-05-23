'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Clock3, MapPin, Save, Store } from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Input } from '@aks/ui/components/input';
import { Label } from '@aks/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@aks/ui/components/select';
import { toast } from '@aks/ui/components/sonner';
import { StoreCategory } from '@aks/shared';
import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';
import { StoreLocationPicker } from '@/components/StoreLocationPicker';
import { ErrorPanel, PageLoader } from '@/components/StatePanels';
import { api } from '@/lib/api';
import { setStoredStore } from '@/lib/auth';
import { storeRegisterSchema, type StoreRegisterInput } from '@/lib/auth-schemas';

const CATEGORIES: { label: string; value: StoreCategory }[] = [
  { label: 'Grocery', value: StoreCategory.GROCERY },
  { label: 'Pharmacy', value: StoreCategory.PHARMACY },
  { label: 'General Store', value: StoreCategory.GENERAL },
  { label: 'Restaurant', value: StoreCategory.RESTAURANT },
];

interface StoreMe {
  id: string;
  name: string;
  description?: string | null;
  category?: StoreCategory;
  lat?: number;
  lng?: number;
  street?: string;
  city?: string;
  state?: string;
  pincode?: string;
  openTime?: string;
  closeTime?: string;
}

export default function EditStoreProfilePage() {
  return (
    <AuthGuard>
      <AppShell>
        <EditProfileInner />
      </AppShell>
    </AuthGuard>
  );
}

function EditProfileInner() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery<StoreMe>({
    queryKey: ['storeMe', 'edit'],
    queryFn: async () => {
      const res = await api.get('/api/v1/stores/me');
      return (res.data?.data ?? res.data) as StoreMe;
    },
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<StoreRegisterInput>({
    resolver: zodResolver(storeRegisterSchema),
    defaultValues: {
      name: '',
      description: '',
      category: 'GROCERY',
      lat: 0,
      lng: 0,
      street: '',
      city: '',
      state: '',
      pincode: '',
      openTime: '09:00',
      closeTime: '21:00',
    },
  });

  // When the store loads, seed the form with the existing values so the
  // user is editing in-place rather than starting from blanks.
  useEffect(() => {
    if (!data) return;
    reset({
      name: data.name ?? '',
      description: data.description ?? '',
      category: (data.category as StoreCategory) ?? 'GROCERY',
      lat: data.lat ?? 0,
      lng: data.lng ?? 0,
      street: data.street ?? '',
      city: data.city ?? '',
      state: data.state ?? '',
      pincode: data.pincode ?? '',
      openTime: data.openTime ?? '09:00',
      closeTime: data.closeTime ?? '21:00',
    });
  }, [data, reset]);

  const category = watch('category');
  const hasInitialCoords = typeof data?.lat === 'number' && typeof data?.lng === 'number';

  const update = useMutation({
    mutationFn: async (values: StoreRegisterInput) => {
      if (!data?.id) throw new Error('Store id missing');
      const res = await api.put(`/api/v1/stores/${data.id}`, values);
      return (res.data?.data ?? res.data) as StoreMe;
    },
    onSuccess: (updated) => {
      // Coerce `category` from the StoreCategory enum to a plain string so
      // the localStorage snapshot matches our `StoredStore` shape (which
      // is intentionally permissive).
      setStoredStore({ ...updated, category: updated.category ? String(updated.category) : undefined });
      queryClient.invalidateQueries({ queryKey: ['storeMe'] });
      toast.success('Store profile updated');
      router.push('/profile');
    },
    onError: (err: Error) => toast.error(err.message || 'Could not update profile'),
  });

  if (isLoading) return <PageLoader />;
  if (isError || !data) {
    return (
      <div className="page-shell">
        <ErrorPanel message="Couldn't load your store profile." onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="page-shell space-y-6">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <a
          href="/profile"
          onClick={(e) => {
            e.preventDefault();
            router.back();
          }}
          className="gap-1"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to profile
        </a>
      </Button>

      <header>
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Edit store profile</h1>
        <p className="text-sm text-gray-500">
          Changes go live immediately — customers see the updated info on their next search.
        </p>
      </header>

      <form onSubmit={handleSubmit((v) => update.mutate(v))} className="space-y-6">
        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="section-eyebrow flex items-center gap-2">
            <Store className="h-4 w-4 text-primary" /> Store information
          </h2>

          <div className="space-y-1.5">
            <Label htmlFor="name">Store name *</Label>
            <Input id="name" placeholder="e.g. Sharma Kirana Store" {...register('name')} />
            {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              rows={3}
              placeholder="Brief description of your store…"
              className="flex w-full rounded-md border border-input bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              {...register('description')}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Category *</Label>
            <Select
              value={category}
              onValueChange={(value) => setValue('category', value as StoreCategory, { shouldValidate: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="section-eyebrow flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" /> Store location *
          </h2>
          <p className="text-sm text-gray-500">
            Pan the map so the pin sits exactly on your store. Customers within ~5 km of this pin
            will see you. The pin starts at your existing location, or your current GPS position
            if none is saved.
          </p>

          <StoreLocationPicker
            fallback={hasInitialCoords ? { lat: data.lat!, lng: data.lng! } : null}
            skipInitialGeolocate={hasInitialCoords}
            heightClass="h-72"
            onChange={(c) => {
              setValue('lat', c.lat, { shouldValidate: true });
              setValue('lng', c.lng, { shouldValidate: true });
            }}
          />
          {(errors.lat || errors.lng) ? (
            <p className="text-xs text-destructive">{errors.lat?.message ?? errors.lng?.message}</p>
          ) : null}
        </section>

        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="section-eyebrow">Address</h2>

          <div className="space-y-1.5">
            <Label htmlFor="street">Street address *</Label>
            <Input id="street" {...register('street')} />
            {errors.street ? <p className="text-xs text-destructive">{errors.street.message}</p> : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="city">City *</Label>
              <Input id="city" {...register('city')} />
              {errors.city ? <p className="text-xs text-destructive">{errors.city.message}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="state">State *</Label>
              <Input id="state" {...register('state')} />
              {errors.state ? <p className="text-xs text-destructive">{errors.state.message}</p> : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pincode">Pincode *</Label>
            <Input
              id="pincode"
              inputMode="numeric"
              maxLength={6}
              {...register('pincode')}
            />
            {errors.pincode ? <p className="text-xs text-destructive">{errors.pincode.message}</p> : null}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="section-eyebrow flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-primary" /> Operating hours
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="openTime">Opening time</Label>
              <Input id="openTime" type="time" {...register('openTime')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="closeTime">Closing time</Label>
              <Input id="closeTime" type="time" {...register('closeTime')} />
            </div>
          </div>
        </section>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" size="lg" loading={isSubmitting || update.isPending}>
            <Save className="h-4 w-4" /> Save changes
          </Button>
        </div>
      </form>
    </div>
  );
}
