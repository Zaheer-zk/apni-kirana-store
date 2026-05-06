# Socket.io Events

Realtime is delivered via Socket.io. The server uses the Redis adapter so it scales horizontally.

## Connection & authentication

Clients connect to the same origin as the REST API (e.g. `http://localhost:3001`) and pass the JWT in the handshake `auth` field:

```js
import { io } from 'socket.io-client';

const socket = io(API_URL, {
  auth: { token: accessToken },
  transports: ['websocket'],
  reconnection: true,
});
```

The server middleware verifies the JWT before allowing the socket to connect. Invalid or expired tokens trigger `connect_error` with reason `unauthorized` — the client should refresh the access token (via the REST `/auth/refresh` endpoint) and reconnect.

## Rooms

| Room | Joined automatically | Joined on demand | Purpose |
| --- | --- | --- | --- |
| `user:<userId>` | Yes, on connect | — | Personal feed: order accepted, driver assigned, new offer (driver), incoming order (store) |
| `order:<orderId>` | — | Yes, via `order:subscribe` | Live tracking and status for one specific order |

When a user disconnects, Socket.io automatically removes them from all rooms.

## Client → server events

### `order:subscribe`

Subscribe to live updates for one order. The server validates that the caller is a participant (customer, store owner, or assigned driver) before joining.

```js
socket.emit('order:subscribe', { orderId: 'ord_01H...' });
```

### `order:unsubscribe`

```js
socket.emit('order:unsubscribe', { orderId: 'ord_01H...' });
```

### `location:update` — drivers only

Sent every ~5 seconds when a driver has an active delivery. Server fans out to the relevant `order:<id>` room.

```js
socket.emit('location:update', {
  orderId: 'ord_01H...',
  lat: 28.5355,
  lng: 77.3910,
  heading: 180,
  speed: 22.4,
});
```

The server also persists periodic samples for fraud / dispute review, throttled to one DB write per ~30s.

## Server → client events

### `order:status`

Sent into `order:<orderId>` whenever the status changes.

```json
{
  "orderId": "ord_01H...",
  "status": "DRIVER_PICKED_UP",
  "at": "2026-05-06T11:42:00Z"
}
```

Status values: `PENDING_STORE`, `STORE_ACCEPTED`, `STORE_REJECTED`, `READY`, `DRIVER_ASSIGNED`, `DRIVER_PICKED_UP`, `DELIVERED`, `CANCELLED`.

### `driver:location`

Sent into `order:<orderId>` while the order is in flight.

```json
{
  "orderId": "ord_01H...",
  "lat": 28.5340,
  "lng": 77.3902,
  "heading": 175,
  "speed": 18.0,
  "at": "2026-05-06T11:43:05Z"
}
```

### `order:assigned` — driver-targeted

Sent into `user:<driverId>` when a driver is offered a new delivery. The driver app shows a 60-second modal.

```json
{
  "orderId": "ord_01H...",
  "store": { "name": "Sharma Kirana", "lat": 28.535, "lng": 77.391 },
  "drop":  { "lat": 28.541, "lng": 77.401, "label": "Tower B, Apt 502" },
  "estimatedPayout": 60,
  "expiresAt": "2026-05-06T11:36:00Z"
}
```

### `order:new` — store-targeted

Sent into `user:<storeOwnerId>` when a new order is offered to the store. The store portal shows a banner with a 3-minute timer.

```json
{
  "orderId": "ord_01H...",
  "items": [{ "name": "Amul Milk 1L", "qty": 2 }],
  "subtotal": 136,
  "expiresAt": "2026-05-06T11:33:00Z"
}
```

## Connection lifecycle

```
client                                server
  |                                     |
  |  WS handshake (auth.token=JWT)      |
  |------------------------------------>|
  |                                     |  verify JWT, attach userId
  |  connect                            |  join "user:<userId>"
  |<------------------------------------|
  |                                     |
  |  emit "order:subscribe" {orderId}   |
  |------------------------------------>|  validate participant
  |                                     |  join "order:<orderId>"
  |                                     |
  |  ... receive "order:status",        |
  |      "driver:location" ...          |
  |<------------------------------------|
  |                                     |
  |  network drop / app backgrounded    |
  |  Socket.io auto-reconnect           |
  |  (re-join user room automatically;  |
  |   re-emit order:subscribe manually) |
  |                                     |
  |  emit "logout" / disconnect         |
  |------------------------------------>|  leave all rooms
```

> Tip: Re-emit any `order:subscribe` calls in the client's `connect` handler so subscriptions are restored after a reconnect.
