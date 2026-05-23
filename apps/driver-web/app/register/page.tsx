'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Bike, Car, CheckCircle2, Info, RefreshCw } from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Input } from '@aks/ui/components/input';
import { Label } from '@aks/ui/components/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@aks/ui/components/input-otp';
import { toast } from '@aks/ui/components/sonner';
import { cn } from '@aks/ui/lib/utils';
import { AuthShell } from '@/components/AuthShell';
import { api } from '@/lib/api';
import { persistSession } from '@/lib/auth';
import {
  registerSchema,
  vehicleSchema,
  type RegisterInput,
  type VehicleInput,
} from '@/lib/auth-schemas';
import { VehicleType } from '@aks/shared';

interface AuthResponse {
  user: { id: string; phone: string; role: string; name?: string | null; email?: string | null };
  accessToken: string;
  refreshToken: string;
  hasAddress?: boolean;
}

type Step = 'form' | 'otp' | 'vehicle' | 'submitted';

const VEHICLE_OPTIONS: { label: string; value: VehicleType; icon: React.ReactNode }[] = [
  { label: 'Bike', value: VehicleType.BIKE, icon: <Bike className="h-6 w-6" /> },
  { label: 'Scooter', value: VehicleType.SCOOTER, icon: <Bike className="h-6 w-6" /> },
  { label: 'Car', value: VehicleType.CAR, icon: <Car className="h-6 w-6" /> },
];

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('form');
  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);

  const accountForm = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  const vehicleForm = useForm<VehicleInput>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: { vehicleType: VehicleType.BIKE, vehicleNumber: '', licenseNumber: '' },
  });
  const selectedVehicleType = vehicleForm.watch('vehicleType');

  async function onAccountSubmit(values: RegisterInput) {
    try {
      await api.post('/api/v1/auth/register', { ...values, role: 'DRIVER' });
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
      const { phone } = accountForm.getValues();
      const { data } = await api.post<{ success: boolean; data: AuthResponse }>(
        '/api/v1/auth/verify-otp',
        { phone, otp, role: 'DRIVER' },
      );
      const payload = data.data;
      if (!payload?.accessToken) throw new Error('Verification failed');
      // Account verified and logged in — next: vehicle/licence details that
      // actually create the driver entity on the backend.
      persistSession(payload);
      setStep('vehicle');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invalid OTP');
    } finally {
      setVerifying(false);
    }
  }

  async function resendOtp() {
    try {
      const { phone } = accountForm.getValues();
      await api.post('/api/v1/auth/send-otp', { phone });
      toast.success('A new OTP has been sent');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not resend OTP');
    }
  }

  async function onVehicleSubmit(values: VehicleInput) {
    try {
      await api.post('/api/v1/drivers/register', values);
      setStep('submitted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit your application');
    }
  }

  if (step === 'otp') {
    const phone = accountForm.getValues('phone');
    return (
      <AuthShell
        title="Verify your number"
        subtitle={`Enter the 6-digit code sent to +91 ${phone}`}
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

  if (step === 'vehicle') {
    return (
      <AuthShell
        title="Tell us about your vehicle"
        subtitle="We need these details to review your driver application."
      >
        <form onSubmit={vehicleForm.handleSubmit(onVehicleSubmit)} className="space-y-5">
          <div className="space-y-2">
            <Label>Vehicle type</Label>
            <div className="grid grid-cols-3 gap-2">
              {VEHICLE_OPTIONS.map((opt) => {
                const selected = selectedVehicleType === opt.value;
                return (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => vehicleForm.setValue('vehicleType', opt.value, { shouldValidate: true })}
                    className={cn(
                      'relative flex flex-col items-center gap-2 rounded-xl border-2 bg-white px-3 py-4 text-sm font-semibold transition',
                      selected
                        ? 'border-primary bg-primary-50 text-primary'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300',
                    )}
                  >
                    {opt.icon}
                    {opt.label}
                    {selected ? (
                      <CheckCircle2 className="absolute right-1.5 top-1.5 h-4 w-4 text-primary" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vehicleNumber">Vehicle number</Label>
            <Input
              id="vehicleNumber"
              autoCapitalize="characters"
              placeholder="e.g. MH01AB1234"
              {...vehicleForm.register('vehicleNumber')}
            />
            {vehicleForm.formState.errors.vehicleNumber ? (
              <p className="text-xs text-destructive">
                {vehicleForm.formState.errors.vehicleNumber.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="licenseNumber">Driving licence number</Label>
            <Input
              id="licenseNumber"
              autoCapitalize="characters"
              placeholder="e.g. MH0120200012345"
              {...vehicleForm.register('licenseNumber')}
            />
            {vehicleForm.formState.errors.licenseNumber ? (
              <p className="text-xs text-destructive">
                {vehicleForm.formState.errors.licenseNumber.message}
              </p>
            ) : null}
          </div>

          <Button type="submit" size="lg" className="w-full" loading={vehicleForm.formState.isSubmitting}>
            {vehicleForm.formState.isSubmitting ? 'Submitting…' : 'Submit application'}
          </Button>

          <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Your details will be reviewed by our team. We approve most drivers within
              24–48 hours.
            </p>
          </div>
        </form>
      </AuthShell>
    );
  }

  if (step === 'submitted') {
    return (
      <AuthShell
        title="Application submitted!"
        subtitle="Your driver application is under review."
      >
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-100">
            <CheckCircle2 className="h-7 w-7 text-primary" />
          </div>
          <p className="text-sm text-gray-600">
            Our team will verify your documents and approve your account within
            24–48 hours.
          </p>
          <Button asChild size="lg" className="w-full">
            <Link href="/pending">Check application status</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Apply to drive"
      subtitle="We'll send a one-time code to verify your mobile number."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-primary hover:text-primary-700">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={accountForm.handleSubmit(onAccountSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" autoComplete="name" placeholder="e.g. Chotu Singh" {...accountForm.register('name')} />
          {accountForm.formState.errors.name ? (
            <p className="text-xs text-destructive">{accountForm.formState.errors.name.message}</p>
          ) : null}
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
              {...accountForm.register('phone')}
            />
          </div>
          {accountForm.formState.errors.phone ? (
            <p className="text-xs text-destructive">{accountForm.formState.errors.phone.message}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...accountForm.register('email')}
          />
          {accountForm.formState.errors.email ? (
            <p className="text-xs text-destructive">{accountForm.formState.errors.email.message}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            autoComplete="username"
            placeholder="Used to log in"
            {...accountForm.register('username')}
          />
          {accountForm.formState.errors.username ? (
            <p className="text-xs text-destructive">{accountForm.formState.errors.username.message}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            {...accountForm.register('password')}
          />
          {accountForm.formState.errors.password ? (
            <p className="text-xs text-destructive">{accountForm.formState.errors.password.message}</p>
          ) : null}
        </div>

        <Button type="submit" size="lg" className="w-full" loading={accountForm.formState.isSubmitting}>
          {accountForm.formState.isSubmitting ? 'Sending OTP…' : 'Continue'}
        </Button>
      </form>
    </AuthShell>
  );
}
