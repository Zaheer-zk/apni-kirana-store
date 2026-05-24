'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredUser, type StoredUser } from './auth';

/**
 * Client-side React hook: returns the stored user once the component mounts
 * (avoids SSR/CSR hydration mismatches by starting `null` and resolving in
 * an effect). When `redirectTo` is set, the hook navigates to
 * `/login?next=<redirectTo>` if no session is present.
 *
 * Kept light on purpose — there's no global context, every consumer reads
 * the same localStorage row. Components that need a richer profile (with
 * email, default address, etc.) should pair this with
 * `useQuery({ queryKey: ['me'], queryFn: () => api.get('/users/me') })`.
 */
export function useUser({ redirectTo }: { redirectTo?: string } = {}): {
  user: StoredUser | null;
  mounted: boolean;
} {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = getStoredUser();
    setUser(stored);
    setMounted(true);
    if (!stored && redirectTo) {
      router.replace(`/login?next=${encodeURIComponent(redirectTo)}`);
    }
  }, [redirectTo, router]);

  return { user, mounted };
}
