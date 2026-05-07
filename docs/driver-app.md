# Driver App

The Expo React Native app delivery partners use to receive and complete deliveries.

## Lifecycle

```
Sign up (phone OTP)
   -> Submit driver registration (vehicle, license, photo)
   -> PENDING admin approval
   -> Approved -> push notification "You're approved"
   -> Toggle ONLINE
   -> Receive offer (60s modal) -> Accept
   -> Navigate to store -> tap "Picked up"
   -> Navigate to drop -> tap "Delivered"
   -> Repeat. Toggle OFFLINE to stop.
```

## Screens

| Screen | Notes |
| --- | --- |
| Login | Phone + OTP |
| Onboarding | Vehicle, license, license image upload (Cloudinary) |
| Pending Approval | Status screen, refreshes on `DRIVER_APPROVED` push |
| Home (Online toggle) | Big switch + earnings summary |
| Incoming Offer Modal | 60-second timer, store + drop details + payout |
| Active Delivery | Map, "Open Maps" button, status action button |
| Earnings | Day / week / month tabs |
| Profile | Documents, bank details, support |

## Online / offline toggle

When the user flips the switch:

```ts
await api.put('/drivers/status', { status: 'ONLINE' });
await Location.requestBackgroundPermissionsAsync();
await startBackgroundLocationTask();
```

Going offline does the inverse: stops the task, calls `/drivers/status` with `OFFLINE`. The server immediately removes the driver from the assignment pool.

## Incoming offer modal — broadcast mode

When the server emits **`order:offered`** (or the legacy `order:assigned`) to
the driver's `user:<id>` room, the modal opens with:

- Store name + distance + ETA
- Drop area (only label/city/pincode — never street name; see Privacy)
- Estimated payout
- A circular **60-second** countdown (`DRIVER_ACCEPT_TIMEOUT_MS`)

In `BROADCAST` mode (default), the same offer is sent to **up to 3 ONLINE
drivers in parallel** within 5 km of the store. First driver to call
`PUT /drivers/orders/:id/accept` wins.

Outcomes:

- **Accept** → `PUT /drivers/orders/:id/accept`, navigate to Active Delivery screen.
- **Reject** → `PUT /drivers/orders/:id/reject`, modal closes, driver remains online.
- **Rescinded** → `order:rescinded` socket event arrives because another driver accepted first. Modal closes with a "Another driver took it — stay online" toast.
- **Timeout** → modal closes automatically, server safety-net broadcasts to the next batch after 2 min.

Multiple offers are queued — only one modal shows at a time.

> Legacy `CASCADE` mode (`DRIVER_MATCHING_MODE=CASCADE`) sends the offer to
> one driver at a time with the same 60s window. Same UI.

## Active delivery flow

The Active Delivery screen has a single primary action that morphs by status:

| Order status | Button | After tap |
| --- | --- | --- |
| `DRIVER_ASSIGNED` | "I'm at the store" | nothing server-side; arms next button |
| arrived | "Picked up" | `PUT /drivers/orders/:id/pickup` |
| `PICKED_UP` | "Delivered" | opens **Enter dropoff OTP** sheet (see below) |

### Confirming delivery with the dropoff OTP

The "Delivered" button does NOT immediately mark the order delivered. It opens
a sheet asking for the **4-digit dropoff OTP**:

1. The driver asks the customer to read the 4-digit code shown in the
   customer's app (visible there once the order moved to `PICKED_UP`).
2. The driver types it into the sheet.
3. App calls `PUT /drivers/orders/:id/deliver` with `{ "dropoffOtp": "1234" }`.
4. Server compares against `Order.dropoffOtp`:
   - **Match** → status moves to `DELIVERED`, driver earnings credit the delivery fee, customer is notified.
   - **Mismatch / missing** → `400` returned, status stays `PICKED_UP`, the sheet shows "Incorrect code" and lets the driver retry.

There is no override — the OTP is the **only** way to complete a delivery in
the driver app. Admins can fall back to `PUT /admin/orders/:id/assign-driver`
or read the OTP off the order detail page if a customer loses their phone.

## Privacy

The driver app intentionally hides customer PII. Server-side, `GET /orders/:id`
strips fields when `req.user.role === 'DRIVER'`:

| What you see | What you DON'T see |
| --- | --- |
| Pickup store: name, coords, address | Customer name |
| Order items + total + COD flag | Customer phone |
| Dropoff coords (`lat`, `lng`) | Recipient name |
| Dropoff `label`, `city`, `pincode` | Street name / `line1` / `line2` |

There is no in-app way to call the customer — coordination relies on:

- The `label` ("Home", "Office") and city/pincode for context.
- Map navigation to the dropoff coordinates.
- The dropoff OTP at handoff.

A masked-call number (Twilio) is on the roadmap. Until then, the OTP-only
handoff is the privacy contract — never share screenshots that show the OTP
or any customer info from a different driver's screen.

## Background GPS — `expo-task-manager`

```ts
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';

TaskManager.defineTask(LOCATION_TASK, ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  const last = locations[locations.length - 1];
  // Send via Socket.io if connected, fall back to REST PUT /drivers/location
  emitLocation(last);
});

await Location.startLocationUpdatesAsync(LOCATION_TASK, {
  accuracy: Location.Accuracy.High,
  timeInterval: 5000,
  distanceInterval: 25,
  showsBackgroundLocationIndicator: true,
  foregroundService: {
    notificationTitle: 'Apni Kirana — On duty',
    notificationBody: 'Sharing location while you are online',
  },
});
```

Battery considerations:

- Location updates only run while `status=ONLINE`.
- Updates are throttled to 5s / 25m to balance freshness and battery.
- The foreground service notification is mandatory on Android 10+ for background GPS.

## Earnings

Pulled from `GET /drivers/earnings`. The screen has three tabs (today / week / month) and shows:

- Total deliveries
- Total earnings
- Average per delivery
- A simple bar chart by day

## Push notifications

The driver app uses the **Expo Push Service** via `expo-notifications` —
the same pattern as the customer app (see `apps/customer/lib/notifications.ts`
for the canonical implementation).

```ts
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPush() {
  if (!Device.isDevice) return;
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;
  const { data: token } = await Notifications.getExpoPushTokenAsync();
  await api.put('/notifications/fcm-token', { token });
}
```

Token registration auto-runs on every authenticated launch so the backend
always has a fresh token. Tap on a `DRIVER_NEW_DELIVERY` notification opens
the active delivery screen for `data.orderId`.

### Notification preferences

The Profile screen exposes a **Notifications** sub-screen synced with the
backend via `GET|PUT /api/v1/users/me/preferences`. First load
auto-provisions defaults.

Driver-relevant flags:

| Flag | What it gates |
| --- | --- |
| `newDeliveryAlerts` | `DRIVER_NEW_DELIVERY` and `DRIVER_OFFER_RESCINDED` |
| `payoutNotifications` | `DRIVER_PAYOUT` |
| `earningsSummary` | Future end-of-day / weekly earnings summary |
| `promotional` | Platform-side promo announcements |

Always-on for drivers: `DRIVER_APPROVED`, `DRIVER_SUSPENDED`,
`ORDER_CANCELLED` (when the driver is assigned to an order that gets cancelled).
See `docs/notifications.md` for the full mapping.

## Environment variables

| Var | Example |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | `http://192.168.1.42:3001` |
| `EXPO_PUBLIC_GOOGLE_MAPS_KEY` | `AIza...` |
| `EXPO_PUBLIC_CLOUDINARY_CLOUD` | `apni-kirana` |
| `EXPO_PUBLIC_CLOUDINARY_UNSIGNED_PRESET` | `driver_docs` |
