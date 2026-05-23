'use client';

import { useEffect } from 'react';

/**
 * Registers the hand-written service worker at `/sw.js`. We avoid
 * `next-pwa` because it currently lags Next 16's App Router; the SW we ship
 * is tiny (precache + stale-while-revalidate) and only needs to register
 * once per origin so Lighthouse marks the app installable.
 *
 * Service workers only ship in production builds — in dev they cause more
 * trouble than they solve (stale assets, broken hot reload).
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((err) => {
          console.warn('[store-web] sw register failed', err);
        });
    };
    window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);

  return null;
}
