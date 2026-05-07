# Database Schema

The schema is defined in `apps/backend/prisma/schema.prisma`. Postgres 16 is the engine. IDs are ULIDs (string).

## ERD (ASCII)

```
                +-----------+      +----------------+
                |   User    |1----*| RefreshToken   |
                +-----+-----+      +----------------+
                      |1
       +--------------+--------------+--------------------+--------------+
       | *            | *            | *                  | *            | 0..1
+------+-----+ +------+-----+ +------+-----+      +-------+-------+ +----+-----+
|  Address   | |   Order    | |Notification|      |     Store     | |  Driver  |
+------+-----+ +-----+------+ +------------+      +-------+-------+ +----+-----+
                     |1                                   |1             |1
                     |                                    | *            |
                     |1                            +------+-----+        |
              +------+-----+      itemId(?)        | StoreItem  |        |
              | OrderItem  |- - - - - - - - - - ->+------+-----+        |
              +------------+      (denormalized)         | *             |
                     |1                                  | 1             |
                     |0..1                        +------+-----+         |
              +------+--------+                   |CatalogItem |         |
              | OrderRating   |                   +------------+         |
              +---------------+   Order.driverId ?--------------+--------+

  User 1-1 NotificationPreferences (auto-created on first GET)
  User 1-* WebPushSubscription   (one row per admin browser endpoint)
```

`CatalogItem` is the master product list maintained by ADMIN. `StoreItem` is a
store's selection from the catalog with its own price and stock. `OrderItem.itemId`
points at a `StoreItem` (nullable; `name`/`price`/`unit` are snapshotted so the
historical record survives later catalog/store changes).

## Enums

```prisma
enum Role { CUSTOMER STORE_OWNER DRIVER ADMIN }

enum StoreCategory { GROCERY KIRANA PHARMACY BAKERY MEAT VEG_FRUITS }
enum StoreStatus { PENDING APPROVED SUSPENDED }

enum DriverStatus { OFFLINE ONLINE BUSY }
enum VehicleType { BIKE SCOOTER BICYCLE }

enum OrderStatus {
  PENDING_STORE
  STORE_ACCEPTED
  STORE_REJECTED
  READY
  DRIVER_ASSIGNED
  DRIVER_PICKED_UP
  DELIVERED
  CANCELLED
  STORE_UNAVAILABLE
}

enum PaymentMethod { COD UPI CARD WALLET }
enum NotificationType {
  OTP
  ORDER_PLACED ORDER_ACCEPTED ORDER_REJECTED
  ORDER_READY ORDER_ASSIGNED ORDER_PICKED_UP ORDER_DELIVERED
  ORDER_CANCELLED PROMO STORE_APPROVED DRIVER_APPROVED
}
```

## Models

### `User`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String (PK) | ULID |
| `phone` | String, unique, indexed | E.164 minus `+91` (10 digits in India) |
| `name` | String? | Optional, captured after first login |
| `email` | String? | Optional |
| `role` | Role | Default `CUSTOMER` |
| `fcmToken` | String? | Latest registered device token |
| `platform` | String? | `ios` / `android` |
| `suspended` | Boolean | Default `false` |
| `createdAt`, `updatedAt` | DateTime | |

**Relations:** addresses, orders (as customer), notifications, refresh tokens, owned stores, driver profile.

### `RefreshToken`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String (PK) | |
| `userId` | String (FK → User) | indexed |
| `tokenHash` | String, unique | sha256 of opaque token |
| `expiresAt` | DateTime | 30 days from issue |
| `revoked` | Boolean | Default `false` |
| `replacedById` | String? | for rotation chain |
| `createdAt` | DateTime | |

### `Address`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String (PK) | |
| `userId` | String (FK → User) | indexed |
| `label` | String | "Home", "Office" |
| `line1`, `line2` | String | |
| `city`, `state`, `pincode` | String | |
| `lat`, `lng` | Float | |
| `isDefault` | Boolean | |

### `Store`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String (PK) | |
| `ownerId` | String (FK → User) | indexed |
| `name` | String | |
| `category` | StoreCategory | indexed |
| `description` | String? | |
| `imageUrl` | String? | Cloudinary URL |
| `phone` | String | |
| `address` | String | |
| `lat`, `lng` | Float | both indexed for nearby queries |
| `isOpen` | Boolean | runtime open/closed |
| `openHours` | Json | weekly schedule |
| `status` | StoreStatus | `PENDING` / `APPROVED` / `SUSPENDED` |
| `commissionPct` | Float | platform cut |
| `createdAt`, `updatedAt` | DateTime | |

### `CatalogItem`

The platform-wide master product list, maintained by ADMIN. Every store sells
items chosen from this list (via `StoreItem`), so item names and metadata are
defined once and reused everywhere.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String (PK) | |
| `name` | String, **unique**, indexed | one row per product (e.g. "Amul Milk 1L") |
| `description` | String? | |
| `category` | ItemCategory, indexed | `GROCERY`, `MEDICINE`, `HOUSEHOLD`, `SNACKS`, `BEVERAGES`, `OTHER` |
| `defaultUnit` | String | "1 L", "500 g", "pack of 6" — default unit; stores may not override |
| `imageUrl` | String? | Cloudinary URL |
| `isActive` | Boolean | soft-delete flag (default `true`) |
| `createdAt`, `updatedAt` | DateTime | |

**Relations:** `storeItems` (one CatalogItem → many StoreItem rows across stores).

```prisma
model CatalogItem {
  id          String       @id @default(cuid())
  name        String       @unique
  description String?
  category    ItemCategory
  defaultUnit String
  imageUrl    String?
  isActive    Boolean      @default(true)
  storeItems  StoreItem[]

  @@index([category])
  @@index([name])
}
```

### `StoreItem`

A store's per-shop listing of a `CatalogItem` — its price, stock, and
availability. Each (store, catalog item) pair is unique.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String (PK) | |
| `storeId` | String (FK → Store) | indexed; `ON DELETE CASCADE` |
| `catalogItemId` | String (FK → CatalogItem) | indexed; `ON DELETE CASCADE` |
| `price` | Float | per-store price for the catalog item |
| `stockQty` | Int | default 0 |
| `isAvailable` | Boolean | default `true`; quick toggle without deleting |
| `createdAt`, `updatedAt` | DateTime | |

**Constraints:** `@@unique([storeId, catalogItemId])` — a store can list each
catalog item only once.

```prisma
model StoreItem {
  id            String      @id @default(cuid())
  storeId       String
  catalogItemId String
  price         Float
  stockQty      Int         @default(0)
  isAvailable   Boolean     @default(true)
  store         Store       @relation(fields: [storeId], references: [id], onDelete: Cascade)
  catalogItem   CatalogItem @relation(fields: [catalogItemId], references: [id], onDelete: Cascade)

  @@unique([storeId, catalogItemId])
  @@index([storeId])
  @@index([catalogItemId])
}
```

### Why split `CatalogItem` / `StoreItem`?

Pre-pivot, every store created its own `Item` rows, which led to:

- **Duplicate names** across stores ("Amul Milk 1L" written 30 different ways) — broke search and analytics.
- **No cross-store comparisons** — customers couldn't see "this product is at N stores nearby" without an expensive name match.
- **Dirty data** — typos, missing units, stale photos.

Splitting into a master catalog and per-store listings gives us:

- **Single source of truth** for product names, categories, units, and images.
- **Clean per-store pricing and stock** without duplicating product metadata.
- **Search & SEO** — one canonical product page (`/catalog/:id`) listing all stores carrying it, sorted by price/distance.
- **Cleaner schema** — orders, ratings, inventory all reference one stable `catalogItemId`.

### `Order`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String (PK) | |
| `customerId` | String (FK → User) | indexed |
| `storeId` | String (FK → Store) | indexed |
| `driverId` | String? (FK → Driver) | indexed |
| `status` | OrderStatus | indexed |
| `subtotal` | Decimal(10,2) | |
| `deliveryFee` | Decimal(10,2) | |
| `discount` | Decimal(10,2) | default 0 |
| `total` | Decimal(10,2) | |
| `paymentMethod` | PaymentMethod | |
| `paymentStatus` | String | `PENDING` / `PAID` / `REFUNDED` |
| `addressSnapshot` | Json | full address copied at order time |
| `dropoffOtp` | String? | **4-digit OTP** generated at order placement; revealed to the customer in-app once the order is `PICKED_UP`; entered by the driver on the deliver endpoint to confirm handoff. See `docs/privacy.md`. |
| `placedAt` | DateTime | |
| `acceptedAt`, `readyAt`, `pickedUpAt`, `deliveredAt`, `cancelledAt` | DateTime? | |

### `OrderItem`

Why denormalised? Items can be edited or deleted *after* an order is placed.
Snapshotting `name`, `price`, and `unit` at order time guarantees the historical
record stays accurate even if the parent `StoreItem` or `CatalogItem` row
changes. After the marketplace pivot, `OrderItem.itemId` references a
`StoreItem` id (nullable; the FK was dropped during the migration so deleting a
StoreItem no longer blocks order history).

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String (PK) | |
| `orderId` | String (FK → Order) | indexed |
| `itemId` | String? | StoreItem id at order time; not enforced by FK (snapshot semantics) |
| `name` | String | snapshot from `CatalogItem.name` |
| `price` | Float | snapshot from `StoreItem.price` |
| `unit` | String | snapshot from `CatalogItem.defaultUnit` |
| `qty` | Int | |
| `imageUrl` | String? | snapshot from `CatalogItem.imageUrl` |

### `Driver`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String (PK) | |
| `userId` | String (FK → User), unique | one driver per user |
| `vehicleType` | VehicleType | |
| `vehicleNumber` | String | |
| `licenseNumber` | String | |
| `licenseImageUrl` | String? | |
| `status` | DriverStatus | indexed |
| `lat`, `lng` | Float? | last known GPS |
| `lastLocationAt` | DateTime? | |
| `approved` | Boolean | default `false` |
| `rating` | Float? | rolling average |

### `OrderRating`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String (PK) | |
| `orderId` | String (FK → Order), unique | one rating per order |
| `storeStars` | Int (1-5) | |
| `driverStars` | Int (1-5) | nullable |
| `comment` | String? | |
| `createdAt` | DateTime | |

### `Notification`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String (PK) | |
| `userId` | String (FK → User) | indexed |
| `type` | NotificationType | |
| `title` | String | |
| `body` | String | |
| `data` | Json | extra payload (e.g. `{ orderId }`) |
| `readAt` | DateTime? | |
| `createdAt` | DateTime | indexed desc for inbox |

### `NotificationPreferences`

Per-user toggles that gate categories of pushes. Exactly **one row per user**
(unique on `userId`). Auto-provisioned with defaults on the first
`GET /api/v1/users/me/preferences`. Updated via
`PUT /api/v1/users/me/preferences` (partial body, server-side whitelist).

When `notify(event, userId, vars)` runs, it consults the
`PREFERENCE_KEY[event]` mapping in `notification.service.ts`. If the matched
flag is `false`, the function returns immediately — no DB row is written and
no push is sent. See `docs/notifications.md` for the full event → flag map
and the list of always-on events that ignore preferences.

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `id` | String (PK) | cuid | |
| `userId` | String, **unique** | | One row per user; FK link is logical (no Prisma relation declared today). |
| `orderUpdates` | Boolean | `true` | Customer order lifecycle pushes |
| `promotional` | Boolean | `true` | `PROMO_ANNOUNCE` |
| `dailySummary` | Boolean | `false` | Future end-of-day digest |
| `driverUpdates` | Boolean | `true` | Reserved for live driver-status pushes |
| `newOrderAlerts` | Boolean | `true` | Store: new order + offered events |
| `rescindedAlerts` | Boolean | `true` | Store: rescinded after another store accepted |
| `earningsSummary` | Boolean | `false` | Future earnings summary |
| `newDeliveryAlerts` | Boolean | `true` | Driver: new delivery + rescinded |
| `payoutNotifications` | Boolean | `true` | Driver: payout processed |
| `newStoreApprovals` | Boolean | `true` | Admin: new store pending |
| `newDriverApprovals` | Boolean | `true` | Admin: new driver pending |
| `refundEvents` | Boolean | `true` | Admin: refund events |
| `createdAt`, `updatedAt` | DateTime | | |

```prisma
model NotificationPreferences {
  id                  String   @id @default(cuid())
  userId              String   @unique
  // Common across roles
  orderUpdates        Boolean  @default(true)
  promotional         Boolean  @default(true)
  dailySummary        Boolean  @default(false)
  // Customer-specific
  driverUpdates       Boolean  @default(true)
  // Store-specific
  newOrderAlerts      Boolean  @default(true)
  rescindedAlerts     Boolean  @default(true)
  earningsSummary     Boolean  @default(false)
  // Driver-specific
  newDeliveryAlerts   Boolean  @default(true)
  payoutNotifications Boolean  @default(true)
  // Admin-specific
  newStoreApprovals   Boolean  @default(true)
  newDriverApprovals  Boolean  @default(true)
  refundEvents        Boolean  @default(true)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}
```

### `WebPushSubscription`

A single browser registration for the admin Web Push channel — one row per
subscribed browser/endpoint. The admin dashboard registers a service worker,
subscribes via `pushManager.subscribe({ applicationServerKey: VAPID_PUBLIC })`,
and POSTs the resulting subscription JSON to
`POST /api/v1/notifications/web-push/subscribe`. Backend upserts on
`endpoint`. Mobile clients use Expo Push (token stored on `User.fcmToken`)
and never write to this table.

When `notify(...)` fires, `sendWebPushToUser(userId, payload)` loads every
row for that user and dispatches via the `web-push` library. A 404 or 410
response from the push service auto-deletes the dead row.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String (PK) | cuid |
| `userId` | String | indexed; logical FK to User (no Prisma relation declared) |
| `endpoint` | String, **unique** | full push service URL from `PushSubscription.endpoint` |
| `p256dh` | String | base64 elliptic-curve public key from `PushSubscription.keys.p256dh` |
| `auth` | String | base64 auth secret from `PushSubscription.keys.auth` |
| `createdAt` | DateTime | |

```prisma
model WebPushSubscription {
  id        String   @id @default(cuid())
  userId    String
  endpoint  String   @unique
  p256dh    String
  auth      String
  createdAt DateTime @default(now())

  @@index([userId])
}
```

Migration: `backend/prisma/migrations/20260507_notif_prefs/migration.sql`.

## Index strategy

| Model | Indexes | Why |
| --- | --- | --- |
| User | `phone` unique | login lookup |
| Store | `(lat, lng)`, `category`, `status` | nearby queries, filters |
| CatalogItem | unique `name`, `category`, `name` | catalog browse + admin uniqueness |
| StoreItem | `(storeId, catalogItemId)` unique, `storeId`, `catalogItemId` | per-store inventory & cross-store availability |
| Order | `customerId`, `storeId`, `driverId`, `status`, `placedAt` desc | inbox queries |
| Notification | `(userId, createdAt desc)`, partial WHERE `readAt IS NULL` | unread badge |
| NotificationPreferences | `userId` unique | one-row-per-user lookup in `notify()` |
| WebPushSubscription | `endpoint` unique, `userId` | upsert on subscribe, fan-out per user |
| RefreshToken | `tokenHash` unique, `userId` | refresh + bulk revoke |

## Migrations

```bash
# Create a new migration during development
docker compose exec backend npx prisma migrate dev --name add_xyz

# Apply migrations in CI / prod
docker compose exec backend npx prisma migrate deploy

# Inspect data
docker compose exec backend npx prisma studio --port 5555 --browser none
# then visit http://localhost:5555
```
