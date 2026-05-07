'use client';

import './globals.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';

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
        <title>Apni Kirana Store — Admin</title>
        <meta name="description" content="Internal admin dashboard for Apni Kirana Store" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body suppressHydrationWarning>
        <QueryClientProvider client={queryClient}>
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
