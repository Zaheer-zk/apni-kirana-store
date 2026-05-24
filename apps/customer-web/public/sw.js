/* eslint-disable no-restricted-globals */
/**
 * Service worker for the Apni Kirana customer storefront PWA.
 *
 * Goals:
 *   1. Satisfy Lighthouse's "installable PWA" criterion (manifest + active
 *      SW + HTTPS), so the install prompt actually fires in Chromium.
 *   2. Cache the app shell + static assets so the storefront loads fast on
 *      repeat visits (and gracefully shows an offline page when the network
 *      is fully down).
 *   3. Stay out of the way of API responses — product, inventory and order
 *      data must always be live; never cached here.
 *
 * Bump CACHE_VERSION on every deploy so old shells get evicted.
 */

const CACHE_VERSION = 'aks-customer-web-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/favicon.png',
  '/logo-horizontal.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/offline.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        // Best-effort precache — missing files shouldn't block activation.
        Promise.all(
          APP_SHELL.map((url) =>
            cache.add(url).catch(() => undefined),
          ),
        ),
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

  // Never intercept API traffic — orders, cart, search must be live and
  // backend lives on a different origin anyway.
  if (url.pathname.startsWith('/api/')) return;
  if (url.origin !== self.location.origin) return;

  // Cache-first for hashed Next.js static assets — they're immutable.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response && response.status === 200 && response.type === 'basic') {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Navigation requests: network-first, fall back to cached shell, then
  // the static offline page when both miss.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const shell = await caches.match('/');
          if (shell) return shell;
          const offline = await caches.match('/offline.html');
          return offline || new Response('Offline', { status: 503 });
        }),
    );
    return;
  }

  // Everything else (images, fonts) — stale-while-revalidate.
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
