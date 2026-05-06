// =====================================================================================
// Notification service — templated push + in-app notifications.
//
// Two layers:
//   1. Always: save a row to `Notification` table (drives the in-app bell)
//   2. Best-effort: send FCM push if user has an fcmToken (graceful failure)
//
// Templates live in this file so every "new order assigned" message reads the same.
// To send a notification:
//   await notify('ORDER_DELIVERED', userId, { orderId, customerName: 'Anita' });
//
// The legacy `sendNotification(userId, title, body, data)` API is kept for backward
// compatibility — new code should prefer `notify(...)` with a typed event key.
// =====================================================================================

import { prisma } from '../config/prisma';
import admin from 'firebase-admin';
import { config } from '../config/env';

// ─── Firebase init (lazy, dev-safe) ──────────────────────────────────────────

let firebaseEnabled: boolean | null = null;
let firebaseApp: admin.app.App | null = null;

function tryInitFirebase(): admin.app.App | null {
  if (firebaseEnabled === false) return null;
  if (firebaseApp) return firebaseApp;
  if (admin.apps.length > 0) {
    firebaseApp = admin.apps[0]!;
    firebaseEnabled = true;
    return firebaseApp;
  }
  try {
    const { projectId, clientEmail, privateKey } = config.firebase;
    if (!projectId || !clientEmail || !privateKey || projectId === 'test') {
      // No real Firebase credentials — disable FCM and log to console only.
      firebaseEnabled = false;
      return null;
    }
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
    firebaseEnabled = true;
    return firebaseApp;
  } catch (err) {
    console.warn('[FCM] Firebase init failed — push disabled:', (err as Error).message);
    firebaseEnabled = false;
    return null;
  }
}

// ─── Templates ───────────────────────────────────────────────────────────────

export type NotificationEvent =
  // Order lifecycle (customer-facing)
  | 'ORDER_PLACED'
  | 'ORDER_ACCEPTED'
  | 'ORDER_REJECTED'
  | 'ORDER_DRIVER_ASSIGNED'
  | 'ORDER_PICKED_UP'
  | 'ORDER_DELIVERED'
  | 'ORDER_CANCELLED'
  // Store-side
  | 'STORE_NEW_ORDER'
  | 'STORE_ORDER_OFFERED'
  | 'STORE_ORDER_RESCINDED'
  | 'STORE_APPROVED'
  | 'STORE_SUSPENDED'
  // Driver-side
  | 'DRIVER_NEW_DELIVERY'
  | 'DRIVER_OFFER_RESCINDED'
  | 'DRIVER_APPROVED'
  | 'DRIVER_SUSPENDED'
  | 'DRIVER_PAYOUT'
  // Admin-side
  | 'ADMIN_NEW_STORE_PENDING'
  | 'ADMIN_NEW_DRIVER_PENDING'
  // Misc
  | 'PROMO_ANNOUNCE';

interface Template {
  title: string;
  body: string;
}

type TemplateFn = (vars: Record<string, string>) => Template;

const TEMPLATES: Record<NotificationEvent, TemplateFn> = {
  ORDER_PLACED: (v) => ({
    title: 'Order placed',
    body: `Your order #${v.orderShort} is being matched with a nearby store.`,
  }),
  ORDER_ACCEPTED: (v) => ({
    title: 'Order accepted',
    body: `${v.storeName} is preparing your order. We'll find a delivery partner shortly.`,
  }),
  ORDER_REJECTED: (v) => ({
    title: 'Order could not be fulfilled',
    body: v.reason
      ? `Order #${v.orderShort} was rejected: ${v.reason}. We're trying another store.`
      : `We're trying another store for order #${v.orderShort}.`,
  }),
  ORDER_DRIVER_ASSIGNED: (v) => ({
    title: 'Driver on the way',
    body: `${v.driverName} is heading to ${v.storeName} to pick up your order.`,
  }),
  ORDER_PICKED_UP: (v) => ({
    title: 'Order picked up',
    body: `Your order is on its way. Show OTP ${v.dropoffOtp} to the driver at delivery.`,
  }),
  ORDER_DELIVERED: () => ({
    title: 'Order delivered',
    body: `Your order has been delivered. Tap to rate your experience.`,
  }),
  ORDER_CANCELLED: (v) => ({
    title: 'Order cancelled',
    body: v.reason ?? 'Your order was cancelled.',
  }),

  STORE_NEW_ORDER: (v) => ({
    title: 'New order received',
    body: `Order #${v.orderShort} — ${v.itemCount} items, ₹${v.total}. Accept within 3 minutes.`,
  }),
  STORE_ORDER_OFFERED: (v) => ({
    title: 'New order offer',
    body: `Order #${v.orderShort} — ${v.itemCount} items match your inventory, ${v.distanceKm} km away.`,
  }),
  STORE_ORDER_RESCINDED: (v) => ({
    title: 'Order taken',
    body: `Order #${v.orderShort} was accepted by another nearby store.`,
  }),
  STORE_APPROVED: () => ({
    title: 'Store approved!',
    body: 'Your store is now live on Apni Kirana Store. Customers can start ordering.',
  }),
  STORE_SUSPENDED: (v) => ({
    title: 'Store suspended',
    body: v.reason ?? 'Your store has been suspended. Contact support for details.',
  }),

  DRIVER_NEW_DELIVERY: (v) => ({
    title: 'New delivery offer',
    body: `Pickup ${v.distanceKm} km away. Estimated earnings ₹${v.earning}. Tap to view.`,
  }),
  DRIVER_OFFER_RESCINDED: (v) => ({
    title: 'Offer taken',
    body: `Another driver accepted order #${v.orderShort}. Stay online for the next one.`,
  }),
  DRIVER_APPROVED: () => ({
    title: "You're approved!",
    body: 'Welcome to the Apni Kirana driver network. Tap to go online and start earning.',
  }),
  DRIVER_SUSPENDED: (v) => ({
    title: 'Account suspended',
    body: v.reason ?? 'Your driver account has been suspended. Contact support.',
  }),
  DRIVER_PAYOUT: (v) => ({
    title: 'Payout processed',
    body: `₹${v.amount} has been transferred to your registered account.`,
  }),

  ADMIN_NEW_STORE_PENDING: (v) => ({
    title: 'New store awaiting approval',
    body: `${v.storeName} just registered. Review and approve.`,
  }),
  ADMIN_NEW_DRIVER_PENDING: (v) => ({
    title: 'New driver awaiting approval',
    body: `${v.driverName} (${v.vehicleType}) just registered.`,
  }),

  PROMO_ANNOUNCE: (v) => ({
    title: v.title ?? 'New offer just for you',
    body: v.body ?? `Use code ${v.code} for an exclusive discount.`,
  }),
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Templated notification: looks up the event template, renders title/body,
 * persists to DB, and best-effort sends FCM push.
 */
export async function notify(
  event: NotificationEvent,
  userId: string,
  vars: Record<string, string | number | undefined> = {},
): Promise<void> {
  const stringVars = Object.fromEntries(
    Object.entries(vars).map(([k, v]) => [k, v == null ? '' : String(v)]),
  );
  const tpl = TEMPLATES[event](stringVars);
  await persistAndPush(userId, tpl.title, tpl.body, { event, ...stringVars });
}

/**
 * Legacy ad-hoc notification API. Prefer `notify(event, userId, vars)`.
 */
export async function sendNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  await persistAndPush(userId, title, body, data);
}

async function persistAndPush(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  await prisma.notification.create({
    data: { userId, title, body, data: data ?? null },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fcmToken: true },
  });

  if (user?.fcmToken) {
    sendFcmPush(user.id, user.fcmToken, title, body, data).catch(() => {
      // FCM failures swallowed
    });
  } else if (process.env.NODE_ENV !== 'test') {
    // Dev-friendly: log so you can see what would have been pushed
    console.log(`[Notify] (in-app only — no FCM token) [${title}] ${body}`);
  }
}

async function sendFcmPush(
  userId: string,
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  const app = tryInitFirebase();
  if (!app) {
    console.log(`[FCM] (disabled) [${title}] ${body}`);
    return;
  }
  try {
    await admin.messaging(app).send({
      token: fcmToken,
      notification: { title, body },
      data,
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (
      e?.code === 'messaging/registration-token-not-registered' ||
      e?.code === 'messaging/invalid-registration-token'
    ) {
      // Token is dead — clear it so we don't retry
      await prisma.user.update({ where: { id: userId }, data: { fcmToken: null } }).catch(() => {});
      console.log(`[FCM] Cleared invalid token for user ${userId}`);
      return;
    }
    console.error('[FCM] send error:', err);
  }
}
