'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingBasket, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { setToken } from '@/lib/auth';
import type { ApiResponse } from '@aks/shared';

interface VerifyOtpResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; phone: string; role: string; name: string | null };
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (phone.length !== 10) {
      setError('Please enter a valid 10-digit phone number');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<null>>('/api/v1/auth/send-otp', { phone });
      if (data.success) {
        setStep('otp');
      } else {
        setError(data.error ?? 'Failed to send OTP');
      }
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: ApiResponse<unknown> } })?.response?.data?.error ??
        'Failed to send OTP. Check the backend is running.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (otp.length !== 6) {
      setError('OTP must be 6 digits');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<VerifyOtpResponse>>(
        '/api/v1/auth/verify-otp',
        { phone, otp }
      );
      if (data.success && data.data?.accessToken) {
        if (data.data.user.role !== 'ADMIN') {
          setError('This account is not an admin. Use 9999999999 to log in as admin.');
          setLoading(false);
          return;
        }
        setToken(data.data.accessToken);
        router.replace('/');
      } else {
        setError(data.error ?? 'Invalid OTP');
      }
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: ApiResponse<unknown> } })?.response?.data?.error ??
        'OTP verification failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg">
            <ShoppingBasket className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Apni Kirana Store</h1>
          <p className="mt-1 text-sm text-gray-500">Admin Dashboard — Sign in with phone OTP</p>
        </div>

        <div className="card p-8">
          {step === 'phone' ? (
            <form onSubmit={handleSendOtp} className="space-y-5">
              <div>
                <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-gray-700">
                  Phone number
                </label>
                <div className="flex">
                  <span className="inline-flex items-center rounded-l-md border border-r-0 border-gray-300 bg-gray-50 px-3 text-sm text-gray-500">
                    +91
                  </span>
                  <input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="9999999999"
                    className="input rounded-l-none"
                  />
                </div>
                <p className="mt-1.5 text-xs text-gray-500">
                  Use <code className="rounded bg-gray-100 px-1 py-0.5 font-mono">9999999999</code> for the seeded admin
                </p>
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
                    Sending OTP…
                  </>
                ) : (
                  'Send OTP'
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div>
                <label htmlFor="otp" className="mb-1.5 block text-sm font-medium text-gray-700">
                  Enter 6-digit OTP
                </label>
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  autoFocus
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                  className="input text-center text-2xl tracking-widest font-mono"
                />
                <p className="mt-1.5 text-xs text-gray-500">
                  OTP sent to +91 {phone}. Check backend logs:{' '}
                  <code className="rounded bg-gray-100 px-1 py-0.5 font-mono">docker compose logs backend | grep OTP</code>
                </p>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setStep('phone');
                    setOtp('');
                    setError(null);
                  }}
                  className="btn-secondary flex-1"
                >
                  Change number
                </button>
                <button type="submit" disabled={loading} className="btn-primary flex-1">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify & Sign in'}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Access is restricted to authorised administrators only.
        </p>
      </div>
    </div>
  );
}
