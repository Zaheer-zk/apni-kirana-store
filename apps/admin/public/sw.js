/* Apni Kirana Admin — service worker for web push */
/* eslint-disable no-restricted-globals */

self.addEventListener('install', (event) => {
  // Activate immediately on first install so the SW can receive pushes ASAP.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

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
