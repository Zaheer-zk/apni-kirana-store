'use client';

import { useState, FormEvent } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { setToken, setSuperAdmin, setAdminInfo } from '@/lib/auth';
import type { ApiResponse } from '@aks/shared';

interface AdminLoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    phone: string;
    role: string;
    name: string | null;
    isSuperAdmin?: boolean;
    mustChangePassword?: boolean;
  };
}

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError('Enter your username and password');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<AdminLoginResponse>>(
        '/api/v1/auth/admin-login',
        { username: username.trim(), password }
      );
      if (data.success && data.data?.accessToken) {
        setToken(data.data.accessToken);
        setSuperAdmin(!!data.data.user?.isSuperAdmin);
        // Cache identity for the top-right profile dropdown.
        const u = data.data.user as
          | { id?: string; name?: string; username?: string; email?: string }
          | undefined;
        if (u) {
          setAdminInfo({
            id: u.id,
            name: u.name,
            username: u.username ?? username.trim(),
            email: u.email,
          });
        }
        // Admin-created accounts must replace their temporary password first.
        router.replace(data.data.user?.mustChangePassword ? '/change-password' : '/');
      } else {
        setError(data.error ?? 'Invalid username or password');
      }
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: ApiResponse<unknown> } })?.response?.data?.error ??
        'Login failed. Check that the backend is running.';
      setError(message);
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
          <p className="mt-1 text-sm text-gray-500">Admin Dashboard — sign in</p>
        </div>

        <div className="card p-8">
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-gray-700">
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                autoFocus
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Your admin username"
                className="input"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
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
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Access is restricted to authorised administrators only.
        </p>
      </div>
    </div>
  );
}
