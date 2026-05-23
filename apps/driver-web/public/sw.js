/* eslint-disable no-restricted-globals */

// Driver-web service worker. Kept intentionally small — Lighthouse PWA
// install criteria only require a registered SW that handles a fetch event.
// We use a "network-first, fall back to cache" strategy for navigation
// requests so drivers see fresh data online but still get the offline shell
// when the connection drops mid-shift.

const CACHE_NAME = 'aks-driver-web-v1';
const OFFLINE_SHELL = '/offline.html';

// Pre-cache the offline shell and the manifest so the PWA install is
// instant even on slow networks.
const PRECACHE_URLS = [
  OFFLINE_SHELL,
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never cache API calls — the backend is on a different origin and
  // responses are user-specific.
  if (url.pathname.startsWith('/api/')) return;

  // For navigations (HTML), try the network first, fall back to the
  // offline shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(OFFLINE_SHELL).then((r) => r || new Response('Offline', { status: 503 })),
      ),
    );
    return;
  }

  // For same-origin static assets — cache-first.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            // Only cache successful, basic responses.
            if (res.ok && res.type === 'basic') {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
