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

## Inventory — "Add from Catalog" flow

After the marketplace pivot, **store owners cannot create new product names**.
Every item in a store's inventory is a `StoreItem` — a row that points at a
master `CatalogItem` (name, category, unit, image) and adds the store's own
`price`, `stockQty`, and `isAvailable`. Admin owns the master catalog.

The old "Add Item" form (name, category, price, unit, stock, image) is
**replaced** by a 3-step "Add from Catalog" flow:

1. **Search/select** a master catalog item — type to query
   `GET /catalog?q=...` (or `/catalog/search/q?q=...`). Tap the result.
2. **Set price** — your store's price for this item (₹).
3. **Set stock** — quantity on hand. Tap "Add to my store" → `POST /items`
   with `{ catalogItemId, price, stockQty }`.

If a catalog item the owner needs doesn't exist, they request it from admin
(in-app "Request product" form, planned). They cannot create it themselves.

| Action | Endpoint |
| --- | --- |
| List my inventory | `GET /stores/:id/items` (returns flattened `StoreItem` + `CatalogItem`) |
| Add (from catalog) | `POST /items` body `{ catalogItemId, price, stockQty, isAvailable? }` |
| Edit price / stock / availability | `PUT /items/:id` |
| Remove from my store | `DELETE /items/:id` (CatalogItem is untouched) |
| Quick "out of stock" toggle | `PUT /items/:id/toggle-availability` |
| Stock adjust | `PUT /items/:id/stock` body `{ stockQty }` |

`GET /stores/:id/items` returns only the rows the store actually carries —
items the store doesn't list are simply absent from the response. There are no
per-store duplicates of the same product name (the unique constraint
`(storeId, catalogItemId)` enforces this).

The list view still supports a swipe action for "Out of stock" — single tap to
flip `isAvailable` without deleting the row.

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

## Incoming order banner — broadcast mode

When the server emits **`order:offered`** to the store owner's `user:<id>` room
(this is the broadcast-mode event from `matching.service.ts`), a top banner
appears with:

- Item summary (`2x Amul Milk, 1x Bread`)
- Subtotal
- Match info from the payload — `matchedItemCount`, `distanceKm`, `score`
- A **3-minute** countdown progress bar (`STORE_RETRY_DELAY_MS`)

In `BROADCAST` mode (default), the same `order:offered` event is delivered to
**up to 5 stores in parallel**; the first store to call `PUT /orders/:id/accept`
wins. Losing stores receive an `order:rescinded` event and the banner
disappears with a "Order taken by another store" toast.

Outcomes:

- **Accept** → `PUT /orders/:id/accept` → status moves to `STORE_ACCEPTED`, the banner closes, the order shows up in Active Orders.
- **Reject** → `PUT /orders/:id/reject` with a reason. Server re-broadcasts to the next round (excluding this store).
- **Rescinded by server** → `order:rescinded` socket event; banner closes silently with a "Another store accepted" toast.
- **Timeout** → after 3 min the banner closes; the safety-net job broadcasts to the next round.

Multiple incoming offers queue — only one banner is visible at a time, the
next one appears after the first is resolved or rescinded.

> Legacy `CASCADE` mode (`STORE_MATCHING_MODE=CASCADE`) emits the same
> `order:offered` event but to a single store at a time, with the same 3-min
> window. The UI does not need to change between modes.

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
