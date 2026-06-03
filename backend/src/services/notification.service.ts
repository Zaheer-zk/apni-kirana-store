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

import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import admin from 'firebase-admin';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { config } from '../config/env';
import { sendWebPushToUser } from './web-push.service';

// Map each NotificationEvent to the preference flag it respects (if any).
// Events without a key in this map are always sent (e.g. urgent flow
// notifications like ORDER_CANCELLED).
const PREFERENCE_KEY: Partial<Record<string, keyof PreferencesShape>> = {
  ORDER_PLACED: 'orderUpdates',
  ORDER_ACCEPTED: 'orderUpdates',
  ORDER_REJECTED: 'orderUpdates',
  ORDER_DRIVER_ASSIGNED: 'orderUpdates',
  ORDER_PICKED_UP: 'orderUpdates',
  ORDER_DELIVERED: 'orderUpdates',
  STORE_NEW_ORDER: 'newOrderAlerts',
  STORE_ORDER_OFFERED: 'newOrderAlerts',
  STORE_ORDER_RESCINDED: 'rescindedAlerts',
  DRIVER_NEW_DELIVERY: 'newDeliveryAlerts',
  DRIVER_OFFER_RESCINDED: 'newDeliveryAlerts',
  DRIVER_PAYOUT: 'payoutNotifications',
  ADMIN_NEW_STORE_PENDING: 'newStoreApprovals',
  ADMIN_NEW_DRIVER_PENDING: 'newDriverApprovals',
  PROMO_ANNOUNCE: 'promotional',
};

interface PreferencesShape {
  orderUpdates: boolean;
  promotional: boolean;
  dailySummary: boolean;
  driverUpdates: boolean;
  newOrderAlerts: boolean;
  rescindedAlerts: boolean;
  earningsSummary: boolean;
  newDeliveryAlerts: boolean;
  payoutNotifications: boolean;
  newStoreApprovals: boolean;
  newDriverApprovals: boolean;
  refundEvents: boolean;
}

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
  | 'ADMIN_ORDER_PLACED'
  // Misc
  | 'PROMO_ANNOUNCE'
  | 'CHAT_MESSAGE'
  | 'SUPPORT_REPLY'         // admin → user reply on a support thread
  | 'ADMIN_SUPPORT_NEW'     // user → admin: new message in any thread
  | 'WALLET_CREDIT';        // customer wallet credited (refund / promo / goodwill)

interface Template {
  title: string;
  body: string;
  /**
   * Relative landing URL for this notification, e.g. `/orders/abc` or
   * `/deliveries/new?orderId=abc`. Surfaces in two places:
   *   1. The persisted `notification.data.url` field — the in-app bell
   *      / inbox renders the row as a `<Link>` to this URL.
   *   2. The web-push payload (was previously hardcoded to
   *      `/orders/<orderId>`, which broke driver web-push because the
   *      driver app doesn't have a `/orders/:id` route).
   * Different roles' apps have different route trees, so we encode the
   * correct path per event template instead of deriving it.
   */
  url?: string;
}

type TemplateFn = (vars: Record<string, string>) => Template;

// Helper: customer/store apps both use `/orders/<id>` for the order detail
// route. Driver apps use `/deliveries/<id>` for accepted orders and
// `/deliveries/new?orderId=<id>` for an offer still in the accept window.
const customerOrderUrl = (orderId: string | undefined) =>
  orderId ? `/orders/${orderId}` : undefined;
const driverOfferUrl = (orderId: string | undefined) =>
  orderId ? `/deliveries/new?orderId=${orderId}` : undefined;
const driverDeliveryUrl = (orderId: string | undefined) =>
  orderId ? `/deliveries/${orderId}` : undefined;

const TEMPLATES: Record<NotificationEvent, TemplateFn> = {
  ORDER_PLACED: (v) => ({
    title: 'Order placed',
    body: `Your order #${v.orderShort} is being matched with a nearby store.`,
    url: customerOrderUrl(v.orderId),
  }),
  ORDER_ACCEPTED: (v) => ({
    title: 'Order accepted',
    body: `${v.storeName} is preparing your order. We'll find a delivery partner shortly.`,
    url: customerOrderUrl(v.orderId),
  }),
  ORDER_REJECTED: (v) => ({
    title: 'Order could not be fulfilled',
    body: v.reason
      ? `Order #${v.orderShort} was rejected: ${v.reason}. We're trying another store.`
      : `We're trying another store for order #${v.orderShort}.`,
    url: customerOrderUrl(v.orderId),
  }),
  ORDER_DRIVER_ASSIGNED: (v) => ({
    title: 'Driver on the way',
    body: `${v.driverName} is heading to ${v.storeName} to pick up your order.`,
    url: customerOrderUrl(v.orderId),
  }),
  ORDER_PICKED_UP: (v) => ({
    title: 'Order picked up',
    body: `Your order is on its way. Show OTP ${v.dropoffOtp} to the driver at delivery.`,
    url: customerOrderUrl(v.orderId),
  }),
  ORDER_DELIVERED: (v) => ({
    title: 'Order delivered',
    body: `Your order has been delivered. Tap to rate your experience.`,
    url: customerOrderUrl(v.orderId),
  }),
  ORDER_CANCELLED: (v) => ({
    title: 'Order cancelled',
    body: v.reason ?? 'Your order was cancelled.',
    url: customerOrderUrl(v.orderId),
  }),

  STORE_NEW_ORDER: (v) => ({
    title: 'New order received',
    body: `Order #${v.orderShort} — ${v.itemCount} items, ₹${v.total}. Accept within 3 minutes.`,
    url: customerOrderUrl(v.orderId),
  }),
  STORE_ORDER_OFFERED: (v) => ({
    title: 'New order offer',
    body: `Order #${v.orderShort} — ${v.itemCount} items match your inventory, ${v.distanceKm} km away.`,
    url: customerOrderUrl(v.orderId),
  }),
  STORE_ORDER_RESCINDED: (v) => ({
    title: 'Order taken',
    body: `Order #${v.orderShort} was accepted by another nearby store.`,
  }),
  STORE_APPROVED: () => ({
    title: 'Store approved!',
    body: 'Your store is now live on Quick Easy Mart. Customers can start ordering.',
  }),
  STORE_SUSPENDED: (v) => ({
    title: 'Store suspended',
    body: v.reason ?? 'Your store has been suspended. Contact support for details.',
  }),

  DRIVER_NEW_DELIVERY: (v) => ({
    title: 'New delivery offer',
    body: `Pickup ${v.distanceKm} km away. Estimated earnings ₹${v.earning}. Tap to view.`,
    // /deliveries/new opens the same Accept/Decline dialog as the socket
    // popup — critical so a driver who missed the live socket event (page
    // refreshed, just opened the bell) can still take the offer from the
    // notification row. Previous code routed every webpush to /orders/<id>
    // which 404'd in driver-web.
    url: driverOfferUrl(v.orderId),
  }),
  DRIVER_OFFER_RESCINDED: (v) => ({
    title: 'Offer taken',
    body: `Another driver accepted order #${v.orderShort}. Stay online for the next one.`,
    url: '/',
  }),
  DRIVER_APPROVED: () => ({
    title: "You're approved!",
    body: 'Welcome to the Quick Easy Mart driver network. Tap to go online and start earning.',
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
  ADMIN_ORDER_PLACED: (v) => ({
    title: 'New order placed',
    body: `${v.customerName} ordered ${v.itemCount} items (₹${v.total}) — ${v.city}.`,
  }),

  PROMO_ANNOUNCE: (v) => ({
    title: v.title ?? 'New offer just for you',
    body: v.body ?? `Use code ${v.code} for an exclusive discount.`,
  }),

  CHAT_MESSAGE: (v) => ({
    title: v.senderName ? `${v.senderName} (Order #${v.orderShort})` : 'New message',
    body: v.preview ?? 'You have a new message.',
  }),

  SUPPORT_REPLY: (v) => ({
    title: 'Quick Easy Mart Support',
    body: v.preview ?? 'A support agent replied to your message.',
  }),
  ADMIN_SUPPORT_NEW: (v) => ({
    title: v.senderName ? `Support: ${v.senderName} (${v.role})` : 'New support message',
    body: v.preview ?? 'A user is asking for help.',
  }),

  WALLET_CREDIT: (v) => ({
    title: 'Wallet credited',
    body: v.reason
      ? `₹${v.amount} added to your wallet — ${v.reason}. New balance: ₹${v.balance}.`
      : `₹${v.amount} added to your wallet. New balance: ₹${v.balance}.`,
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
  // Honor user preferences (if set). Missing preferences row = all defaults true.
  const prefKey = PREFERENCE_KEY[event];
  if (prefKey) {
    const prefs = await prisma.notificationPreferences.findUnique({ where: { userId } });
    if (prefs && prefs[prefKey] === false) {
      // User has opted out of this category; skip both DB write and push
      return;
    }
  }

  const stringVars = Object.fromEntries(
    Object.entries(vars).map(([k, v]) => [k, v == null ? '' : String(v)]),
  );
  const tpl = TEMPLATES[event](stringVars);
  // Merge the template's url into the persisted data so the in-app inbox
  // can render the row as a Link, AND so the web-push handler doesn't have
  // to re-derive it. Existing rows without `data.url` continue to render
  // as no-op buttons (graceful degrade).
  await persistAndPush(userId, tpl.title, tpl.body, {
    event,
    ...stringVars,
    ...(tpl.url ? { url: tpl.url } : {}),
  });
}

/**
 * Send the same templated notification to every admin user. Useful for
 * platform-wide events like new orders, pending approvals, refund alerts.
 */
export async function notifyAdmins(
  event: NotificationEvent,
  vars: Record<string, string | number | undefined> = {},
): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', isActive: true },
    select: { id: true },
  });
  await Promise.all(admins.map((a) => notify(event, a.id, vars)));
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
  const event = (data?.event as string | undefined) ?? null;

  // Layer 1: always-on in-app row. Drives the bell icon AND serves as the
  // dispatch log row for the INAPP channel.
  await prisma.notification.create({
    data: {
      userId,
      title,
      body,
      data: data ?? Prisma.JsonNull,
      event,
      channel: 'INAPP',
      status: 'DELIVERED',
    },
  });

  // Layer 2: push fan-out. One dispatch row per device attempt so per-device
  // failures stay visible. We pass userId/event down so helpers can log.
  const devices = await prisma.device.findMany({
    where: { userId },
    select: { id: true, token: true },
  });

  if (devices.length > 0) {
    for (const d of devices) {
      // Route by token shape: ExponentPushToken[xxx] → Expo Push (free, no
      // Firebase project). Anything else is treated as a raw FCM token.
      if (Expo.isExpoPushToken(d.token)) {
        sendExpoPush(d.id, d.token, userId, title, body, data, event).catch(() => {});
      } else {
        sendFcmPush(d.id, d.token, userId, title, body, data, event).catch(() => {});
      }
    }
  } else if (process.env.NODE_ENV !== 'test') {
    console.log(`[Notify] (in-app only — no push token) [${title}] ${body}`);
  }

  // Layer 3: web push (admin browser). Logs a single WEBPUSH row summarising
  // the fan-out across browser subscriptions. We only log when at least one
  // subscription was actually attempted so the table doesn't fill with noise
  // for users who never enabled web push.
  void dispatchWebPush(userId, title, body, data, event);
}

// ─── Dispatch logging helpers ────────────────────────────────────────────────

type DispatchChannel = 'PUSH' | 'WEBPUSH' | 'SOCKET' | 'EMAIL' | 'SMS';
type DispatchStatus = 'DELIVERED' | 'FAILED' | 'PENDING';

async function logDispatch(
  userId: string,
  title: string,
  body: string,
  data: Record<string, string> | undefined,
  event: string | null,
  channel: DispatchChannel,
  status: DispatchStatus,
  error?: string,
): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId,
        title,
        body,
        data: data ?? Prisma.JsonNull,
        event,
        channel,
        status,
        error: error ?? null,
        // Dispatch rows aren't user-facing in-app messages — mark read so the
        // bell counter isn't inflated by per-channel duplicates.
        isRead: true,
      },
    });
  } catch (err) {
    // Logging failures must never break the actual notification flow.
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[Notify] failed to log dispatch row:', (err as Error).message);
    }
  }
}

async function dispatchWebPush(
  userId: string,
  title: string,
  body: string,
  data: Record<string, string> | undefined,
  event: string | null,
): Promise<void> {
  try {
    // Prefer the explicit `url` set by the template (role-aware path) over
    // the legacy `/orders/<orderId>` heuristic — that heuristic 404'd on
    // driver-web for every offer push.
    const pushUrl =
      typeof data?.url === 'string' && data.url.startsWith('/')
        ? data.url
        : typeof data?.orderId === 'string'
          ? `/orders/${data.orderId}`
          : '/';
    const result = await sendWebPushToUser(userId, {
      title,
      body,
      url: pushUrl,
    });
    if (!result.attempted) return; // no subscriptions / no VAPID — don't pollute log
    const status: DispatchStatus = result.failed > 0 ? 'FAILED' : 'DELIVERED';
    await logDispatch(
      userId,
      title,
      body,
      data,
      event,
      'WEBPUSH',
      status,
      result.firstError,
    );
  } catch (err) {
    await logDispatch(
      userId,
      title,
      body,
      data,
      event,
      'WEBPUSH',
      'FAILED',
      (err as Error).message,
    );
  }
}

// ─── Expo Push (free, no Firebase account required) ─────────────────────────
//
// Mobile apps register with `getExpoPushTokenAsync()` which returns
// `ExponentPushToken[xxx]`. We POST to https://exp.host/--/api/v2/push/send
// (handled by the Expo SDK) and Expo's relay forwards to APNs/FCM.

const expo = new Expo();

async function deleteDeadDevice(deviceId: string): Promise<void> {
  await prisma.device.delete({ where: { id: deviceId } }).catch(() => {});
}

async function sendExpoPush(
  deviceId: string,
  token: string,
  userId: string,
  title: string,
  body: string,
  data: Record<string, string> | undefined,
  event: string | null,
): Promise<void> {
  const message: ExpoPushMessage = {
    to: token,
    title,
    body,
    data,
    sound: 'default',
    priority: 'high',
    channelId: data?.event?.startsWith('STORE_')
      ? 'store-default'
      : data?.event?.startsWith('DRIVER_')
        ? 'driver-default'
        : 'default',
  };
  try {
    const tickets: ExpoPushTicket[] = await expo.sendPushNotificationsAsync([message]);
    const ticket = tickets[0];
    if (ticket?.status === 'error') {
      const code = ticket.details?.error;
      if (code === 'DeviceNotRegistered') {
        await deleteDeadDevice(deviceId);
        console.log(`[Expo] Removed dead device ${deviceId}`);
        await logDispatch(
          userId,
          title,
          body,
          data,
          event,
          'PUSH',
          'FAILED',
          `Expo: DeviceNotRegistered (device ${deviceId} removed)`,
        );
        return;
      }
      console.warn(`[Expo] push error for device ${deviceId}:`, ticket.message, code);
      await logDispatch(
        userId,
        title,
        body,
        data,
        event,
        'PUSH',
        'FAILED',
        `Expo: ${ticket.message ?? code ?? 'unknown error'}`,
      );
      return;
    }
    await logDispatch(userId, title, body, data, event, 'PUSH', 'DELIVERED');
  } catch (err) {
    console.error('[Expo] send error:', err);
    await logDispatch(
      userId,
      title,
      body,
      data,
      event,
      'PUSH',
      'FAILED',
      (err as Error).message,
    );
  }
}

async function sendFcmPush(
  deviceId: string,
  fcmToken: string,
  userId: string,
  title: string,
  body: string,
  data: Record<string, string> | undefined,
  event: string | null,
): Promise<void> {
  const app = tryInitFirebase();
  if (!app) {
    console.log(`[FCM] (disabled) [${title}] ${body}`);
    // FCM disabled isn't a delivery failure per se, but the admin should see
    // that no push was actually sent. Log as FAILED with a clear reason.
    await logDispatch(
      userId,
      title,
      body,
      data,
      event,
      'PUSH',
      'FAILED',
      'FCM disabled (no Firebase credentials configured)',
    );
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
    await logDispatch(userId, title, body, data, event, 'PUSH', 'DELIVERED');
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (
      e?.code === 'messaging/registration-token-not-registered' ||
      e?.code === 'messaging/invalid-registration-token'
    ) {
      await deleteDeadDevice(deviceId);
      console.log(`[FCM] Removed dead device ${deviceId}`);
      await logDispatch(
        userId,
        title,
        body,
        data,
        event,
        'PUSH',
        'FAILED',
        `FCM: ${e.code} (device ${deviceId} removed)`,
      );
      return;
    }
    console.error('[FCM] send error:', err);
    await logDispatch(
      userId,
      title,
      body,
      data,
      event,
      'PUSH',
      'FAILED',
      `FCM: ${e?.message ?? e?.code ?? 'unknown error'}`,
    );
  }
}
