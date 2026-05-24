'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Toaster } from '@aks/ui/components/sonner';
import { PwaInstallPrompt } from '@aks/ui/components/PwaInstallPrompt';
import { PwaRegister } from './PwaRegister';

/**
 * Client-side providers wrapper. Holds React Query's client (stable across
 * re-renders + Strict Mode double-invocation), mounts Sonner's toaster
 * once, and triggers the PWA service-worker registration.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Inventory / orders refresh quickly, but data is light. 60s
            // keeps the dashboard snappy while live polling (15-30s in
            // individual queries) drives the real updates.
            staleTime: 60_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        position="top-center"
        richColors
        closeButton
        toastOptions={{ duration: 3500 }}
      />
      <PwaRegister />
      <PwaInstallPrompt appLabel="Apni Kirana for Store Operators" />
    </QueryClientProvider>
  );
}
