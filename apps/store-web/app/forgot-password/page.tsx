'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { Button } from '@aks/ui/components/button';
import { Input } from '@aks/ui/components/input';
import { Label } from '@aks/ui/components/label';
import { AuthShell } from '@/components/AuthShell';
import { api } from '@/lib/api';
import { forgotPasswordSchema } from '@/lib/auth-schemas';

type FormValues = { email: string };

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(forgotPasswordSchema) });

  async function onSubmit(values: FormValues) {
    try {
      await api.post('/api/v1/auth/forgot-password', { email: values.email.trim() });
      setSent(values.email.trim());
    } catch {
      // Backend returns the same response for unknown emails to avoid leaking
      // account existence. Network errors land here — show the success card
      // anyway so we don't reveal whether the email is registered.
      setSent(values.email.trim());
    }
  }

  if (sent) {
    return (
      <AuthShell title="Check your email" subtitle={`We've sent a reset link to ${sent}`}>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-100">
            <MailCheck className="h-7 w-7 text-primary" />
          </div>
          <p className="text-sm text-gray-600">
            If an account exists for this email, you’ll receive a link to reset your password.
            The link expires in 1 hour.
          </p>
          <Button asChild size="lg" className="w-full">
            <Link href="/login">Back to login</Link>
          </Button>
          <button
            type="button"
            className="text-xs font-semibold text-gray-500 hover:text-gray-700"
            onClick={() => setSent(null)}
          >
            Send to a different email
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Forgot password"
      subtitle="Enter the email on your account and we'll send a reset link."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="you@example.com"
            {...register('email')}
          />
          {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
        </div>

        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          {isSubmitting ? 'Sending link…' : 'Send reset link'}
        </Button>

        <Link
          href="/login"
          className="flex items-center justify-center gap-1 text-sm font-semibold text-primary hover:text-primary-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to login
        </Link>
      </form>
    </AuthShell>
  );
}
