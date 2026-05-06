# Notifications

Notifications are delivered through two complementary channels:

1. **DB notifications** — persisted in the `Notification` table, surfaced via `GET /notifications`. Drives the in-app inbox and unread badge.
2. **FCM push** — Firebase Cloud Messaging via `firebase-admin` on the backend. Wakes the device when the app is backgrounded.

Most events fire **both** — the DB row is the source of truth; the push is the nudge.

## Architecture

```
Domain event (e.g. order accepted)
        |
        v
  notify(userId, type, payload)
        |
        +--> insert Notification row
        |
        +--> if user.fcmToken: send FCM push
        |
        +--> if user is connected via socket: emit 'order:status' / similar
```

The `notify()` helper lives at `apps/backend/src/services/notifications.ts` and is the **only** path through which notifications are created — this keeps templates centralised.

## Event catalog

| Event | Trigger | Recipient | Title | Body |
| --- | --- | --- | --- | --- |
| `OTP` | `/auth/send-otp` | self | "Your OTP" | "{{code}} — valid for 5 min" |
| `ORDER_PLACED` | order created | customer | "Order placed" | "Looking for the best store for you" |
| `ORDER_ACCEPTED` | store accepts | customer | "{{store}} accepted your order" | "Estimated {{eta}} min to ready" |
| `ORDER_REJECTED` | store rejects | customer | "Store unavailable" | "Trying the next best store" |
| `ORDER_READY` | store taps Ready | customer | "Your order is packed" | "Looking for a delivery partner" |
| `ORDER_ASSIGNED` (customer) | driver accepts | customer | "{{driver}} is on the way" | "Vehicle: {{vehicle}}" |
| `ORDER_ASSIGNED` (driver) | offer cascade | driver | "New delivery" | "{{km}} km · ₹{{payout}}" |
| `ORDER_NEW` | offer cascade | store owner | "New order — {{count}} items" | "Subtotal ₹{{subtotal}} · respond in 3 min" |
| `ORDER_PICKED_UP` | driver pickup | customer | "Order picked up" | "{{driver}} is en route" |
| `ORDER_DELIVERED` | driver delivers | customer | "Delivered" | "Rate your experience" |
| `ORDER_CANCELLED` | customer cancels | store + driver (if assigned) | "Order cancelled" | "Order #{{shortId}} was cancelled by the customer" |
| `STORE_APPROVED` | admin approve | store owner | "Your store is live" | "You can start receiving orders" |
| `DRIVER_APPROVED` | admin approve | driver | "You're approved" | "Toggle online to start earning" |
| `PROMO` | manual / scheduled | targeted users | varies | varies |

All FCM messages include a `data` field with at least `{ type, ...domainIds }` so the app can deep-link.

## FCM token management

### Registration (mobile)

On login, and again on token refresh:

```ts
import messaging from '@react-native-firebase/messaging';

await messaging().requestPermission();
const fcmToken = await messaging().getToken();
await api.put('/notifications/fcm-token', { fcmToken, platform: Platform.OS });

messaging().onTokenRefresh(async (token) => {
  await api.put('/notifications/fcm-token', { fcmToken: token, platform: Platform.OS });
});
```

### Storage (backend)

Stored on `User.fcmToken` + `User.platform`. We only keep the latest token per user — multi-device support would require a separate `Device` table (planned).

### Sending (backend)

```ts
import admin from 'firebase-admin';

await admin.messaging().send({
  token: user.fcmToken,
  notification: { title, body },
  data: stringifyValues(data), // FCM requires string values
  android: { priority: 'high' },
  apns: { payload: { aps: { sound: 'default' } } },
});
```

### Invalid token cleanup

When `firebase-admin` returns `messaging/registration-token-not-registered` or `messaging/invalid-registration-token`, the backend nulls out `User.fcmToken`. The next app launch will re-register.

## Delivery guarantees

| Channel | Guarantee |
| --- | --- |
| DB row | Always written before FCM is attempted |
| FCM | Best-effort; failures logged but don't block the request |
| Socket | Best-effort; only delivered if the user is online |

The combination means: if a user is offline when an event happens, they'll see it the moment they open the app (DB) and likely earlier as a push (FCM).

## Local dev

- OTP push is **bypassed** in dev — the OTP is logged via `console.log` to save Twilio cost. Look for `OTP for 9999988888 = 123456` in `docker compose logs backend`.
- Other notifications still attempt FCM if a token exists, but are no-ops without one. The DB row is always written so the in-app inbox works.
