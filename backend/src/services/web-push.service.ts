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

export interface WebPushDispatchResult {
  /** True when VAPID keys are configured and at least one send was attempted. */
  attempted: boolean;
  /** Number of subscriptions targeted. */
  total: number;
  /** Number of successful deliveries. */
  delivered: number;
  /** Number of failed deliveries (network/server errors; not "gone" cleanups). */
  failed: number;
  /** First failure message, if any — surfaced in the admin dispatch log. */
  firstError?: string;
}

/**
 * Push a notification to every web push subscription registered for `userId`.
 * Failures (gone subscription, network error) silently delete the dead row.
 * Returns a per-call summary so the notification dispatcher can log it.
 */
export async function sendWebPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string; icon?: string },
): Promise<WebPushDispatchResult> {
  if (!ensureConfigured()) {
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[WebPush] (disabled — no VAPID keys) [${payload.title}] ${payload.body}`);
    }
    return { attempted: false, total: 0, delivered: 0, failed: 0 };
  }
  const subs = await prisma.webPushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) {
    return { attempted: false, total: 0, delivered: 0, failed: 0 };
  }

  let delivered = 0;
  let failed = 0;
  let firstError: string | undefined;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
        );
        delivered += 1;
      } catch (err: unknown) {
        const e = err as { statusCode?: number; message?: string };
        // 404 (gone) or 410 (deleted) → cleanup
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await prisma.webPushSubscription.delete({ where: { id: s.id } }).catch(() => {});
          console.log(`[WebPush] removed dead subscription for user ${userId}`);
          // Treat "gone" as a soft-fail (not surfaced as a delivery failure).
          delivered += 0;
        } else {
          failed += 1;
          if (!firstError) firstError = e?.message ?? 'Web push delivery failed';
          console.warn('[WebPush] send error:', err);
        }
      }
    }),
  );

  return {
    attempted: true,
    total: subs.length,
    delivered,
    failed,
    ...(firstError !== undefined ? { firstError } : {}),
  };
}
