'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Input } from '@aks/ui/components/input';
import { Label } from '@aks/ui/components/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@aks/ui/components/tabs';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@aks/ui/components/input-otp';
import { toast } from '@aks/ui/components/sonner';
import { AuthShell } from '@/components/AuthShell';
import { api } from '@/lib/api';
import { persistSession } from '@/lib/auth';
import { resolveDriverDestination } from '@/lib/driver-routing';
import {
  passwordLoginSchema,
  phoneOnlySchema,
  type PasswordLoginInput,
} from '@/lib/auth-schemas';

/**
 * Shape of `/auth/login-password` and `/auth/verify-otp` success payloads.
 * `pendingApproval` is set when the driver is still awaiting admin review —
 * the token works for /auth/me + /drivers/stats/today, but trip/availability
 * writes return 403 via the requireApproved middleware.
 */
interface AuthResponse {
  user: { id: string; phone: string; role: string; name?: string | null; email?: string | null };
  accessToken: string;
  refreshToken: string;
  mustChangePassword?: boolean;
  pendingApproval?: true;
  reason?: 'STORE_PENDING' | 'DRIVER_PENDING';
}

type LoginTab = 'password' | 'otp';
const LAST_TAB_KEY = 'aks_driver_login_tab';

function readPreferredTab(): LoginTab {
  if (typeof window === 'undefined') return 'otp';
  const v = window.localStorage.getItem(LAST_TAB_KEY);
  return v === 'password' ? 'password' : 'otp';
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') ?? '/';

  const [tab, setTab] = useState<LoginTab>('otp');
  useEffect(() => {
    setTab(readPreferredTab());
  }, []);

  function handleTabChange(next: string) {
    const t = (next === 'password' ? 'password' : 'otp') as LoginTab;
    setTab(t);
    try {
      window.localStorage.setItem(LAST_TAB_KEY, t);
    } catch {
      // Non-fatal — private mode or quota.
    }
  }

  /**
   * Shared post-login handler used by both tabs. Stores the session, then
   * picks a destination based on the auth payload + driver state.
   *
   * Routing rules (in order):
   *   1. pendingApproval flag set → /pending (token still works for the
   *      driver-status endpoint, every other write returns 403).
   *   2. mustChangePassword → /change-password?next=<resolved destination>
   *   3. otherwise: /resolveDriverDestination handles the
   *      no-profile-yet / approved / pending fallback paths.
   */
  async function handleAuthSuccess(payload: AuthResponse) {
    persistSession(payload);
    toast.success(
      payload.user.name ? `Welcome back, ${payload.user.name.split(' ')[0]}!` : 'Welcome back!',
    );

    if (payload.pendingApproval) {
      router.replace('/pending');
      return;
    }

    const destination = await resolveDriverDestination();
    const target = nextPath !== '/' ? nextPath : destination;
    if (payload.mustChangePassword) {
      router.replace(`/change-password?next=${encodeURIComponent(target)}`);
    } else {
      router.replace(target);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to start delivering"
      footer={
        <>
          New driver?{' '}
          <Link href="/register" className="font-semibold text-primary hover:text-primary-700">
            Apply to drive
          </Link>
        </>
      }
    >
      <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="otp">Phone + OTP</TabsTrigger>
          <TabsTrigger value="password">Username or email</TabsTrigger>
        </TabsList>

        <TabsContent value="otp" className="pt-4">
          <OtpFlow onSuccess={handleAuthSuccess} />
        </TabsContent>

        <TabsContent value="password" className="pt-4">
          <PasswordForm onSuccess={handleAuthSuccess} />
        </TabsContent>
      </Tabs>
    </AuthShell>
  );
}

function PasswordForm({ onSuccess }: { onSuccess: (payload: AuthResponse) => void | Promise<void> }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PasswordLoginInput>({ resolver: zodResolver(passwordLoginSchema) });

  async function onSubmit(values: PasswordLoginInput) {
    try {
      const { data } = await api.post<{ success: boolean; data: AuthResponse }>(
        '/api/v1/auth/login-password',
        { ...values, role: 'DRIVER' },
      );
      const payload = data.data;
      if (!payload?.accessToken) throw new Error('Login failed');
      await onSuccess(payload);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Login failed');
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="identifier">Username or email</Label>
        <Input
          id="identifier"
          type="text"
          autoComplete="username"
          placeholder="e.g. chotu or chotu@delivery.com"
          autoFocus
          {...register('identifier')}
        />
        {errors.identifier ? (
          <p className="text-xs text-destructive">{errors.identifier.message}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="Your password"
          {...register('password')}
        />
        {errors.password ? (
          <p className="text-xs text-destructive">{errors.password.message}</p>
        ) : null}
      </div>

      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-semibold text-primary hover:text-primary-700">
          Forgot password?
        </Link>
      </div>

      <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}

function OtpFlow({ onSuccess }: { onSuccess: (payload: AuthResponse) => void | Promise<void> }) {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  async function sendOtp() {
    const parsed = phoneOnlySchema.safeParse({ phone });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Invalid phone number');
      return;
    }
    setSending(true);
    try {
      await api.post('/api/v1/auth/send-otp', { phone, role: 'DRIVER' });
      setStep('otp');
      toast.success(`OTP sent to +91 ${phone}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send OTP');
    } finally {
      setSending(false);
    }
  }

  async function verifyOtp() {
    if (otp.length !== 6) {
      toast.error('Enter the complete 6-digit OTP');
      return;
    }
    setVerifying(true);
    try {
      const { data } = await api.post<{ success: boolean; data: AuthResponse }>(
        '/api/v1/auth/verify-otp',
        { phone, otp, role: 'DRIVER' },
      );
      const payload = data.data;
      if (!payload?.accessToken) throw new Error('Verification failed');
      await onSuccess(payload);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invalid OTP');
    } finally {
      setVerifying(false);
    }
  }

  if (step === 'phone') {
    return (
      <div className="space-y-4">
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
              autoComplete="tel-national"
              placeholder="10-digit number"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              autoFocus
            />
          </div>
        </div>

        <Button
          type="button"
          size="lg"
          className="w-full"
          loading={sending}
          disabled={phone.length !== 10}
          onClick={sendOtp}
        >
          {sending ? 'Sending OTP…' : 'Send OTP'}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Enter the 6-digit code sent to <span className="font-semibold">+91 {phone}</span>
      </p>

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
        onClick={verifyOtp}
      >
        {verifying ? 'Verifying…' : 'Verify & log in'}
      </Button>

      <button
        type="button"
        onClick={() => {
          setStep('phone');
          setOtp('');
        }}
        className="flex w-full items-center justify-center gap-1 text-sm font-semibold text-primary hover:text-primary-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Change number
      </button>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <LoginInner />
    </Suspense>
  );
}

function LoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
    </div>
  );
}
