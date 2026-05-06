# Store Portal

The Expo React Native app store owners use to register their shop, manage their catalog, and accept/reject incoming orders.

## Lifecycle

```
Sign up (phone OTP)
   -> Submit store registration (name, category, address, photo)
   -> PENDING admin approval
   -> Approved -> push "Your store is live"
   -> Add inventory items
   -> Toggle "Open" to start receiving orders
   -> Receive incoming order banner (3 min timer) -> Accept
   -> Pack -> tap "Ready"
   -> Wait for driver pickup
   -> Repeat
```

## Screens

| Screen | Notes |
| --- | --- |
| Login | Phone + OTP |
| Onboarding | Store details + image upload |
| Pending Approval | Refreshes on `STORE_APPROVED` push |
| Dashboard | Today's orders, GMV, open/closed toggle |
| Inventory | List, add, edit, toggle availability, adjust stock |
| Add/Edit Item | Form + image picker (Cloudinary) |
| Incoming Order Banner | 3-minute timer overlay on top of any screen |
| Active Orders | Orders accepted but not yet ready / picked up |
| Order Detail | Items, customer, driver info, action button |
| Operating Hours | Per-day schedule |
| Profile / Settings | Bank, GST, support |

## Inventory CRUD

| Action | Endpoint |
| --- | --- |
| List | `GET /stores/:id/items` |
| Add | `POST /items` |
| Edit | `PUT /items/:id` |
| Delete | `DELETE /items/:id` |
| Quick toggle | `PUT /items/:id/toggle-availability` |
| Stock adjust | `PUT /items/:id/stock` |

The list view supports a swipe action for "Out of stock" (single tap to toggle availability) — the most common use during a busy day.

## Image upload

Images go directly from the app to Cloudinary using an unsigned upload preset, then the resulting `secure_url` is sent to the backend. This avoids round-tripping large files through our API.

```ts
const data = new FormData();
data.append('file', { uri, name: 'item.jpg', type: 'image/jpeg' } as any);
data.append('upload_preset', PRESET);
const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, {
  method: 'POST', body: data,
});
const { secure_url } = await res.json();
```

## Incoming order banner — 3 minute window

When the server emits `order:new` to the store owner's `user:<id>` room, a top banner appears with:

- Item summary (`2x Amul Milk, 1x Bread`)
- Subtotal
- A 3-minute countdown progress bar

Outcomes:

- **Accept** → `PUT /orders/:id/accept` → status moves to `STORE_ACCEPTED`, the banner closes, the order shows up in Active Orders.
- **Reject** → `PUT /orders/:id/reject`. The server immediately offers to the next-best store.
- **Timeout** → server cascades automatically.

Multiple incoming orders queue — only one banner is visible at a time, and the next one appears after the first is resolved.

## Order fulfillment workflow

```
STORE_ACCEPTED  -> [Mark Ready] -> READY
READY           -> (waits for driver pickup; status auto-moves to DRIVER_ASSIGNED -> DRIVER_PICKED_UP)
DRIVER_PICKED_UP-> shown in "In Transit" until DELIVERED
```

The store owner's only manual action after Accept is `PUT /orders/:id/ready`. The driver-assignment queue kicks in automatically once `READY` is set.

## Operating hours

Stored as JSON in `Store.openHours`:

```json
{
  "mon": [{ "open": "08:00", "close": "22:00" }],
  "tue": [{ "open": "08:00", "close": "22:00" }],
  ...
  "sun": [{ "open": "09:00", "close": "21:00" }]
}
```

Outside these hours, the store is treated as closed (matching algorithm skips it) regardless of the `isOpen` toggle.

## Environment variables

| Var | Example |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | `http://192.168.1.42:3001` |
| `EXPO_PUBLIC_CLOUDINARY_CLOUD` | `apni-kirana` |
| `EXPO_PUBLIC_CLOUDINARY_UNSIGNED_PRESET` | `store_items` |
