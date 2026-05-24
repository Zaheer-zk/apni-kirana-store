'use client';

import { Suspense, useEffect, useState, FormEvent } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@aks/shared';

type Stage = 'checking' | 'invalid' | 'form' | 'done';

function ResetPasswordInner() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [stage, setStage] = useState<Stage>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setStage('invalid');
      return;
    }
    let active = true;
    api
      .get<ApiResponse<{ valid: boolean }>>(
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post<ApiResponse<null>>('/api/v1/auth/reset-password', {
        token,
        newPassword: password,
      });
      if (data.success) {
        setStage('done');
      } else {
        setError(data.error ?? 'Could not reset your password.');
      }
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: ApiResponse<unknown> } })?.response?.data?.error ??
          'Could not reset your password. The link may have expired.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image
            src="/logo-horizontal.png"
            alt="Apni Kirana"
            width={200}
            height={67}
            priority
            className="mb-4 h-auto w-[200px]"
          />
          <p className="mt-1 text-sm text-gray-500">Reset your password</p>
        </div>

        <div className="card p-8">
          {stage === 'checking' && (
            <div className="flex items-center justify-center gap-2 py-6 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Checking your reset link…
            </div>
          )}

          {stage === 'invalid' && (
            <div className="py-4 text-center">
              <XCircle className="mx-auto mb-3 h-10 w-10 text-red-500" />
              <p className="font-medium text-gray-900">This reset link is invalid or has expired.</p>
              <p className="mt-1 text-sm text-gray-500">
                Request a new password-reset link and try again.
              </p>
            </div>
          )}

          {stage === 'done' && (
            <div className="py-4 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-500" />
              <p className="font-medium text-gray-900">Your password has been reset.</p>
              <p className="mt-1 text-sm text-gray-500">
                You can now sign in with your new password.
              </p>
              <Link href="/login" className="btn-primary mt-5 inline-flex">
                Go to sign in
              </Link>
            </div>
          )}

          {stage === 'form' && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-700">
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  autoFocus
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="confirm" className="mb-1.5 block text-sm font-medium text-gray-700">
                  Confirm new password
                </label>
                <input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter the password"
                  className="input"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button type="submit" disabled={submitting} className="btn-primary w-full">
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Set new password'
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}
