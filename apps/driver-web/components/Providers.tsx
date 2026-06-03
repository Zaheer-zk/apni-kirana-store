'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Toaster } from '@aks/ui/components/sonner';
import { PwaInstallPrompt } from '@aks/ui/components/PwaInstallPrompt';
import { OfferProvider } from './OfferProvider';

/**
 * Client-side providers wrapper for driver-web. Mirrors customer-web —
 * stable React Query client across Strict Mode + Sonner toaster mounted
 * once at the root, plus a one-time service-worker registration so the
 * PWA installability criterion is met.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    // Defer to idle so SW registration doesn't compete with hydration.
    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((err) => {
          // Don't break the app if SW registration fails (e.g. private mode).
          console.warn('[driver-web] SW registration failed', err);
        });
    };
    if ('requestIdleCallback' in window) {
      (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(
        register,
      );
    } else {
      setTimeout(register, 1500);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Global socket listener — opens an offer modal anywhere in the app
          when the matching engine pushes a delivery offer to this driver. */}
      <OfferProvider />
      <Toaster
        position="top-center"
        richColors
        closeButton
        toastOptions={{ duration: 3500 }}
      />
      <PwaInstallPrompt appLabel="Quick Easy Mart for Drivers" />
    </QueryClientProvider>
  );
}
