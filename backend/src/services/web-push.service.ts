// Web push (browser PushManager) — used by the admin dashboard so admins
// get desktop notifications for new pending approvals, refunds, etc.
//
// Uses VAPID keys generated once and stored in env. If keys are missing,
// the service degrades to console logs (dev-friendly).
import webpush from 'web-push';
import { prisma } from '../config/prisma';

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY ?? '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:admin@apnikirana.in';

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return false;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  configured = true;
  return true;
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC;
}

/**
 * Push a notification to every web push subscription registered for `userId`.
 * Failures (gone subscription, network error) silently delete the dead row.
 */
export async function sendWebPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string; icon?: string },
): Promise<void> {
  if (!ensureConfigured()) {
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[WebPush] (disabled — no VAPID keys) [${payload.title}] ${payload.body}`);
    }
    return;
  }
  const subs = await prisma.webPushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
        );
      } catch (err: unknown) {
        const e = err as { statusCode?: number };
        // 404 (gone) or 410 (deleted) → cleanup
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await prisma.webPushSubscription.delete({ where: { id: s.id } }).catch(() => {});
          console.log(`[WebPush] removed dead subscription for user ${userId}`);
        } else {
          console.warn('[WebPush] send error:', err);
        }
      }
    }),
  );
}
