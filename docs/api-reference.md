# API Reference

All endpoints are mounted under `/api/v1`. The base URL in dev is `http://localhost:3001/api/v1`.

## Conventions

- **Auth** — `Authorization: Bearer <accessToken>` unless noted "public".
- **Roles** — `CUSTOMER`, `STORE_OWNER`, `DRIVER`, `ADMIN`. Some endpoints accept multiple.
- **Errors** — `{ "error": { "code": "STRING_CODE", "message": "human readable" } }` with appropriate HTTP status.
- **Pagination** — `?page=1&pageSize=20`. Responses include `{ data: [...], page, pageSize, total }`.

---

## Auth — `/api/v1/auth`

### `POST /send-otp`

Public. Sends an OTP to the phone number. In dev, the OTP is logged to the backend console.

```bash
curl -X POST http://localhost:3001/api/v1/auth/send-otp \
  -H 'Content-Type: application/json' \
  -d '{"phone": "9999988888"}'
```

```json
{ "ok": true, "expiresIn": 300 }
```

### `POST /verify-otp`

Public. Verifies the OTP and returns tokens. Creates the user on first login.

```bash
curl -X POST http://localhost:3001/api/v1/auth/verify-otp \
  -H 'Content-Type: application/json' \
  -d '{"phone": "9999988888", "otp": "123456", "role": "CUSTOMER"}'
```

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "8a3d9c1e...",
  "user": { "id": "usr_01H...", "phone": "9999988888", "role": "CUSTOMER", "name": null }
}
```

### `POST /refresh`

Public. Exchanges a refresh token for a new pair (rotation).

```bash
curl -X POST http://localhost:3001/api/v1/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken": "8a3d9c1e..."}'
```

```json
{ "accessToken": "...", "refreshToken": "..." }
```

### `POST /logout`

Auth required. Revokes the supplied refresh token.

---

## Stores — `/api/v1/stores`

### `POST /register`

Auth: any. Creates a `Store` in `PENDING` status; the user becomes `STORE_OWNER` after admin approval.

Body:

```json
{
  "name": "Sharma Kirana",
  "category": "GROCERY",
  "lat": 28.5355,
  "lng": 77.3910,
  "address": "Sector 18, Noida",
  "phone": "9876543210"
}
```

### `GET /nearby`

Auth: customer. Returns approved + open stores within radius.

```bash
curl 'http://localhost:3001/api/v1/stores/nearby?lat=28.5355&lng=77.3910&radiusKm=5&category=GROCERY' \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "data": [
    {
      "id": "str_01H...",
      "name": "Sharma Kirana",
      "category": "GROCERY",
      "distanceKm": 0.42,
      "isOpen": true,
      "rating": 4.6,
      "imageUrl": "https://res.cloudinary.com/.../store.jpg"
    }
  ]
}
```

### `GET /:id`

Auth: any. Public store profile.

### `GET /:id/items`

Auth: any. Returns the store's inventory — `StoreItem` rows joined to their
`CatalogItem`, flattened so the customer app sees `{ id, name, category, price,
unit, imageUrl, stockQty, isAvailable, ... }`. Items the store does not carry
are simply absent (no per-store duplicates exist anymore).

Query params: `category`, `search`, `page`, `limit`.

### `PUT /:id`

Auth: store owner of `:id`. Update name, hours, image, etc.

### `PUT /:id/toggle-open`

Auth: store owner. Quick on/off switch for accepting orders.

---

## Catalog — `/api/v1/catalog`

The master product catalog (admin-maintained). Customers browse it to compare
the same product across stores. Stores select catalog items into their own
inventory via `/items` (see next section).

### `GET /`

Public. Paginated browse.

Query params:

| Name | Notes |
| --- | --- |
| `category` | One of `GROCERY`, `MEDICINE`, `HOUSEHOLD`, `SNACKS`, `BEVERAGES`, `OTHER` |
| `q` | Case-insensitive substring match on `name` |
| `page` | Default `1` |
| `limit` | Default `50`, max `200` |

```bash
curl 'http://localhost:3001/api/v1/catalog?category=GROCERY&q=milk&page=1&limit=20'
```

```json
{
  "items": [
    { "id": "cat_...", "name": "Amul Milk 1L", "category": "GROCERY",
      "defaultUnit": "1 L", "imageUrl": "https://...", "isActive": true,
      "_count": { "storeItems": 14 } }
  ],
  "total": 87, "page": 1, "limit": 20, "pages": 5
}
```

### `GET /:id`

Public. Returns a catalog item plus the stores carrying it (sorted by distance
when `lat`/`lng` provided, by name otherwise).

Query params: `lat`, `lng`, `radius` (km, default `5`).

```bash
curl 'http://localhost:3001/api/v1/catalog/cat_abc123?lat=28.5&lng=77.4&radius=5'
```

```json
{
  "item": { "id": "cat_...", "name": "Amul Milk 1L", "category": "GROCERY", "defaultUnit": "1 L" },
  "stores": [
    { "id": "str_...", "name": "Sharma Kirana", "lat": 28.535, "lng": 77.391,
      "rating": 4.6, "isOpen": true, "distanceKm": 0.42,
      "storeItem": { "id": "si_...", "price": 68, "stockQty": 40, "isAvailable": true } }
  ]
}
```

### `GET /search/q`

Public full-text search across catalog name + description. Returns up to 50
matches.

```bash
curl 'http://localhost:3001/api/v1/catalog/search/q?q=paracetamol'
```

### `POST /`

Auth: **ADMIN only**. Create a catalog item.

```json
{
  "name": "Amul Milk 1L",
  "description": "Toned milk, 1 litre tetra pack",
  "category": "GROCERY",
  "defaultUnit": "1 L",
  "imageUrl": "https://res.cloudinary.com/.../milk.jpg",
  "isActive": true
}
```

Returns `409` if `name` already exists.

### `PUT /:id`

Auth: **ADMIN only**. Partial update — same body as POST, all fields optional.

### `DELETE /:id`

Auth: **ADMIN only**. Hard delete (cascades to all `StoreItem` rows referencing
this catalog item — be careful).

---

## Items (Store Inventory) — `/api/v1/items`

After the marketplace pivot, an "item" is now a **StoreItem**: a per-store row
that points at a `CatalogItem` and adds the store's own price + stock. A store
owner cannot create new product names — they pick from the master catalog.

### `GET /search`

Public. Cross-store search by query/category. Returns `StoreItem` rows joined
to their catalog metadata and store info.

```bash
curl 'http://localhost:3001/api/v1/items/search?q=milk&category=GROCERY'
```

### `POST /`

Auth: **STORE_OWNER only**. Adds a catalog item to the caller's store. The
store is resolved from `req.user.id` — owners can only modify their own store.

Body:

```json
{ "catalogItemId": "cat_abc123", "price": 68, "stockQty": 40, "isAvailable": true }
```

Returns `404` if the catalog item does not exist, `409` if the store already
carries it.

### `PUT /:id`

Auth: **STORE_OWNER only** (and must own the store the StoreItem belongs to).
Partial update of `price`, `stockQty`, `isAvailable`. The `catalogItemId`
cannot be changed — delete and re-add to point at a different catalog item.

```json
{ "price": 70, "stockQty": 25 }
```

### `DELETE /:id`

Auth: **STORE_OWNER only**. Removes the store's listing for this catalog item.
The underlying `CatalogItem` is untouched.

### `PUT /:id/toggle-availability`

Auth: **STORE_OWNER only**. Flips `isAvailable` for a quick "out of stock"
without deleting the row.

### `PUT /:id/stock`

Auth: **STORE_OWNER only**. Sets stock count.

```json
{ "stockQty": 25 }
```

---

## Orders — `/api/v1/orders`

### `POST /`

Auth: customer. Places an order. Triggers the store-matching queue.

There are **two ordering modes**, which the backend distinguishes by what the
`items[]` entries contain:

| Mode | `items[]` shape | Behavior |
| --- | --- | --- |
| **Store-direct** | `[{ storeItemId, qty }]` | Customer browsed a specific store. The order goes to that store's owner directly. |
| **Catalog** | `[{ catalogItemId, qty }]` | Customer browsed the master catalog. The matching engine picks a store. `storeId` is optional — if omitted the engine selects the store carrying the **most** of the requested catalog items (majority-first); ties broken by first match. |

Both modes share the same envelope:

```bash
curl -X POST http://localhost:3001/api/v1/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "deliveryAddressId": "adr_...",
    "items": [
      { "storeItemId": "si_001", "qty": 2 },
      { "storeItemId": "si_002", "qty": 1 }
    ],
    "paymentMethod": "CASH_ON_DELIVERY"
  }'
```

Catalog-mode example (engine picks a store):

```json
{
  "deliveryAddressId": "adr_...",
  "items": [
    { "catalogItemId": "cat_milk1l", "qty": 2 },
    { "catalogItemId": "cat_bread", "qty": 1 }
  ],
  "paymentMethod": "CASH_ON_DELIVERY"
}
```

Notes:

- All resolved `StoreItem`s must belong to the same store; multi-store orders are not yet supported (`400` if violated).
- The order is created with a server-generated 4-digit `dropoffOtp` (see Privacy below).
- After insert, a `match-store` job is enqueued in BullMQ.

```json
{
  "id": "ord_01H...",
  "status": "PENDING",
  "subtotal": 240,
  "deliveryFee": 30,
  "commission": 12,
  "total": 270,
  "dropoffOtp": null,
  "items": [ ... ]
}
```

> The `dropoffOtp` is **not** returned by the create endpoint. The customer
> sees it via `GET /orders/:id` once the status reaches `PICKED_UP`.

### `GET /`

Auth: any role. Returns orders for the calling user (customer's orders, store owner's incoming, driver's deliveries).

### `GET /:id`

Auth: participant in the order (customer / store owner of the order's store /
assigned driver / admin).

#### Privacy — driver view strips PII

When a `DRIVER` calls this endpoint, the response is rewritten to **omit
customer PII**:

| Field | Driver sees | Everyone else |
| --- | --- | --- |
| `customer.name`, `customer.phone` | `customer: null` | actual values |
| `deliveryAddress.street`, `recipientName` | not returned | returned |
| `deliveryAddress` | only `lat`, `lng`, `label`, `pincode`, `city` | full address |
| `dropoffOtp` | not returned | returned (customer sees it post-pickup) |

This is enforced server-side regardless of socket subscriptions. See
`docs/privacy.md` for the rationale and the dropoff-OTP handoff flow.

### `PUT /:id/accept`

Auth: store owner. Accepts the offered order.

### `PUT /:id/reject`

Auth: store owner.

### `PUT /:id/ready`

Auth: store owner. Marks order packed and ready for pickup. Triggers driver-assignment queue.

### `PUT /:id/cancel`

Auth: customer (only while `PENDING_STORE` or `STORE_ACCEPTED`).

### `POST /:id/rate`

Auth: customer. After delivery.

```json
{ "storeStars": 5, "driverStars": 5, "comment": "Quick and friendly" }
```

---

## Drivers — `/api/v1/drivers`

### `POST /register`

Auth: any. Creates a `Driver` profile in `PENDING` for admin approval.

```json
{
  "vehicleType": "BIKE",
  "licenseNumber": "DL-13-2020-0001234",
  "vehicleNumber": "DL3SCD1234"
}
```

### `PUT /status`

Auth: driver. Toggle online/offline.

```bash
curl -X PUT http://localhost:3001/api/v1/drivers/status \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status": "ONLINE"}'
```

### `PUT /location`

Auth: driver. Heartbeat with current GPS. Throttled server-side.

```json
{ "lat": 28.5355, "lng": 77.3910, "heading": 180, "speed": 22.4 }
```

### `GET /earnings`

Auth: driver. Returns today / this week / this month tallies.

```json
{
  "today": { "deliveries": 8, "earnings": 480 },
  "week":  { "deliveries": 41, "earnings": 2460 },
  "month": { "deliveries": 162, "earnings": 9720 }
}
```

### `PUT /orders/:id/accept`

Auth: driver. Accepts an offered delivery.

### `PUT /orders/:id/reject`

Auth: driver.

### `PUT /orders/:id/pickup`

Auth: driver. Marks order picked up at the store.

### `PUT /orders/:id/deliver`

Auth: driver. Marks delivered. **Requires the 4-digit `dropoffOtp`** that the
customer sees in their app once the order reached `PICKED_UP`.

```json
{ "dropoffOtp": "1234" }
```

| Outcome | Status | Body |
| --- | --- | --- |
| OTP missing | `400` | `Dropoff OTP required to confirm delivery` |
| OTP wrong | `400` | `Incorrect dropoff OTP` (status stays `PICKED_UP`) |
| OTP correct | `200` | order moves to `DELIVERED`; driver earnings credit the delivery fee |

The driver must read the OTP off the customer's phone screen at handoff. This
is the only way the delivery completes — see `docs/privacy.md`.

---

## Admin — `/api/v1/admin`

All admin endpoints require `role=ADMIN`.

### `GET /users`

```bash
curl 'http://localhost:3001/api/v1/admin/users?role=CUSTOMER&q=9999' \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### `PUT /users/:id/suspend`

Body: `{ "suspended": true, "reason": "Fraud pattern" }`.

### `GET /stores/pending`

### `PUT /stores/:id/approve`

### `PUT /stores/:id/suspend`

### `GET /drivers/pending`

### `PUT /drivers/:id/approve`

### `GET /orders`

Filters: `status`, `from`, `to`, `storeId`, `driverId`.

### `GET /orders/:id`

Full order detail for ops: customer (id, name, phone), store (id, name, owner,
coords, address), driver (with user name + phone), all order items, delivery
address, and rating. Use this to drive the admin order detail page.

### `PUT /orders/:id/assign-store`

Manual store override. Useful when automatic matching gets stuck or a customer
calls in to switch fulfillment. Updates `Order.storeId`, sets status to
`STORE_ACCEPTED`, stamps `storeAcceptedAt`, and pushes a notification to the
new store's owner.

```json
{ "storeId": "str_..." }
```

Rejected with `400` for `DELIVERED` or `CANCELLED` orders.

### `PUT /orders/:id/assign-driver`

Manual driver override. Updates `Order.driverId`, sets status to
`DRIVER_ASSIGNED`, stamps `driverAssignedAt`, notifies the driver.

```json
{ "driverId": "drv_..." }
```

Rejected with `400` for `DELIVERED` or `CANCELLED` orders.

### `GET /analytics`

Returns top-line KPIs.

```json
{
  "ordersToday": 142,
  "gmvToday": 38420,
  "activeStores": 36,
  "activeDrivers": 18,
  "averageDeliveryMinutes": 27
}
```

---

## Notifications — `/api/v1/notifications`

### `GET /`

Auth: any. Paginated list.

```json
{
  "data": [
    {
      "id": "ntf_...",
      "type": "ORDER_ACCEPTED",
      "title": "Sharma Kirana accepted your order",
      "body": "Estimated 15 min to ready",
      "data": { "orderId": "ord_..." },
      "readAt": null,
      "createdAt": "2026-05-06T11:30:00Z"
    }
  ]
}
```

### `PUT /:id/read`

### `PUT /read-all`

### `PUT /fcm-token`

Auth: any. Saves the FCM token from the app.

```json
{ "fcmToken": "dM3...", "platform": "android" }
```
