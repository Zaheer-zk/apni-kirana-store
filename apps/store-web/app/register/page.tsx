'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  RefreshCw,
  Store,
} from 'lucide-react';
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
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@aks/ui/components/input-otp';
import { toast } from '@aks/ui/components/sonner';
import { StoreCategory } from '@aks/shared';
import { AuthShell } from '@/components/AuthShell';
import { StoreLocationPicker } from '@/components/StoreLocationPicker';
import { api } from '@/lib/api';
import {
  isAuthenticated,
  persistSession,
  setStoredStore,
  type StoredStore,
} from '@/lib/auth';
import {
  registerSchema,
  type RegisterInput,
  storeRegisterSchema,
  type StoreRegisterInput,
} from '@/lib/auth-schemas';

interface AuthResponse {
  user: { id: string; phone: string; role: string; name?: string | null; email?: string | null };
  accessToken: string;
  refreshToken: string;
  storeProfile?: StoredStore | null;
}

const CATEGORIES: { label: string; value: StoreCategory }[] = [
  { label: 'Grocery', value: StoreCategory.GROCERY },
  { label: 'Pharmacy', value: StoreCategory.PHARMACY },
  { label: 'General Store', value: StoreCategory.GENERAL },
  { label: 'Restaurant', value: StoreCategory.RESTAURANT },
];

/**
 * Three-step store-owner registration:
 *   1. `account` → collect name/phone/email/username/password →
 *      POST /auth/register (sends OTP)
 *   2. `otp`     → verify OTP with role STORE_OWNER → owner is logged in
 *   3. `store`   → collect store details (incl. lat/lng from map picker) →
 *                 POST /stores/register → pending-approval screen
 *
 * An already-authenticated owner (e.g. routed here from /login because they
 * have no store yet) skips straight to step 3.
 */
export default function RegisterPage() {
  const router = useRouter();
  // We can't read localStorage until the client hydrates — Next 16 + React
  // 19 will still SSR this page, so default to `account` and let an effect
  // promote to `store` if the user is already authenticated.
  const [step, setStep] = useState<'account' | 'otp' | 'store' | 'pending'>(
    typeof window !== 'undefined' && isAuthenticated() ? 'store' : 'account',
  );

  return (
    <>
      {step === 'account' && <AccountStep onNext={() => setStep('otp')} />}
      {step === 'otp' && (
        <OtpStep onVerified={() => setStep('store')} onBack={() => setStep('account')} />
      )}
      {step === 'store' && (
        <StoreDetailsStep
          onSubmitted={() => setStep('pending')}
          onLogout={() => router.replace('/login')}
        />
      )}
      {step === 'pending' && <PendingApprovalCard />}
    </>
  );
}

// ─── Step 1: account ──────────────────────────────────────────────────────

interface AccountStepStore {
  phone: string;
}
let accountStepCache: AccountStepStore = { phone: '' };

function AccountStep({ onNext }: { onNext: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  async function onSubmit(values: RegisterInput) {
    try {
      await api.post('/api/v1/auth/register', { ...values, role: 'STORE_OWNER' });
      accountStepCache = { phone: values.phone };
      toast.success(`OTP sent to +91 ${values.phone}`);
      onNext();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Registration failed');
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="We'll send a one-time code to verify your mobile number. You'll add your store details next."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-primary hover:text-primary-700">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" autoComplete="name" placeholder="e.g. Ramesh Sharma" {...register('name')} />
          {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone">Mobile number</Label>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-11 items-center rounded-md border border-gray-300 bg-gray-50 px-3 text-sm font-medium text-gray-600">
              +91
            </span>
            <Input
              id="phone"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              autoComplete="tel-national"
              placeholder="10-digit number"
              {...register('phone')}
            />
          </div>
          {errors.phone ? <p className="text-xs text-destructive">{errors.phone.message}</p> : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...register('email')}
          />
          {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            autoComplete="username"
            placeholder="Used to log in"
            {...register('username')}
          />
          {errors.username ? (
            <p className="text-xs text-destructive">{errors.username.message}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            {...register('password')}
          />
          {errors.password ? (
            <p className="text-xs text-destructive">{errors.password.message}</p>
          ) : null}
        </div>

        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account & send OTP'}
        </Button>
      </form>
    </AuthShell>
  );
}

// ─── Step 2: OTP ──────────────────────────────────────────────────────────

function OtpStep({
  onVerified,
  onBack,
}: {
  onVerified: () => void;
  onBack: () => void;
}) {
  const phone = accountStepCache.phone;
  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);

  async function verify() {
    if (otp.length !== 6) return toast.error('Enter the complete 6-digit OTP');
    setVerifying(true);
    try {
      const { data } = await api.post<{ success: boolean; data: AuthResponse }>(
        '/api/v1/auth/verify-otp',
        { phone, otp, role: 'STORE_OWNER' },
      );
      const payload = data.data;
      if (!payload?.accessToken) throw new Error('Verification failed');
      persistSession(payload);
      toast.success('Number verified. Next: tell us about your store.');
      onVerified();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invalid OTP');
    } finally {
      setVerifying(false);
    }
  }

  async function resend() {
    try {
      await api.post('/api/v1/auth/send-otp', { phone });
      toast.success('A new OTP has been sent');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not resend OTP');
    }
  }

  return (
    <AuthShell title="Verify your number" subtitle={`Enter the 6-digit code sent to +91 ${phone}`}>
      <div className="space-y-4">
        <div className="flex justify-center pt-2">
          <InputOTP maxLength={6} value={otp} onChange={setOtp}>
            <InputOTPGroup>
              {Array.from({ length: 6 }).map((_, i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        <Button
          type="button"
          size="lg"
          className="w-full"
          loading={verifying}
          disabled={otp.length !== 6}
          onClick={verify}
        >
          {verifying ? 'Verifying…' : 'Verify & continue'}
        </Button>

        <div className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            onClick={resend}
            className="flex items-center justify-center gap-1 text-sm font-semibold text-primary hover:text-primary-700"
          >
            <RefreshCw className="h-4 w-4" />
            Resend OTP
          </button>
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center gap-1 text-sm font-semibold text-gray-600 hover:text-gray-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Edit details
          </button>
        </div>
      </div>
    </AuthShell>
  );
}

// ─── Step 3: store details ────────────────────────────────────────────────

function StoreDetailsStep({
  onSubmitted,
  onLogout,
}: {
  onSubmitted: () => void;
  onLogout: () => void;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
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

  const category = watch('category');

  async function onSubmit(values: StoreRegisterInput) {
    try {
      const res = await api.post<{ success: boolean; data: StoredStore & { id: string } }>(
        '/api/v1/stores/register',
        values,
      );
      const created = res.data?.data ?? null;
      if (created?.id) setStoredStore(created);
      onSubmitted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not register your store');
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Set up your store</h1>
        <p className="mt-1 text-sm text-gray-500">
          Fill in your store details to start receiving orders. You can edit them anytime from
          the Profile section.
        </p>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* ── Store info ── */}
        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="section-eyebrow flex items-center gap-2">
            <Store className="h-4 w-4 text-primary" /> Store information
          </h2>

          <div className="space-y-1.5">
            <Label htmlFor="storeName">Store name *</Label>
            <Input id="storeName" placeholder="e.g. Sharma Kirana Store" {...register('name')} />
            {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              rows={3}
              placeholder="Brief description of your store…"
              className="flex w-full rounded-md border border-input bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
            {errors.category ? (
              <p className="text-xs text-destructive">{errors.category.message}</p>
            ) : null}
          </div>
        </section>

        {/* ── Store location (map picker) ── */}
        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="section-eyebrow flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" /> Store location *
          </h2>
          <p className="text-sm text-gray-500">
            Pan the map so the pin sits exactly on your store. We use this to send you nearby
            orders. The pin defaults to your current location.
          </p>

          <StoreLocationPicker
            onChange={(c) => {
              setValue('lat', c.lat, { shouldValidate: true });
              setValue('lng', c.lng, { shouldValidate: true });
            }}
            heightClass="h-72"
          />
          {(errors.lat || errors.lng) ? (
            <p className="text-xs text-destructive">
              {errors.lat?.message ?? errors.lng?.message}
            </p>
          ) : null}
        </section>

        {/* ── Address ── */}
        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="section-eyebrow">Address</h2>

          <div className="space-y-1.5">
            <Label htmlFor="street">Street address *</Label>
            <Input id="street" placeholder="Shop number, building, street" {...register('street')} />
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
              placeholder="6-digit pincode"
              {...register('pincode')}
            />
            {errors.pincode ? <p className="text-xs text-destructive">{errors.pincode.message}</p> : null}
          </div>
        </section>

        {/* ── Operating hours ── */}
        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="section-eyebrow flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-primary" /> Operating hours
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="openTime">Opening time</Label>
              <Input id="openTime" type="time" {...register('openTime')} />
              {errors.openTime ? (
                <p className="text-xs text-destructive">{errors.openTime.message}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="closeTime">Closing time</Label>
              <Input id="closeTime" type="time" {...register('closeTime')} />
              {errors.closeTime ? (
                <p className="text-xs text-destructive">{errors.closeTime.message}</p>
              ) : null}
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          <Button type="button" variant="ghost" onClick={onLogout}>
            Save for later (log out)
          </Button>
          <Button type="submit" size="lg" loading={isSubmitting} className="sm:w-auto">
            Submit registration
          </Button>
        </div>
      </form>
    </main>
  );
}

// ─── Step 4: pending approval ─────────────────────────────────────────────

function PendingApprovalCard() {
  return (
    <AuthShell
      title="Store registered!"
      subtitle="Your store application is pending admin approval."
    >
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-100">
          <CheckCircle2 className="h-7 w-7 text-primary" />
        </div>
        <p className="text-sm text-gray-600">
          You&apos;ll be able to start accepting orders once an admin approves your store. This
          usually takes 24–48 hours. We&apos;ll notify you on +91 {accountStepCache.phone || 'your phone'}.
        </p>

        <Button asChild size="lg" className="w-full">
          <Link href="/">Go to dashboard</Link>
        </Button>
      </div>
    </AuthShell>
  );
}

// Loading fallback (unused but kept for Suspense parity if we add ssr later)
export function _LoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
    </div>
  );
}
