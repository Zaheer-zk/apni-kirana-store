'use client';

import { useState, FormEvent } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@aks/shared';

/**
 * Forced password change for admin accounts created with a temporary password
 * (`mustChangePassword`). The login page routes here right after sign-in.
 */
export default function ChangePasswordPage() {
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!current) return setError('Enter your current (temporary) password');
    if (next.length < 8) return setError('New password must be at least 8 characters');
    if (next !== confirm) return setError('The two passwords do not match');

    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<null>>('/api/v1/auth/change-password', {
        currentPassword: current,
        newPassword: next,
      });
      if (data.success) {
        router.replace('/');
      } else {
        setError(data.error ?? 'Could not change your password.');
      }
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: ApiResponse<unknown> } })?.response?.data?.error ??
          'Could not change your password. Please try again.',
      );
    } finally {
      setLoading(false);
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
          <h1 className="text-2xl font-bold text-gray-900">Set a new password</h1>
          <p className="mt-1 text-sm text-gray-500">
            Replace your temporary password before continuing.
          </p>
        </div>

        <div className="card p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="current" className="mb-1.5 block text-sm font-medium text-gray-700">
                Current password
              </label>
              <input
                id="current"
                type="password"
                autoComplete="current-password"
                autoFocus
                required
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                placeholder="Temporary password"
                className="input"
              />
            </div>
            <div>
              <label htmlFor="next" className="mb-1.5 block text-sm font-medium text-gray-700">
                New password
              </label>
              <input
                id="next"
                type="password"
                autoComplete="new-password"
                required
                value={next}
                onChange={(e) => setNext(e.target.value)}
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
                placeholder="Re-enter the new password"
                className="input"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save & continue'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
