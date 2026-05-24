'use client';

import './globals.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import TopLoader from '@/components/TopLoader';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Cache for 5 minutes — most admin data doesn't change second-by-second,
        // and the bell + page-level invalidations refresh what matters.
        staleTime: 5 * 60_000,
        gcTime: 10 * 60_000,
        // Don't refetch every time the user switches back to the tab — that
        // was the biggest source of perceived slowness.
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Stable client across re-renders / Strict Mode
  const [queryClient] = useState(makeQueryClient);
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>Apni Kirana — Admin</title>
        <meta name="description" content="Internal admin dashboard for Apni Kirana" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/favicon.png" />
        <meta name="theme-color" content="#16A34A" />
        {/*
          Belt-and-suspenders: the admin app is NOT a PWA and has no
          service worker of its own. But if a rogue SW from another
          subdomain (typically customer-web during a past misconfig where
          nginx briefly routed admin → customer-web) ever got installed on
          this origin, it would intercept every fetch and keep showing
          the wrong app. This inline script unregisters any SW on this
          origin AND wipes any caches, then reloads once (gated by
          sessionStorage so we don't loop forever on a hostile network).

          Runs as early as possible — before React mounts, before the
          QueryClientProvider, before any API call — so a stale
          customer-web shell can't keep the admin UI hostage.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                if (typeof window === 'undefined') return;
                if (!('serviceWorker' in navigator)) return;
                if (sessionStorage.getItem('aks-admin-sw-purged') === '1') return;
                navigator.serviceWorker.getRegistrations().then(function(regs) {
                  if (!regs.length) return;
                  Promise.all(regs.map(function(r) { return r.unregister(); }))
                    .then(function() {
                      if (typeof caches !== 'undefined') {
                        return caches.keys().then(function(keys) {
                          return Promise.all(keys.map(function(k) { return caches.delete(k); }));
                        });
                      }
                    })
                    .then(function() {
                      sessionStorage.setItem('aks-admin-sw-purged', '1');
                      console.warn('[admin] Removed', regs.length, 'rogue service worker(s) and cleared caches. Reloading.');
                      window.location.reload();
                    })
                    .catch(function(err) { console.warn('[admin] SW purge failed:', err); });
                });
              })();
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <QueryClientProvider client={queryClient}>
          <Suspense fallback={null}>
            <TopLoader />
          </Suspense>
          <AuthGuard>{children}</AuthGuard>
        </QueryClientProvider>
      </body>
    </html>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // Only show the loading spinner on the very first auth check. Subsequent
  // navigations don't need to re-mount or flash a spinner.
  const firstCheckDone = useRef(false);
  const [allowRender, setAllowRender] = useState(firstCheckDone.current);

  useEffect(() => {
    const publicPaths = ['/login'];
    const isPublic = publicPaths.some((p) => pathname.startsWith(p));

    if (!isPublic && !isAuthenticated()) {
      router.replace('/login');
      return;
    }
    firstCheckDone.current = true;
    setAllowRender(true);
  }, [pathname, router]);

  if (!allowRender) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
