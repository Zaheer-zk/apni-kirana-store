'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { isAuthenticated } from '@/lib/auth';

/**
 * Client-side gate for any route under the authenticated shell. If there's
 * no token in localStorage we redirect to /login?next=<current>. While we're
 * checking (which is one tick on mount) we render a centred spinner so the
 * dashboard doesn't briefly flash unauthenticated content.
 *
 * Server-side auth gating isn't possible here because tokens live in
 * localStorage; if we ever move to httpOnly cookies this can become a
 * middleware.ts redirect instead.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      const next = encodeURIComponent(pathname ?? '/');
      router.replace(`/login?next=${next}`);
      return;
    }
    setReady(true);
  }, [router, pathname]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  return <>{children}</>;
}
