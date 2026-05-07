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

### Order detail view

`/orders/[id]` renders the full payload from `GET /api/v1/admin/orders/:id` —
admins always see PII (customer name + phone, full delivery address, the
4-digit `dropoffOtp`). The page exposes:

| Section | Source |
| --- | --- |
| Customer | `customer.id`, `name`, `phone` |
| Store | `store.id`, `name`, `ownerId`, `lat`/`lng`, `street`, `city` |
| Driver | `driver.user.name`, `phone`, vehicle |
| Items | `items[]` with snapshot `name`, `price`, `unit`, `qty` |
| Address | full `deliveryAddress` |
| Dropoff OTP | `dropoffOtp` — visible to admin so they can read it back to a customer who lost their phone |
| Rating | if `rating` present |

Two manual-override action buttons sit at the top of the detail page, useful
when automatic matching fails:

| Button | Endpoint | Behavior |
| --- | --- | --- |
| **Assign store** | `PUT /api/v1/admin/orders/:id/assign-store` | Dropdown of all `ACTIVE` stores. Submitting moves the order to `STORE_ACCEPTED`, stamps `storeAcceptedAt`, and notifies the new owner. |
| **Assign driver** | `PUT /api/v1/admin/orders/:id/assign-driver` | Dropdown of all `ONLINE`/`ACTIVE` drivers. Submitting moves the order to `DRIVER_ASSIGNED`, stamps `driverAssignedAt`, and notifies the driver. |

Both actions are blocked server-side for `DELIVERED` / `CANCELLED` orders.

### Catalog management (planned)

Now that the platform has a master `CatalogItem` table, admins are the source
of truth for product names, categories, units, and images. The planned
`/catalog` admin page will:

- List, search, and filter all `CatalogItem` rows.
- Add a new catalog item (`POST /api/v1/catalog`) with image upload.
- Edit an existing item (`PUT /api/v1/catalog/:id`).
- Soft-delete via `isActive=false` (toggle, not destructive).
- **CSV bulk upload** (planned) — paste/upload a sheet of name/category/unit/image rows for fast onboarding.

Until the UI ships, the catalog endpoints are usable directly via REST.

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

## Web Push notifications

The admin dashboard is the only surface that uses **browser Web Push** instead
of FCM. Admins get desktop notifications for new pending stores/drivers,
refund events, and any other admin-side `NotificationEvent` (see
`docs/notifications.md` for the full catalog).

### First-visit prompt

On first authenticated visit, the dashboard checks whether the browser is
subscribed and prompts:

> **Get notified about new approvals and refunds**
> Allow desktop notifications so you don't miss pending stores, drivers, or
> refund requests. You can change this anytime from your profile.
>
> [Enable notifications]   [Not now]

Tapping **Enable notifications** runs the subscribe flow below. Tapping
**Not now** dismisses the banner for the session; it reappears on the next
sign-in until the admin either subscribes or sets the underlying preference
flags off.

### Subscribe button

Lives in the header next to the bell. States:

| State | Source of truth | Button label |
| --- | --- | --- |
| Permission `default` (never asked) | `Notification.permission` | "Enable notifications" |
| Permission `granted`, no subscription | `pushManager.getSubscription()` returns null | "Enable notifications" |
| Subscribed | a row in `WebPushSubscription` for this `endpoint` | "Notifications on" (clickable to unsubscribe) |
| Permission `denied` | `Notification.permission` | "Notifications blocked" (disabled, with help text linking to browser settings) |

### Subscribe flow

```ts
// 1. Fetch the VAPID public key
const { publicKey } = await api.get('/notifications/web-push/public-key');
if (!publicKey) return; // backend has VAPID disabled

// 2. Register the service worker (idempotent)
const reg = await navigator.serviceWorker.register('/sw.js');

// 3. Ask the browser for permission + subscription
const sub = await reg.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: urlBase64ToUint8Array(publicKey),
});

// 4. POST to backend — server upserts on `endpoint`
await api.post('/notifications/web-push/subscribe', sub.toJSON());
```

Unsubscribe is the inverse: call `sub.unsubscribe()` then
`POST /notifications/web-push/unsubscribe` with `{ endpoint }`.

### Service worker

Lives at `public/sw.js` — minimal, just enough to render the push and route
the click. The push payload is `{ title, body, url, icon? }`. The backend
sets `url = /orders/{{orderId}}` when the source event includes an `orderId`,
otherwise `/`.

```js
self.addEventListener('push', (event) => {
  const payload = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Apni Kirana', {
      body: payload.body,
      icon: payload.icon ?? '/icon-192.png',
      data: { url: payload.url ?? '/' },
    }),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
```

### Notification bell + dropdown

In the header. Polls `GET /api/v1/notifications` (or subscribes via socket on
the admin namespace) and shows the unread count. Clicking opens a dropdown
with the most recent 10 notifications; clicking an item marks it read
(`PUT /notifications/:id/read`) and navigates to the linked entity.

A "View all" link at the bottom takes the admin to **`/notifications`**, a
full paginated list with filters (read/unread, event type, date range) and
a bulk "Mark all read" button (`PUT /notifications/read-all`).

### Preferences

Admins can fine-tune which events trigger a desktop push from
**Profile → Notification preferences**. The page reads/writes
`GET|PUT /api/v1/users/me/preferences`. Admin-relevant flags:

- `newStoreApprovals` — fires `ADMIN_NEW_STORE_PENDING`
- `newDriverApprovals` — fires `ADMIN_NEW_DRIVER_PENDING`
- `refundEvents` — refund-related events
- `promotional` — opt out of platform-side promo announcements

Toggling a flag off prevents both the in-app inbox row and the desktop push
from being created — see `docs/notifications.md` for the full preference
gating logic.

### Failure handling

If the push service returns 404 (gone) or 410 (deleted) for a subscription,
the backend deletes that `WebPushSubscription` row automatically. The next
admin login on that browser will re-subscribe and resume getting pushes.
