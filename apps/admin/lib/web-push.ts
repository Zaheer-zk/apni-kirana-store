import { api } from './api';

/**
 * Convert a base64url-encoded VAPID key into the Uint8Array form that
 * `pushManager.subscribe({ applicationServerKey })` expects.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64Safe);
  return new Uint8Array(Array.from(rawData).map((c) => c.charCodeAt(0)));
}

function unwrap<T>(payload: unknown): T | null {
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    if (o['data'] && typeof o['data'] === 'object') return o['data'] as T;
    return o as T;
  }
  return null;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration('/sw.js');
    if (existing) return existing;
    return await navigator.serviceWorker.register('/sw.js');
  } catch (err) {
    console.error('[web-push] register sw failed:', err);
    return null;
  }
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await registerServiceWorker();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const res = await api.get('/api/v1/notifications/web-push/public-key');
    const data = unwrap<{ publicKey: string }>(res.data);
    return data?.publicKey ?? null;
  } catch (err) {
    console.error('[web-push] fetch public key failed:', err);
    return null;
  }
}

export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const reg = await registerServiceWorker();
  if (!reg) return null;

  const publicKey = await fetchVapidPublicKey();
  if (!publicKey) return null;

  // If we already have a subscription, reuse it instead of creating a duplicate.
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  // Send the subscription to the backend so it can be used for push.
  // PushSubscription.toJSON() yields { endpoint, keys: { p256dh, auth } }.
  const json = sub.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;

  try {
    await api.post('/api/v1/notifications/web-push/subscribe', {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
  } catch (err) {
    console.error('[web-push] subscribe POST failed:', err);
    return null;
  }

  return sub;
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await registerServiceWorker();
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  try {
    await sub.unsubscribe();
  } catch (err) {
    console.error('[web-push] unsubscribe local failed:', err);
  }
  try {
    await api.post('/api/v1/notifications/web-push/unsubscribe', { endpoint });
  } catch (err) {
    console.error('[web-push] unsubscribe POST failed:', err);
  }
}
