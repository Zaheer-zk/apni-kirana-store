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
              +------+-----+                       |    Item    |        |
              | OrderItem  |*--------------------->+------------+        |
              +------------+                                              |
                     |1                                                   |
                     |0..1                                                |
              +------+--------+        Order.driverId ?-------------------+
              | OrderRating   |
              +---------------+
```

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

### `Item`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String (PK) | |
| `storeId` | String (FK → Store) | indexed |
| `name` | String | indexed (trigram) for search |
| `description` | String? | |
| `price` | Decimal(10,2) | |
| `mrp` | Decimal(10,2)? | |
| `stock` | Int | default 0 |
| `unit` | String | "1 L", "500 g", "pack of 6" |
| `imageUrl` | String? | |
| `available` | Boolean | default `true` |
| `createdAt`, `updatedAt` | DateTime | |

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
| `placedAt` | DateTime | |
| `acceptedAt`, `readyAt`, `pickedUpAt`, `deliveredAt`, `cancelledAt` | DateTime? | |

### `OrderItem`

Why denormalised? Items can be edited or deleted *after* an order is placed. Snapshotting `name` and `price` at order time guarantees the historical record stays accurate even if the parent `Item` row changes.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String (PK) | |
| `orderId` | String (FK → Order) | indexed |
| `itemId` | String (FK → Item) | nullable on delete-set-null |
| `nameSnapshot` | String | copied from Item at order time |
| `priceSnapshot` | Decimal(10,2) | copied at order time |
| `qty` | Int | |
| `lineTotal` | Decimal(10,2) | `priceSnapshot * qty` |

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

## Index strategy

| Model | Indexes | Why |
| --- | --- | --- |
| User | `phone` unique | login lookup |
| Store | `(lat, lng)`, `category`, `status` | nearby queries, filters |
| Item | `storeId`, GIN trigram on `name` | catalog + cross-store search |
| Order | `customerId`, `storeId`, `driverId`, `status`, `placedAt` desc | inbox queries |
| Notification | `(userId, createdAt desc)`, partial WHERE `readAt IS NULL` | unread badge |
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
