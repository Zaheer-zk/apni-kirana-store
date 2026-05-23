'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { isAuthenticated } from '@/lib/auth';

/**
 * Client-side auth gate. Bounces to /login (with `next=`) the moment we
 * detect there's no token. Don't depend on this for security — the real
 * gate is the backend's JWT check + the api.ts 401 interceptor; this just
 * spares the user a flash of a blank dashboard.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
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
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }
  return <>{children}</>;
}
