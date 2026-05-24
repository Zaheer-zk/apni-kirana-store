'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, KeyRound, LogOut, User } from 'lucide-react';
import { api } from '@/lib/api';
import { clearToken, getAdminInfo, isSuperAdmin } from '@/lib/auth';
import { unsubscribeFromPush } from '@/lib/web-push';

/**
 * Top-right account dropdown for the admin shell.
 *
 * Shows the logged-in admin's initials in an avatar circle; click reveals
 * name, username/email, and the "Change password" + "Log out" actions.
 * Admin doesn't use @radix-ui yet, so this is a hand-rolled dropdown with a
 * click-outside listener — small, no new deps, behaves like the other web
 * apps' profile menus.
 */
export default function AdminProfileMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(() => getAdminInfo());
  const ref = useRef<HTMLDivElement>(null);

  // Refresh from localStorage on mount (Storage events from other tabs would
  // also work, but the menu is rendered on every page so this is enough).
  useEffect(() => {
    setInfo(getAdminInfo());
  }, []);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function handleLogout() {
    setOpen(false);
    // Same best-effort teardown as the Sidebar's logout path.
    try {
      await Promise.allSettled([
        unsubscribeFromPush().catch(() => undefined),
        api.delete('/api/v1/notifications/fcm-token').catch(() => undefined),
      ]);
    } catch {
      // ignore — logout always proceeds
    }
    clearToken();
    router.replace('/login');
  }

  const display = info?.name?.trim() || info?.username || 'Admin';
  const subtitle = info?.username || info?.email || '';
  const initials = (display || 'A')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || 'A';
  const superBadge = isSuperAdmin();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-2 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
          {initials}
        </span>
        <span className="hidden max-w-[140px] truncate sm:inline">{display}</span>
        <ChevronDown className="hidden h-4 w-4 text-gray-400 sm:block" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          {/* Header row — name + username/email. */}
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold text-gray-900">{display}</p>
            {subtitle ? (
              <p className="mt-0.5 truncate text-xs text-gray-500">{subtitle}</p>
            ) : null}
            {superBadge ? (
              <span className="mt-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                Super admin
              </span>
            ) : null}
          </div>

          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <User className="h-4 w-4" />
            Profile
          </Link>
          <Link
            href="/change-password"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <KeyRound className="h-4 w-4" />
            Change password
          </Link>

          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}
