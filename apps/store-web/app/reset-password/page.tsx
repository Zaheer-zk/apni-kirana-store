'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Input } from '@aks/ui/components/input';
import { Label } from '@aks/ui/components/label';
import { toast } from '@aks/ui/components/sonner';
import { AuthShell } from '@/components/AuthShell';
import { api } from '@/lib/api';
import { resetPasswordSchema } from '@/lib/auth-schemas';

type Stage = 'checking' | 'invalid' | 'form' | 'done';
type FormValues = { password: string; confirm: string };

function ResetPasswordInner() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [stage, setStage] = useState<Stage>('checking');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(resetPasswordSchema) });

  useEffect(() => {
    if (!token) {
      setStage('invalid');
      return;
    }
    let active = true;
    api
      .get<{ success: boolean; data: { valid: boolean } }>(
        `/api/v1/auth/reset-password/validate?token=${encodeURIComponent(token)}`,
      )
      .then(({ data }) => {
        if (!active) return;
        setStage(data.data?.valid ? 'form' : 'invalid');
      })
      .catch(() => active && setStage('invalid'));
    return () => {
      active = false;
    };
  }, [token]);

  async function onSubmit(values: FormValues) {
    try {
      await api.post('/api/v1/auth/reset-password', {
        token,
        newPassword: values.password,
      });
      setStage('done');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reset your password');
    }
  }

  if (stage === 'checking') {
    return (
      <AuthShell title="Reset your password" subtitle="Validating your link…">
        <div className="flex items-center justify-center gap-2 py-6 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Checking your reset link…
        </div>
      </AuthShell>
    );
  }

  if (stage === 'invalid') {
    return (
      <AuthShell title="Link expired" subtitle="This reset link is no longer valid">
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
            <XCircle className="h-7 w-7 text-red-600" />
          </div>
          <p className="text-sm text-gray-600">
            Reset links expire after 1 hour. Request a new one and try again.
          </p>
          <Button asChild size="lg" className="w-full">
            <Link href="/forgot-password">Request a new link</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (stage === 'done') {
    return (
      <AuthShell title="Password updated" subtitle="You can now sign in with your new password">
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-100">
            <CheckCircle2 className="h-7 w-7 text-primary" />
          </div>
          <Button asChild size="lg" className="w-full">
            <Link href="/login">Go to sign in</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password" subtitle="Pick something you’ll remember">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            autoFocus
            placeholder="At least 8 characters"
            {...register('password')}
          />
          {errors.password ? (
            <p className="text-xs text-destructive">{errors.password.message}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm new password</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            placeholder="Re-enter the password"
            {...register('confirm')}
          />
          {errors.confirm ? (
            <p className="text-xs text-destructive">{errors.confirm.message}</p>
          ) : null}
        </div>

        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Set new password'}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}
