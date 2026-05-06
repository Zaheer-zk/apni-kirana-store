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

Auth: any. Returns the store's catalog.

### `PUT /:id`

Auth: store owner of `:id`. Update name, hours, image, etc.

### `PUT /:id/toggle-open`

Auth: store owner. Quick on/off switch for accepting orders.

---

## Items — `/api/v1/items`

### `GET /search`

Auth: customer. Cross-store search by query within a radius.

```bash
curl 'http://localhost:3001/api/v1/items/search?q=milk&lat=28.5&lng=77.4&radiusKm=5' \
  -H "Authorization: Bearer $TOKEN"
```

### `POST /`

Auth: store owner. Add an item.

```json
{ "storeId": "str_...", "name": "Amul Milk 1L", "price": 68, "stock": 40, "imageUrl": "https://..." }
```

### `PUT /:id`

Auth: store owner.

### `DELETE /:id`

Auth: store owner.

### `PUT /:id/toggle-availability`

Auth: store owner. Hide an item without deleting it.

### `PUT /:id/stock`

Auth: store owner. Adjust stock count.

```json
{ "stock": 25 }
```

---

## Orders — `/api/v1/orders`

### `POST /`

Auth: customer. Places an order. Triggers store-matching queue.

```bash
curl -X POST http://localhost:3001/api/v1/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "addressId": "adr_...",
    "items": [
      { "itemId": "itm_001", "qty": 2 },
      { "itemId": "itm_002", "qty": 1 }
    ],
    "paymentMethod": "COD"
  }'
```

```json
{
  "id": "ord_01H...",
  "status": "PENDING_STORE",
  "subtotal": 240,
  "deliveryFee": 25,
  "total": 265,
  "estimatedReadyAt": "2026-05-06T11:35:00Z"
}
```

### `GET /`

Auth: any role. Returns orders for the calling user (customer's orders, store owner's incoming, driver's deliveries).

### `GET /:id`

Auth: participant in the order.

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

Auth: driver. Marks delivered. Optionally include `proofImageUrl`.

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
