'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2, X } from 'lucide-react';
import {
  getCurrentSubscription,
  isPushSupported,
  subscribeToPush,
} from '@/lib/web-push';

const DISMISS_KEY = 'admin_push_banner_dismissed';

type BannerState = 'checking' | 'hidden' | 'prompt' | 'unsupported' | 'denied';

export default function EnableNotificationsBanner() {
  const [state, setState] = useState<BannerState>('checking');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (typeof window === 'undefined') return;
      if (!isPushSupported()) {
        if (!cancelled) setState('unsupported');
        return;
      }
      if (Notification.permission === 'denied') {
        if (!cancelled) setState('denied');
        return;
      }
      const dismissed = window.localStorage.getItem(DISMISS_KEY) === '1';
      const sub = await getCurrentSubscription();
      if (cancelled) return;
      if (sub) {
        setState('hidden');
        return;
      }
      setState(dismissed ? 'hidden' : 'prompt');
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleEnable() {
    setBusy(true);
    try {
      const sub = await subscribeToPush();
      if (sub) {
        setState('hidden');
        window.localStorage.removeItem(DISMISS_KEY);
      } else if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'denied'
      ) {
        setState('denied');
      }
    } finally {
      setBusy(false);
    }
  }

  function handleDismiss() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_KEY, '1');
    }
    setState('hidden');
  }

  if (state === 'checking' || state === 'hidden' || state === 'unsupported') {
    return null;
  }

  if (state === 'denied') {
    return (
      <div className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <BellOff className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div className="flex-1">
          <p className="font-medium">Browser notifications are blocked</p>
          <p className="text-xs text-amber-700">
            Update your browser site settings to allow notifications, then reload this page.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="ml-2 inline-flex h-7 w-7 items-center justify-center rounded text-amber-700 hover:bg-amber-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // prompt
  return (
    <div className="flex items-start gap-3 border-b border-primary-100 bg-primary-50 px-4 py-3 text-sm text-primary">
      <Bell className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <div className="flex-1">
        <p className="font-medium">Enable browser notifications</p>
        <p className="text-xs text-primary/80">
          Get instant alerts for new orders, store approvals, and driver activity.
        </p>
      </div>
      <button
        type="button"
        onClick={handleEnable}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
        Enable
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded text-primary hover:bg-primary-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
