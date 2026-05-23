/* eslint-disable no-restricted-globals */
/**
 * Minimal service worker for the Quick Easy Mart store dashboard PWA.
 *
 * What it gives us:
 *   1. Lighthouse "installable PWA" tick (manifest + active SW + HTTPS).
 *   2. Stale-while-revalidate caching for the app shell + static assets,
 *      so the dashboard opens instantly on subsequent visits and even
 *      keeps loading while the network is patchy.
 *   3. Network-first for API requests so order data never goes stale.
 *
 * It deliberately does NOT try to be a full offline-first app — store
 * owners need live order data, not yesterday's cached orders.
 */

const CACHE_VERSION = 'aks-store-web-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL = ['/', '/login', '/offline'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        cache.addAll(APP_SHELL).catch(() => {
          // First-install failures (e.g. /offline missing) shouldn't block
          // activation; precaching is best-effort.
          return undefined;
        }),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(CACHE_VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache API responses — orders/stock data must be live.
  if (url.pathname.startsWith('/api/')) return;

  // Cross-origin (e.g. tile servers) — let the browser handle it.
  if (url.origin !== self.location.origin) return;

  // Stale-while-revalidate for everything else.
  event.respondWith(
    caches.open(RUNTIME_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            cache.put(request, response.clone()).catch(() => undefined);
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    }),
  );
});
