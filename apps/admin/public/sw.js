/* Apni Kirana Admin — service worker for web push.
 *
 * IMPORTANT: this SW intentionally does NOT cache anything. Admin pages are
 * always served from the network. Earlier, the customer-web sw.js got
 * installed on the admin.quickeasymart.com origin during a brief nginx
 * misconfig and kept serving the customer-web shell from its cache, so
 * activate() below explicitly wipes ALL caches on this origin and claims
 * every open admin tab — when the rogue SW's next update check fetches
 * this file, the new code takes over and the bad caches die.
 */
/* eslint-disable no-restricted-globals */

const SW_VERSION = 'aks-admin-sw-v2';

self.addEventListener('install', (event) => {
  // Activate immediately so the new code starts working on the very next
  // load; we never want the user stuck on an old SW.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 1. Nuke every cache on this origin — kills any rogue customer-web
      //    or store-web cache that might be holding the wrong shell.
      try {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      } catch (e) {
        console.warn('[admin sw] cache wipe failed', e);
      }
      // 2. Take control of all open admin tabs immediately.
      await self.clients.claim();
      // 3. Force every controlled tab to reload so they re-fetch from the
      //    network — without this, an already-open admin tab would keep
      //    showing whatever its old SW cached.
      try {
        const list = await self.clients.matchAll({ type: 'window' });
        for (const c of list) {
          // navigate triggers a hard reload that bypasses any leftover cache.
          if ('navigate' in c) c.navigate(c.url);
        }
      } catch (e) {
        console.warn('[admin sw] client reload failed', e);
      }
      console.log('[admin sw]', SW_VERSION, 'activated; caches wiped; clients reloaded.');
    })(),
  );
});

// No fetch handler on purpose. Without this listener the browser uses its
// default networking, i.e. straight to nginx/admin:3000. This is the
// permanent guard against an old SW ever caching admin HTML again.

// ─── Web push (the actual reason this SW exists) ───────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch (_e) {
    data = { title: 'Apni Kirana', body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Apni Kirana', {
      body: data.body,
      icon: data.icon || '/icon.png',
      badge: '/badge.png',
      data: { url: data.url || '/' },
      tag: data.tag,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((wins) => {
      for (const w of wins) {
        if (w.url.includes(url) && 'focus' in w) return w.focus();
      }
      return clients.openWindow(url);
    }),
  );
});
