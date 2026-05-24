'use client';

import Link from 'next/link';
import { ChevronRight, KeyRound, ShieldCheck, User } from 'lucide-react';
import { getAdminInfo, isSuperAdmin } from '@/lib/auth';

/**
 * Admin profile page. Identity is read from localStorage (cached at login
 * — see lib/auth.ts). Edit/email-change flows live elsewhere or come with
 * the upcoming /admin/me backend endpoint; for now this is read-only +
 * links to change-password.
 */
export default function AdminProfilePage() {
  const info = getAdminInfo();
  const superBadge = isSuperAdmin();
  const display = info?.name?.trim() || info?.username || 'Admin';
  const initials = (display || 'A')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || 'A';

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Your profile</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage how you sign in. Editing name/email requires the {`/admin/me`} backend
          endpoint (coming next).
        </p>
      </header>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-xl font-bold text-white">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-gray-900">{display}</p>
            {info?.username ? (
              <p className="truncate text-sm text-gray-500">@{info.username}</p>
            ) : null}
            {info?.email ? (
              <p className="truncate text-sm text-gray-500">{info.email}</p>
            ) : null}
            {superBadge ? (
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                <ShieldCheck className="h-3 w-3" />
                Super admin
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <Link
          href="/change-password"
          className="flex items-center justify-between px-5 py-4 hover:bg-gray-50"
        >
          <div className="flex items-center gap-3">
            <KeyRound className="h-5 w-5 text-gray-500" />
            <div>
              <p className="text-sm font-semibold text-gray-900">Change password</p>
              <p className="text-xs text-gray-500">Used every time you sign in.</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-400" />
        </Link>
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4 text-gray-400">
          <div className="flex items-center gap-3">
            <User className="h-5 w-5" />
            <div>
              <p className="text-sm font-semibold">Edit name / email</p>
              <p className="text-xs">Coming with the next backend release.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
