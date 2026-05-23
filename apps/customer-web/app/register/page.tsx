'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Input } from '@aks/ui/components/input';
import { Label } from '@aks/ui/components/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@aks/ui/components/input-otp';
import { toast } from '@aks/ui/components/sonner';
import { AuthShell } from '@/components/AuthShell';
import { api } from '@/lib/api';
import { persistSession } from '@/lib/auth';
import { registerSchema, type RegisterInput } from '@/lib/auth-schemas';

interface AuthResponse {
  user: { id: string; phone: string; role: string; name?: string | null; email?: string | null };
  accessToken: string;
  refreshToken: string;
  hasAddress?: boolean;
}

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  async function onSubmit(values: RegisterInput) {
    try {
      await api.post('/api/v1/auth/register', { ...values, role: 'CUSTOMER' });
      setStep('otp');
      toast.success(`OTP sent to +91 ${values.phone}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Registration failed');
    }
  }

  async function verifyOtp() {
    if (otp.length !== 6) {
      toast.error('Enter the complete 6-digit OTP');
      return;
    }
    setVerifying(true);
    try {
      const { phone } = getValues();
      const { data } = await api.post<{ success: boolean; data: AuthResponse }>(
        '/api/v1/auth/verify-otp',
        { phone, otp, role: 'CUSTOMER' },
      );
      const payload = data.data;
      if (!payload?.accessToken) throw new Error('Verification failed');
      persistSession(payload);
      toast.success(`Welcome aboard${payload.user.name ? `, ${payload.user.name.split(' ')[0]}` : ''}!`);
      router.replace('/');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invalid OTP');
    } finally {
      setVerifying(false);
    }
  }

  async function resendOtp() {
    try {
      const { phone } = getValues();
      await api.post('/api/v1/auth/send-otp', { phone });
      toast.success('A new OTP has been sent');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not resend OTP');
    }
  }

  if (step === 'otp') {
    return (
      <AuthShell
        title="Verify your number"
        subtitle={`Enter the 6-digit code sent to +91 ${getValues().phone}`}
      >
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
            onClick={verifyOtp}
          >
            {verifying ? 'Verifying…' : 'Verify & continue'}
          </Button>

          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={resendOtp}
              className="flex items-center justify-center gap-1 text-sm font-semibold text-primary hover:text-primary-700"
            >
              <RefreshCw className="h-4 w-4" />
              Resend OTP
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('form');
                setOtp('');
              }}
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

  return (
    <AuthShell
      title="Create your account"
      subtitle="We’ll send a one-time code to verify your mobile number."
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
          <Input id="name" autoComplete="name" placeholder="e.g. Anita Sharma" {...register('name')} />
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
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthShell>
  );
}
