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

## Incoming offer modal

When the server emits `order:assigned` to the driver's `user:<id>` room, the modal opens with:

- Store name + distance + ETA
- Drop area + distance from store
- Estimated payout
- A circular 60-second countdown

Outcomes:

- **Accept** → `PUT /drivers/orders/:id/accept`, navigate to Active Delivery screen.
- **Reject** → `PUT /drivers/orders/:id/reject`, modal closes, driver remains online.
- **Timeout** → modal closes automatically, server cascades to next driver.

Multiple offers are queued — only one modal shows at a time.

## Active delivery flow

The Active Delivery screen has a single primary action that morphs by status:

| Order status | Button | After tap |
| --- | --- | --- |
| `DRIVER_ASSIGNED` | "I'm at the store" | nothing server-side; arms next button |
| arrived | "Picked up" | `PUT /drivers/orders/:id/pickup` |
| `DRIVER_PICKED_UP` | "Delivered" | `PUT /drivers/orders/:id/deliver` |

Optional proof-of-delivery photo is uploaded to Cloudinary then sent in the `deliver` body as `proofImageUrl`.

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

## Environment variables

| Var | Example |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | `http://192.168.1.42:3001` |
| `EXPO_PUBLIC_GOOGLE_MAPS_KEY` | `AIza...` |
| `EXPO_PUBLIC_CLOUDINARY_CLOUD` | `apni-kirana` |
| `EXPO_PUBLIC_CLOUDINARY_UNSIGNED_PRESET` | `driver_docs` |
