# Notifications

Notifications are the platform's nervous system — they wake apps when an order
state changes, prompt store owners to accept new offers, and alert admins to
incidents that need attention. The stack has three layers:

1. **In-app inbox** — every notification is persisted in the `Notification`
   table and surfaced via `GET /notifications`. This is the source of truth and
   drives the unread badge.
2. **Mobile push (Expo Push, with FCM fallback)** — by default we use the free
   Expo Push Service: mobile apps register with `getExpoPushTokenAsync()` and
   the backend sends via `expo-server-sdk`. Expo's relay forwards to APNs/FCM
   for us, so **no Firebase service account is required for development**. If
   the saved token is a raw FCM token (does not start with
   `ExponentPushToken[`), the backend falls back to `firebase-admin`.
3. **Web push (browser)** — the admin dashboard subscribes its browser via the
   standard Push API + VAPID. The backend uses the `web-push` library to fan
   out to every registered subscription.

Each user also has a row in `NotificationPreferences` (auto-provisioned on
first read) that toggles whole categories on or off. Preference checks happen
inside `notify()` before any DB write or push fan-out, so an opted-out user
gets neither.

## Architecture

```
                        Domain event
        (order accepted / driver assigned / promo / ...)
                              |
                              v
                  notify(event, userId, vars)
                              |
                              v
              +--- check NotificationPreferences ---+
              | event maps to a preference flag?    |
              | flag === false  -> return (no row,  |
              |                    no push)         |
              +-------------------------------------+
                              |
                              v
                +-------------+-------------+
                |                           |
                v                           v
       persist Notification row     fan-out best-effort
       (in-app inbox source         (failures swallowed,
        of truth)                    DB row stays put)
                                              |
                            +-----------------+-------------------+
                            |                                     |
                            v                                     v
                    User.fcmToken set?            WebPushSubscription rows for user?
                    yes -> Expo.isExpoPushToken?   yes -> webpush.sendNotification()
                            yes -> expo.send()             (per subscription)
                            no  -> firebase-admin.send()   404/410 -> auto-delete row

Client surfaces:

  +-----------------+  +-----------------+  +-----------------+  +-----------------+
  | Customer app    |  | Driver app      |  | Store portal    |  | Admin dashboard |
  | (Expo Push)     |  | (Expo Push)     |  | (Expo Push)     |  | (browser / Web  |
  |                 |  |                 |  |                 |  |  Push + VAPID)  |
  +-----------------+  +-----------------+  +-----------------+  +-----------------+
       iOS + Android        Android-first         Android-first        Chrome / Edge /
                                                                       Firefox / Safari
```

`notify(event, userId, vars)` is the **only** entry point — never write to the
`Notification` table or call `firebase-admin` directly from a controller.
Templates live alongside the function so the same event reads the same on
every surface.

## Events

The complete event catalog as of `notification.service.ts`:

| Event key | Recipient | Preference flag | Default title | Default body |
| --- | --- | --- | --- | --- |
| `ORDER_PLACED` | customer | `orderUpdates` | Order placed | Your order #{{orderShort}} is being matched with a nearby store. |
| `ORDER_ACCEPTED` | customer | `orderUpdates` | Order accepted | {{storeName}} is preparing your order. We'll find a delivery partner shortly. |
| `ORDER_REJECTED` | customer | `orderUpdates` | Order could not be fulfilled | We're trying another store for order #{{orderShort}}. |
| `ORDER_DRIVER_ASSIGNED` | customer | `orderUpdates` | Driver on the way | {{driverName}} is heading to {{storeName}} to pick up your order. |
| `ORDER_PICKED_UP` | customer | `orderUpdates` | Order picked up | Your order is on its way. Show OTP {{dropoffOtp}} to the driver at delivery. |
| `ORDER_DELIVERED` | customer | `orderUpdates` | Order delivered | Your order has been delivered. Tap to rate your experience. |
| `ORDER_CANCELLED` | store + driver (if assigned) | always | Order cancelled | {{reason}} or "Your order was cancelled." |
| `STORE_NEW_ORDER` | store owner | `newOrderAlerts` | New order received | Order #{{orderShort}} — {{itemCount}} items, ₹{{total}}. Accept within 3 minutes. |
| `STORE_ORDER_OFFERED` | store owner | `newOrderAlerts` | New order offer | Order #{{orderShort}} — {{itemCount}} items match your inventory, {{distanceKm}} km away. |
| `STORE_ORDER_RESCINDED` | store owner | `rescindedAlerts` | Order taken | Order #{{orderShort}} was accepted by another nearby store. |
| `STORE_APPROVED` | store owner | always | Store approved! | Your store is now live on Apni Kirana Store. Customers can start ordering. |
| `STORE_SUSPENDED` | store owner | always | Store suspended | {{reason}} or "Your store has been suspended. Contact support for details." |
| `DRIVER_NEW_DELIVERY` | driver | `newDeliveryAlerts` | New delivery offer | Pickup {{distanceKm}} km away. Estimated earnings ₹{{earning}}. Tap to view. |
| `DRIVER_OFFER_RESCINDED` | driver | `newDeliveryAlerts` | Offer taken | Another driver accepted order #{{orderShort}}. Stay online for the next one. |
| `DRIVER_APPROVED` | driver | always | You're approved! | Welcome to the Apni Kirana driver network. Tap to go online and start earning. |
| `DRIVER_SUSPENDED` | driver | always | Account suspended | {{reason}} or "Your driver account has been suspended. Contact support." |
| `DRIVER_PAYOUT` | driver | `payoutNotifications` | Payout processed | ₹{{amount}} has been transferred to your registered account. |
| `ADMIN_NEW_STORE_PENDING` | admin | `newStoreApprovals` | New store awaiting approval | {{storeName}} just registered. Review and approve. |
| `ADMIN_NEW_DRIVER_PENDING` | admin | `newDriverApprovals` | New driver awaiting approval | {{driverName}} ({{vehicleType}}) just registered. |
| `PROMO_ANNOUNCE` | targeted users | `promotional` | {{title}} or "New offer just for you" | {{body}} or "Use code {{code}} for an exclusive discount." |

### Always-on events

The following events ignore preferences entirely — they're either safety
notices or the user explicitly cares about the outcome:

- `ORDER_CANCELLED` — the user must know their delivery isn't coming.
- `ORDER_DELIVERED` — confirmation + rating prompt; never silenced.
- `STORE_APPROVED`, `STORE_SUSPENDED`, `DRIVER_APPROVED`, `DRIVER_SUSPENDED`
  — onboarding / account-state changes.
- `ORDER_REJECTED` — even if `orderUpdates` is enabled, the customer always
  gets this; it's listed in the table because it currently still respects
  `orderUpdates` (most users keep it on; the preference is tracked for future
  fine-grained controls).

### Data payload

Every push/web-push includes a `data` object of stringified key/value pairs
with at least `{ event, ...vars }`. Common keys:

| Key | Meaning |
| --- | --- |
| `event` | The `NotificationEvent` key (e.g. `ORDER_DELIVERED`) — clients route on this. |
| `orderId` | When present, the client deep-links to the order tracking screen. The web push service worker uses this to set `url: /orders/{{orderId}}`. |

## Push delivery per surface

### Customer / Driver / Store-portal (mobile)

All three Expo apps share the same registration pattern (see
`apps/customer/lib/notifications.ts`, mirrored in driver + store-portal):

```ts
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

// Foreground delivery shows banner + plays sound
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function registerForPush() {
  if (!Device.isDevice) return;
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;

  const { data: token } = await Notifications.getExpoPushTokenAsync();
  await api.put('/notifications/fcm-token', { token });
}
```

Key points:

- `getExpoPushTokenAsync()` returns an **Expo push token** of the form
  `ExponentPushToken[xxx]`. The backend detects this prefix and routes through
  `expo-server-sdk` (free, no Firebase project required). Tokens that don't
  match — i.e. raw FCM tokens from `getDevicePushTokenAsync()` — fall through
  to `firebase-admin`, kept as a future option.
- The token is PUT to `PUT /api/v1/notifications/fcm-token`, which writes
  `User.fcmToken`. Only the latest token is stored — multi-device support
  would require a separate `Device` table (planned).
- A tap handler reads `response.notification.request.content.data` and
  navigates to `/order/{{orderId}}` if `data.orderId` is present.
- Foreground delivery is enabled via `setNotificationHandler` so the user sees
  the banner even with the app in the foreground.

### Admin dashboard (browser)

The admin surface uses the W3C Push API directly — no FCM. Subscriptions are
per-browser, identified by their PushManager `endpoint` URL.

Service worker at `public/sw.js`:

```js
self.addEventListener('push', (event) => {
  const payload = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Apni Kirana', {
      body: payload.body,
      icon: payload.icon ?? '/icon-192.png',
      data: { url: payload.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
```

Subscribe flow on the admin client:

```ts
const { publicKey } = await api.get('/notifications/web-push/public-key');
const reg = await navigator.serviceWorker.register('/sw.js');
const sub = await reg.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: urlBase64ToUint8Array(publicKey),
});
await api.post('/notifications/web-push/subscribe', sub.toJSON());
```

`sub.toJSON()` already serializes to `{ endpoint, keys: { p256dh, auth } }`,
which is exactly what the backend expects. Repeat subscriptions are upserted
on `endpoint`, so re-subscribing from the same browser is idempotent.

When `notify(...)` runs, the backend calls `sendWebPushToUser(userId, payload)`
which loads every `WebPushSubscription` for that user and dispatches in
parallel. Failed sends with status 404 (gone) or 410 (deleted) auto-remove the
dead subscription row.

## Preferences

Stored in `NotificationPreferences`, one row per user, fields are all booleans.

| Field | Default | Controls |
| --- | --- | --- |
| `orderUpdates` | `true` | Customer-facing order lifecycle (placed, accepted, rejected, driver assigned, picked up, delivered) |
| `promotional` | `true` | `PROMO_ANNOUNCE` blasts |
| `dailySummary` | `false` | Future: end-of-day digest of orders/earnings |
| `driverUpdates` | `true` | Reserved for live driver-status updates to customers |
| `newOrderAlerts` | `true` | Store: incoming order + offer events |
| `rescindedAlerts` | `true` | Store: another store accepted before us |
| `earningsSummary` | `false` | Future: store/driver earnings summary push |
| `newDeliveryAlerts` | `true` | Driver: new offer + rescinded |
| `payoutNotifications` | `true` | Driver: payout processed |
| `newStoreApprovals` | `true` | Admin: a store registered and is awaiting review |
| `newDriverApprovals` | `true` | Admin: a driver registered and is awaiting review |
| `refundEvents` | `true` | Admin: customer-initiated refund |

### Provisioning

`GET /api/v1/users/me/preferences` auto-creates the row with defaults if it's
missing, so clients never have to handle a 404 — the first GET always returns
a hydrated row.

### Event → preference mapping

The backend mapping lives in `notification.service.ts` as `PREFERENCE_KEY`:

```ts
const PREFERENCE_KEY = {
  ORDER_PLACED:           'orderUpdates',
  ORDER_ACCEPTED:         'orderUpdates',
  ORDER_REJECTED:         'orderUpdates',
  ORDER_DRIVER_ASSIGNED:  'orderUpdates',
  ORDER_PICKED_UP:        'orderUpdates',
  ORDER_DELIVERED:        'orderUpdates',
  STORE_NEW_ORDER:        'newOrderAlerts',
  STORE_ORDER_OFFERED:    'newOrderAlerts',
  STORE_ORDER_RESCINDED:  'rescindedAlerts',
  DRIVER_NEW_DELIVERY:    'newDeliveryAlerts',
  DRIVER_OFFER_RESCINDED: 'newDeliveryAlerts',
  DRIVER_PAYOUT:          'payoutNotifications',
  ADMIN_NEW_STORE_PENDING: 'newStoreApprovals',
  ADMIN_NEW_DRIVER_PENDING: 'newDriverApprovals',
  PROMO_ANNOUNCE:         'promotional',
};
```

Events not in this map are always sent (`ORDER_CANCELLED`, `STORE_APPROVED`,
`STORE_SUSPENDED`, `DRIVER_APPROVED`, `DRIVER_SUSPENDED`).

When the matching flag is `false`, `notify()` returns immediately — **no DB
row is written** and **no push is sent**. The user sees nothing in their
inbox either, which is the desired behavior for a hard opt-out.

## Configuration

### Environment variables

| Var | Required for | Notes |
| --- | --- | --- |
| _(none)_ | Expo Push | Expo Push Service is **anonymous** — no project ID or API key needed. Optional `EXPO_ACCESS_TOKEN` raises rate limits when set. |
| `FIREBASE_PROJECT_ID` | FCM (fallback) | from Firebase console; only needed if you opt out of Expo Push |
| `FIREBASE_CLIENT_EMAIL` | FCM (fallback) | service-account email |
| `FIREBASE_PRIVATE_KEY` | FCM (fallback) | escape newlines as `\n` in `.env`; the loader parses them back |
| `VAPID_PUBLIC_KEY` | Web Push | base64 url-safe |
| `VAPID_PRIVATE_KEY` | Web Push | base64 url-safe |
| `VAPID_SUBJECT` | Web Push | `mailto:` URI; defaults to `mailto:admin@apnikirana.in` |

### Generating VAPID keys

```bash
npx web-push generate-vapid-keys --json
```

Copy `publicKey` to `VAPID_PUBLIC_KEY` and `privateKey` to `VAPID_PRIVATE_KEY`.
Set them once and **don't rotate without re-subscribing every browser** — the
public key is what `pushManager.subscribe()` was called with, so changing it
invalidates every subscription.

### Dev mode behavior

All three transports degrade gracefully:

- **Expo Push**: works out-of-the-box with no env config. Errors (e.g.
  `DeviceNotRegistered`) clear the dead token from `User.fcmToken`.
- **FCM (fallback)**: `tryInitFirebase()` returns `null` when creds are missing
  and logs `[FCM] (disabled) [title] body`. Only used when the saved token is
  not an Expo token.
- **Web Push**: `ensureConfigured()` returns `false`, logs
  `[WebPush] (disabled — no VAPID keys) [title] body`, and returns. No retry,
  no crash.

A fresh `git clone` + `docker compose up` gives you a working push pipeline
end-to-end on Expo Go / dev clients with **zero external accounts**.

## Token lifecycle

### Expo Push (mobile, default)

When `expo.sendPushNotificationsAsync()` returns a ticket with
`status === 'error'` and `details.error === 'DeviceNotRegistered'`, the backend
nulls out `User.fcmToken`. The next app launch re-registers via
`getExpoPushTokenAsync()`. Other ticket errors (`MessageTooBig`,
`InvalidCredentials`, `MessageRateExceeded`) are logged but the token is left
in place.

### FCM (mobile, fallback)

When `firebase-admin.send()` returns one of:

- `messaging/registration-token-not-registered`
- `messaging/invalid-registration-token`

…the backend nulls out `User.fcmToken` so we don't keep retrying. The next
app launch re-registers via the standard flow.

### Web Push (browser)

`webpush.sendNotification()` rejects with `statusCode: 404` (subscription gone)
or `statusCode: 410` (deleted). Both trigger an immediate `delete` of the
matching `WebPushSubscription` row. Any other status code is logged but the
subscription is left in place (transient errors).

### Logout

Currently a known TODO: clients should ideally call
`POST /notifications/web-push/unsubscribe` (admin) or null their FCM token
(mobile) on logout to stop pushes from arriving on a logged-out device. Until
then, the next push to a stale token simply triggers the cleanup paths above.

## Delivery guarantees

| Channel | Guarantee |
| --- | --- |
| `Notification` DB row | Always written, transactionally, before any push fan-out (unless preferences opt-out). |
| Expo Push / FCM | Best-effort; failures are caught and logged but do not block the request. |
| Web Push | Best-effort per-subscription; one failed endpoint does not prevent the others. |
| Socket | Best-effort; only delivered if the user is currently connected. |

If a user is offline when an event fires, they'll see it the moment they open
the app (DB inbox) and likely earlier as a system push.

## Extending

To add a new event:

1. Add the key to the `NotificationEvent` union in `notification.service.ts`.
2. Add a template entry to `TEMPLATES`.
3. (Optional) Add an entry to `PREFERENCE_KEY` if it should respect a flag —
   add a new field to `NotificationPreferences` first if no existing flag fits.
4. Call `notify('YOUR_EVENT', userId, vars)` from the domain code.

Migrations are required for any new preference field; remember to update the
whitelist in `PUT /users/me/preferences` so clients can actually toggle it.
