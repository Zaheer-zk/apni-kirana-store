'use client';

import * as React from 'react';
import { Download, X } from 'lucide-react';
import { cn } from '../lib/utils';

/**
 * Shared "Add to home screen" banner for all three customer-facing web
 * apps (customer-web, store-web, driver-web).
 *
 * Behaviour:
 *   - Listens for the Chromium-only `beforeinstallprompt` event and stashes
 *     it so we can call `prompt()` when the user taps our button.
 *   - Hides itself when the app is already launched in standalone mode
 *     (matchMedia '(display-mode: standalone)' or iOS's
 *     `navigator.standalone`).
 *   - When the user dismisses, we set a localStorage flag with an expiry
 *     timestamp ~7 days out so we don't pester them on every page load.
 *     Storage key is `appLabel`-scoped so each app remembers its own state.
 *   - Hides itself after a successful install (Chromium fires `appinstalled`).
 *   - iOS Safari doesn't fire `beforeinstallprompt`, so on iOS we surface a
 *     short hint pointing at the Share → Add to Home Screen flow. The hint
 *     uses the same dismissal storage.
 *
 * Mount this once near the root of each app (typically inside Providers so
 * it sits under the toaster + react-query client).
 */

const STORAGE_KEY_PREFIX = 'aks:pwa-install-dismissed:';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Subset of the Chromium `BeforeInstallPromptEvent` we actually use. The
 * shape isn't in lib.dom.d.ts yet because the API is still
 * non-standard; declare what we need locally to keep TS happy without
 * widening to `any`.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export interface PwaInstallPromptProps {
  /**
   * Human-readable name shown inside the banner — keeps copy per-app.
   * e.g. "Apni Kirana", "Apni Kirana for Store Operators",
   * "Apni Kirana for Drivers".
   */
  appLabel: string;
  /** Optional className for the outer banner — for one-off positioning tweaks. */
  className?: string;
}

function storageKey(appLabel: string): string {
  return `${STORAGE_KEY_PREFIX}${appLabel}`;
}

function isRecentlyDismissed(appLabel: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(storageKey(appLabel));
    if (!raw) return false;
    const expiresAt = Number.parseInt(raw, 10);
    if (!Number.isFinite(expiresAt)) return false;
    return Date.now() < expiresAt;
  } catch {
    // localStorage can throw in private mode / when quota is exceeded.
    // Failing open here just means we may show the banner again — fine.
    return false;
  }
}

function rememberDismissal(appLabel: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      storageKey(appLabel),
      String(Date.now() + DISMISS_TTL_MS),
    );
  } catch {
    // Best-effort persistence; swallow quota / private-mode errors.
  }
}

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  if (
    window.matchMedia &&
    window.matchMedia('(display-mode: standalone)').matches
  ) {
    return true;
  }
  // iOS Safari sets `navigator.standalone` when launched from the home
  // screen — not in the standards but still the official check.
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function detectIos(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
  // iPadOS 13+ reports as Mac with touch — catch that too.
  const isIpadOs =
    ua.includes('Macintosh') && typeof document !== 'undefined' && 'ontouchend' in document;
  return isIos || isIpadOs;
}

export function PwaInstallPrompt({ appLabel, className }: PwaInstallPromptProps) {
  const [deferredPrompt, setDeferredPrompt] = React.useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [visible, setVisible] = React.useState(false);
  const [iosHint, setIosHint] = React.useState(false);
  const [installing, setInstalling] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isStandaloneMode()) return;
    if (isRecentlyDismissed(appLabel)) return;

    const onBeforeInstall = (event: Event) => {
      // Prevent Chromium's mini-info-bar so we can show our own UI.
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    const onInstalled = () => {
      setVisible(false);
      setDeferredPrompt(null);
      // Once installed, no point asking again on this device.
      rememberDismissal(appLabel);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall as EventListener);
    window.addEventListener('appinstalled', onInstalled);

    // iOS Safari never fires `beforeinstallprompt`. Show a one-time hint
    // pointing at the Share sheet so iPhone users still discover the
    // install path. Delay slightly so it doesn't compete with first paint.
    if (detectIos()) {
      const timer = window.setTimeout(() => setIosHint(true), 2500);
      return () => {
        window.clearTimeout(timer);
        window.removeEventListener('beforeinstallprompt', onBeforeInstall as EventListener);
        window.removeEventListener('appinstalled', onInstalled);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall as EventListener);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [appLabel]);

  const handleInstall = React.useCallback(async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setVisible(false);
        setDeferredPrompt(null);
      } else {
        // User said "Not now" — back off for a week.
        rememberDismissal(appLabel);
        setVisible(false);
        setDeferredPrompt(null);
      }
    } catch {
      // Some browsers throw if prompt() is called twice. Silently reset.
      setVisible(false);
      setDeferredPrompt(null);
    } finally {
      setInstalling(false);
    }
  }, [deferredPrompt, appLabel]);

  const handleDismiss = React.useCallback(() => {
    rememberDismissal(appLabel);
    setVisible(false);
    setIosHint(false);
  }, [appLabel]);

  if (visible && deferredPrompt) {
    return (
      <div
        role="dialog"
        aria-label={`Install ${appLabel}`}
        className={cn(
          'fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-md rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl sm:left-auto sm:right-4 sm:bottom-4 sm:mx-0',
          className,
        )}
      >
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss install prompt"
          className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        <div className="flex items-start gap-3 pr-6">
          <div
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"
          >
            <Download className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">Install {appLabel}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-gray-600">
              Add to your home screen for one-tap access and faster loads — works offline too.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleInstall}
                disabled={installing}
                className="inline-flex h-9 items-center justify-center rounded-md bg-emerald-600 px-3 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {installing ? 'Installing…' : 'Install'}
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (iosHint) {
    return (
      <div
        role="status"
        aria-label={`Install ${appLabel} on iOS`}
        className={cn(
          'fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-md rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl sm:left-auto sm:right-4 sm:bottom-4 sm:mx-0',
          className,
        )}
      >
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss install hint"
          className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        <div className="flex items-start gap-3 pr-6">
          <div
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"
          >
            <Download className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">Install {appLabel}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-gray-600">
              Tap the Share icon in Safari, then choose <strong>Add to Home Screen</strong>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default PwaInstallPrompt;
