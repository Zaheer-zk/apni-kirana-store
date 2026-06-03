'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Toaster } from '@aks/ui/components/sonner';
import { PwaInstallPrompt } from '@aks/ui/components/PwaInstallPrompt';

/**
 * Client-side providers wrapper. Holds React Query's client (stable across
 * re-renders + Strict Mode double-invocation), mounts Sonner's toaster
 * once at the root, registers the PWA service worker, and surfaces the
 * shared "Add to home screen" banner once the browser fires
 * `beforeinstallprompt`.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Search + storefront data is fairly static within a session;
            // 2-minute stale time keeps things snappy without being stale.
            staleTime: 2 * 60_000,
            gcTime: 10 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  // Register the hand-written service worker. Production only — in dev,
  // service workers fight with HMR and cache stale chunks.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((err) => {
          // Don't break the app if SW registration fails (private mode, etc.).
          console.warn('[customer-web] SW registration failed', err);
        });
    };
    // Defer to idle so SW install doesn't fight first paint / hydration.
    if ('requestIdleCallback' in window) {
      (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(
        register,
      );
    } else {
      window.setTimeout(register, 1500);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        position="top-center"
        richColors
        closeButton
        toastOptions={{ duration: 3500 }}
      />
      <PwaInstallPrompt appLabel="Quick Easy Mart" />
    </QueryClientProvider>
  );
}
