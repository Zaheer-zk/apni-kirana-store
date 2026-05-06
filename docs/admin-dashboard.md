# Admin Dashboard

The Next.js 15 web app used by operations staff to run the platform.

## Capabilities

- Approve / reject pending stores and drivers
- View, filter, and inspect all orders
- Suspend abusive users, stores, or drivers
- Configure platform-wide settings (delivery radius, fees, commission)
- View analytics: GMV, orders, active users, average delivery time

## Tech

- Next.js 15 (App Router)
- React Server Components for list views, Client Components for forms
- Tailwind CSS + shadcn/ui
- Auth via the same `/api/v1/auth` endpoints; the JWT is stored in an httpOnly cookie set by a Next.js route handler.

## Routes

| Path | Purpose |
| --- | --- |
| `/login` | OTP login (admin role required) |
| `/` | KPI dashboard |
| `/users` | User search / suspend |
| `/stores` | All stores |
| `/stores/pending` | Approval queue |
| `/stores/[id]` | Store detail, suspend, edit commission |
| `/drivers` | All drivers |
| `/drivers/pending` | Approval queue |
| `/drivers/[id]` | Driver detail, suspend, view docs |
| `/orders` | Filterable order table |
| `/orders/[id]` | Order detail, status timeline, refund |
| `/analytics` | Charts and trends |
| `/settings` | Platform config |

## Store / driver approval

Pending lists pull from `GET /admin/stores/pending` and `GET /admin/drivers/pending`. Each row exposes:

- Submitted documents (images render inline; license, store photo, etc.)
- Approve button → `PUT /admin/stores/:id/approve` (or `/drivers/:id/approve`)
- Reject button → opens a dialog asking for a reason; sends a suspend with the reason as note.

On approval the backend sends a push (`STORE_APPROVED` / `DRIVER_APPROVED`) so the user's mobile app updates instantly.

## Order management

The `/orders` table supports filters: status, date range, store, driver, customer phone, payment method. Each row links to a detail page with:

- Item list
- Status timeline (placed → accepted → ready → assigned → picked up → delivered)
- Customer + driver contact (one-tap call)
- Refund button (if `paymentStatus=PAID`)
- Reassign driver button (if stuck in `AWAITING_DRIVER`)

## Analytics

Pulled from `GET /admin/analytics` plus a few server-rendered Prisma queries. Charts use Recharts.

| Card | Source |
| --- | --- |
| Orders today / GMV today | `/admin/analytics` |
| Active stores / drivers | `/admin/analytics` |
| Avg delivery minutes | `/admin/analytics` |
| Orders by hour (chart) | server query |
| Top stores (table) | server query |
| Cancellations by reason (pie) | server query |

## Settings

Single page with sections:

| Section | Fields |
| --- | --- |
| Delivery | `MAX_RADIUS_KM` (store search), `DRIVER_RADIUS_KM` (initial), `DRIVER_RADIUS_KM_FALLBACK` |
| Fees | base delivery fee, per-km fee, surge multiplier window |
| Commission | default % per category (overridable per store) |
| Timeouts | store accept window, driver accept window |
| Payments | Razorpay key id (read-only display), COD limit |

Settings are stored in a `Setting` key/value table (loaded into in-memory cache on backend boot, refreshed via a Redis pub/sub event when admin saves).

## User management

Search users by phone, role, or name. Per-row actions:

- View profile (orders, addresses, devices)
- Suspend / unsuspend
- Reset device (revokes all refresh tokens)
