# Architecture

A bird's-eye view of how Apni Kirana Store is put together.

## High-level diagram

```
                                  +-----------------------------+
                                  |       Admin Dashboard       |
                                  |   Next.js 15 (port 3000)    |
                                  +--------------+--------------+
                                                 |
                                                 | HTTPS / REST
                                                 v
+-----------------+   REST    +-----------------------------------+   pub/sub   +-----------+
| Customer App    +---------->+                                   +<----------->+   Redis   |
| Expo RN         |<--socket--+                                   |             |  (BullMQ, |
+-----------------+           |                                   |             |   cache)  |
                              |       Backend API (Express)       |             +-----------+
+-----------------+   REST    |   Node 20 + Prisma + Socket.io    |
| Driver App      +---------->+         port 3000 (3001 host)     |   SQL       +-----------+
| Expo RN         |<--socket--+                                   +<----------->+ PostgreSQL |
+-----------------+           |                                   |             |   16      |
                              |                                   |             +-----------+
+-----------------+   REST    |                                   |
| Store Portal    +---------->+                                   |   FCM HTTPS  +-----------+
| Expo RN         |<--socket--+                                   +------------->+ Firebase  |
+-----------------+           +-----------------+-----------------+              |   FCM     |
                                                |                                +-----------+
                                                |  SMS                            
                                                v                                 +-----------+
                                          +-----+----+                            | Cloudinary|
                                          |  Twilio  |                            |  (images) |
                                          +----------+                            +-----------+
```

## Components

| Component | Tech | Responsibility |
| --- | --- | --- |
| Backend | Node 20, Express, Prisma, Socket.io, BullMQ | REST API, realtime, jobs, integrations |
| Customer App | Expo SDK 51, React Native, Zustand, React Query | Browse, cart, checkout, track |
| Driver App | Expo SDK 51, React Native, expo-task-manager | Online/offline, accept jobs, GPS |
| Store Portal | Expo SDK 51, React Native | Inventory + order fulfillment |
| Admin Dashboard | Next.js 15, App Router, Tailwind | Approvals, analytics, settings |
| PostgreSQL | 16 | Primary datastore |
| Redis | 7 | Cache + BullMQ queues + Socket.io adapter |

## Data model — 10 Prisma models

| Model | Key fields | Relations |
| --- | --- | --- |
| `User` | `id`, `phone`, `role`, `name`, `fcmToken`, `suspended` | has many `Address`, `Order`, `Notification`; one `Driver`; many `Store` (owner) |
| `RefreshToken` | `id`, `tokenHash`, `userId`, `expiresAt`, `revoked` | belongs to `User` |
| `Address` | `id`, `userId`, `label`, `line1`, `lat`, `lng`, `isDefault` | belongs to `User` |
| `Store` | `id`, `ownerId`, `name`, `category`, `lat`, `lng`, `isOpen`, `status` (`PENDING`/`APPROVED`/`SUSPENDED`) | belongs to `User`; has many `Item`, `Order` |
| `Item` | `id`, `storeId`, `name`, `price`, `stock`, `imageUrl`, `available` | belongs to `Store`; has many `OrderItem` |
| `Order` | `id`, `customerId`, `storeId`, `driverId?`, `status`, `subtotal`, `deliveryFee`, `total`, `addressSnapshot` | belongs to `User` (customer), `Store`, `Driver?`; has many `OrderItem`; one `OrderRating?` |
| `OrderItem` | `id`, `orderId`, `itemId`, `nameSnapshot`, `priceSnapshot`, `qty` | belongs to `Order`, `Item` (denormalised) |
| `Driver` | `id`, `userId`, `vehicleType`, `licenseNumber`, `status` (`OFFLINE`/`ONLINE`/`BUSY`), `lat`, `lng`, `approved` | belongs to `User`; has many `Order` |
| `OrderRating` | `id`, `orderId`, `storeStars`, `driverStars`, `comment` | belongs to `Order` |
| `Notification` | `id`, `userId`, `type`, `title`, `body`, `data`, `readAt` | belongs to `User` |

See [database-schema.md](./database-schema.md) for full field-level detail.

## API structure — 7 route groups

All routes live under `/api/v1`:

| Prefix | Purpose |
| --- | --- |
| `/auth` | OTP login, JWT refresh, logout |
| `/stores` | Register, search nearby, manage own store |
| `/items` | Search catalog, CRUD by store owner |
| `/orders` | Place, list, track, accept/reject, rate |
| `/drivers` | Register, online status, location, earnings, accept/pickup/deliver |
| `/admin` | Approvals, analytics, suspensions |
| `/notifications` | List, mark read, register FCM token |

## Realtime layer — Socket.io

Connections are authenticated via JWT in the `auth.token` field of the handshake.

### Rooms

| Room | Joined by | Purpose |
| --- | --- | --- |
| `user:<userId>` | Every authenticated socket on connect | User-targeted events (order updates, new offers) |
| `order:<orderId>` | Customer + driver + store owner of that order | Live order progress, driver location |

### Events (summary)

- Client → server: `order:subscribe`, `order:unsubscribe`, `location:update` (drivers only)
- Server → client: `order:status`, `driver:location`, `order:assigned`, `order:new`

See [socket-events.md](./socket-events.md) for the full reference.

## Job queues — BullMQ on Redis

| Queue | Purpose | Timeout |
| --- | --- | --- |
| `store-matching` | Find a store willing to accept a multi-store order, cascading on rejection | 3 minutes per store |
| `driver-assignment` | Find a driver within 2 km, cascading to next-nearest on reject/timeout | 60 seconds per driver |

Both queues persist state in Redis, survive backend restarts, and emit Socket.io events as they progress.

## Auth flow

```
+---------+                +---------+              +---------+
|  Phone  |    /send-otp   | Backend |              |  Twilio |
|  app    +--------------->+         +-----dev:----->  log    |
|         |                |         |              | prod:SMS|
|         |    /verify-otp |         |              +---------+
|         +--------------->+         |
|         |  {access, refresh}       |
|         |<-----------------+       |
|         |                |         |
|         |  Bearer access (15 min)  |
|         +--------------->+         |
|         |                |         |
|         |  /refresh when 401       |
|         +--------------->+         |
|         |  new access (rotated)    |
+---------+                +---------+
```

- Access token: JWT, 15 minutes, signed `HS256`.
- Refresh token: opaque, 30 days, hashed in DB, single-use rotation. Revoked on logout.
- The mobile clients use an interceptor that auto-refreshes on `401` and replays the request once.

## Store matching algorithm

Given a customer cart that needs fulfillment from a category:

1. **Bounding box prefilter** — query stores within a coarse lat/lng box around the customer (cheap on indexed columns).
2. **Haversine distance** — compute precise km distance, drop anything beyond `MAX_RADIUS_KM` (default 8 km).
3. **Availability score** — for each candidate store, fraction of cart items that are `available=true` and `stock > 0`.
4. **Weighted score** — `score = 0.6 * availability + 0.4 * proximity`, where `proximity = 1 - (distance / MAX_RADIUS_KM)`.
5. **Cascade** — sort by score desc; offer to top store with **3-minute** acceptance window; on reject/timeout move to next candidate.

If no store accepts within the candidate list, the order is marked `STORE_UNAVAILABLE` and the customer is notified.

## Driver assignment

Once a store accepts and marks an order `READY`:

1. **Search radius** — query online + non-busy drivers within **2 km** of the store.
2. **Sort by proximity** — nearest first via Haversine.
3. **Offer cascade** — push offer to nearest driver with **60-second** acceptance window. On reject/timeout, move to the next.
4. **Fallback** — if no driver in 2 km, expand to 5 km after one pass; if still none, leave order in `AWAITING_DRIVER` and retry every 60s up to a configurable cap.

See [matching-algorithm.md](./matching-algorithm.md) for pseudocode and edge cases.
