# Development Roadmap

## Apni Kirana Store — Hyperlocal Delivery App

**Version:** 1.0  
**Date:** 2026-05-06

---

## 📊 Current Status

| Metric       | Count              |
| ------------ | ------------------ |
| ✅ Completed | **120** items      |
| ❌ Remaining | **85** items       |
| **Overall**  | **~58% complete**  |

| Phase                         | Status     | Notes                                                         |
| ----------------------------- | ---------- | ------------------------------------------------------------- |
| Phase 0 — Foundation & Design | ✅ Done    | Stack locked, monorepo + Docker, design system in code        |
| Phase 1 — Backend Core        | ✅ Done    | All 7 routers, matching engine, BullMQ, Socket.io, FCM (stub) |
| Phase 2 — Customer App        | ✅ Done    | All 11 screens redesigned, SDK 54, full flow working          |
| Phase 3 — Store Portal        | ✅ Done    | All screens scaffolded, integrated with backend               |
| Phase 4 — Driver App          | ✅ Done    | All screens, online toggle, GPS tracking lib                  |
| Phase 5 — Admin Dashboard     | ✅ Done    | Phone OTP login, all CRUD + analytics                         |
| Phase 6 — Integration & QA    | 🟡 Partial | Backend + frontend tests written; manual QA pending           |
| Phase 7 — Beta Launch         | 🔲 Pending | Pilot stores/drivers/customers not yet onboarded              |
| Phase 8 — Scale               | 🔲 Pending | Awaits beta feedback                                          |

**Remaining work:** Twilio production integration, Razorpay live keys, Cloudinary uploads, CI/CD, app store submissions, beta launch.

---

## Overview

| Phase   | Name                                  |
| ------- | ------------------------------------- |
| Phase 0 | Foundation & Design                   |
| Phase 1 | Backend Core                          |
| Phase 2 | Customer App                          |
| Phase 3 | Store Owner Portal                    |
| Phase 4 | Driver App                            |
| Phase 5 | Admin Dashboard                       |
| Phase 6 | Integration & QA                      |
| Phase 7 | Beta Launch                           |
| Phase 8 | Stabilization & Scale                 |
| Phase 9 | **Marketplace Pivot** (catalog model) |

> Phases are organized by deliverable, not by calendar. Items get done as priorities allow.

---

## Phase 0 — Foundation & Design

**Goal:** Resolve open questions, finalize decisions, set up infrastructure, produce design assets.

### Decisions & Architecture

- ❌ Finalize open questions from BRD (launch city, language, medicine flow, SLAs)
- ✅ Lock tech stack
  - Mobile: **React Native** (Expo) — single codebase iOS + Android
  - Backend: **Node.js + Express**
  - Database: **PostgreSQL** (primary) + **Redis** (cache + sessions)
  - Real-time: **Socket.io**
  - Maps: **Google Maps API**
  - Push: **Firebase Cloud Messaging (FCM)**
  - Storage: **Cloudinary** (images)
  - Payment: **Razorpay**
- ❌ Define delivery radius defaults and zone boundaries
- ❌ Define commission % and delivery fee structure
- ✅ Set up Git monorepo structure
  ```
  apni-kirana-store/
  ├── apps/
  │   ├── customer/        # React Native
  │   ├── driver/          # React Native
  │   ├── store-portal/    # React Native
  │   └── admin/           # React Web (Next.js)
  ├── backend/
  │   ├── src/
  │   │   ├── auth/
  │   │   ├── orders/
  │   │   ├── stores/
  │   │   ├── drivers/
  │   │   ├── matching/
  │   │   └── notifications/
  │   └── ...
  └── shared/              # Shared types, constants
  ```
- ✅ Set up local Docker Compose stack (production VPS deploy guide in docs/deployment.md)
- ❌ Set up CI/CD pipeline (GitHub Actions)
- ❌ Set up environments: `dev`, `staging`, `production`

### Design System & UI/UX

- ✅ Define brand identity (colors, typography, logo)
- ❌ Design UI in Figma — Customer App screens:
  - Splash / Onboarding
  - OTP Login
  - Home (categories + featured items)
  - Search / Browse
  - Item Detail
  - Cart
  - Checkout
  - Order Status / Live Tracking
  - Order History
  - Profile
- ❌ Design Store Owner Portal screens:
  - Dashboard
  - Inventory list / add item
  - Incoming order notification
  - Order detail
- ❌ Design Driver App screens:
  - Dashboard / availability toggle
  - Incoming request
  - Pickup navigation
  - Delivery confirmation
- ✅ Create shared design system (constants/theme.ts + 8 reusable components)
- ❌ Get design sign-off before dev starts

---

## Phase 1 — Backend Core

**Goal:** Build all API services that power every app. Apps are built against these APIs.

### Project Setup + Auth Service

- ✅ Initialize Node.js project (TypeScript, Express, Prisma ORM)
- ✅ Set up PostgreSQL schema (initial migrations)
  - Users (customers, stores, drivers, admins)
  - Addresses
  - Sessions / tokens
- ✅ Auth Service
  - OTP generation and verification (SMS via Twilio or local gateway)
  - JWT access + refresh token flow
  - Role-based auth middleware (`customer`, `store`, `driver`, `admin`)
- ✅ Redis setup for OTP storage and session cache
- ❌ API documentation setup (Swagger / Postman collection)

### Store & Inventory Service

- ✅ Store model: name, address, lat/lng, category, status, operating hours
- ✅ Store registration and admin approval flow
- ✅ Inventory model: item name, category, price, unit, stock quantity, image URL
- ✅ Inventory CRUD APIs (for store owners)
- ❌ Bulk CSV import endpoint
- ✅ Item search API (by name, category, keyword)
- ✅ Geolocation: store lookup by radius (Haversine + bounding box)
- ❌ Cloudinary integration for image uploads

### Order Service

- ✅ Order model: items, customer, store, driver, status, timestamps
- ✅ Order placement API
  - Validate cart items
  - Calculate totals, delivery fee, commission
  - Trigger store matching engine
- ✅ Order status state machine:
  ```
  PENDING → STORE_ACCEPTED → DRIVER_ASSIGNED
  → PICKED_UP → DELIVERED
  (or) → REJECTED → REASSIGNED / CANCELLED
  ```
- ✅ Order history APIs (customer, store, driver views)
- ✅ Order cancellation with reason
- ❌ Razorpay payment integration (initiate + webhook for confirmation)

### Matching Engine + Notifications

- ✅ Store Matching Engine
  - Input: order items + customer lat/lng
  - Query stores in radius sorted by distance
  - Score each store by item availability %
  - Select best match (score × proximity weight)
  - Auto-reassign if store rejects (3-min timeout via Redis TTL + queue)
- ✅ Driver Assignment Engine
  - Query available drivers within 2 km of store
  - Send request to nearest driver
  - 60-second acceptance window → auto-move to next driver
- ✅ Job queue (BullMQ + Redis) for:
  - Store timeout auto-reassignment
  - Driver timeout auto-reassignment
  - Scheduled reminders
- ✅ Firebase Cloud Messaging integration
  - Push notification service with templates per event
- ✅ Socket.io setup for real-time:
  - Driver location updates (emit every 5s when on a job)
  - Order status push to customer

---

## Phase 2 — Customer App

**Goal:** Fully functional customer-facing React Native app.

### Setup + Auth + Navigation

- ✅ Expo project init with TypeScript (SDK 54)
- ✅ Navigation setup (Expo Router v6 with tabs)
- ✅ OTP login screen + flow (integrated with Auth API)
- ✅ Token storage (SecureStore)
- ✅ Auto-login on app open if token valid
- ✅ Splash screen with brand badge

### Home, Browse, Search

- ✅ Home screen: category grid, popular items, nearby stores
- ✅ Category browse screen with item list
- ✅ Item search (debounced 400ms)
- ✅ Item detail screen with sticky add-to-cart bar
- ✅ Cart management with Zustand store

### Checkout + Order Placement

- ✅ Cart review screen
- ✅ Delivery address selector
- ✅ Save multiple addresses to profile
- ✅ Payment selection UI (COD / Online radio buttons)
- ✅ Promo code input UI
- ✅ Order summary and confirm
- ✅ Order placement API call + loading/error states

### Order Tracking

- ✅ Order status screen (5-step indicator)
- ✅ Live map with driver marker (Socket.io updates)
- ❌ Estimated time display
- ❌ Push notification handling (foreground + background)
- ✅ Cancel order flow (within allowed window)

### Profile + History + Polish

- ✅ User profile screen with avatar, stats
- ✅ Saved addresses management
- ✅ Order history list with Active/Past tabs
- ❌ Reorder from history
- ✅ Rate store and driver (5-star UI)
- ✅ App-wide error handling and EmptyState component
- ✅ Loading skeletons (Skeleton component)

---

## Phase 3 — Store Owner Portal

**Goal:** Store owners can manage inventory and fulfill orders.

### Setup + Onboarding + Inventory

- ✅ React Native project init (SDK 54)
- ✅ Store registration form
- ✅ Login (OTP) + pending approval screen
- ✅ Dashboard: today's orders count, earnings, open orders
- ✅ Inventory list screen
- ✅ Add / Edit item form
- ✅ Toggle item in/out of stock
- ❌ CSV bulk upload for inventory

### Order Management

- ✅ Incoming order banner with 3-min countdown
- ✅ Order detail screen with items + accept/reject
- ✅ Accept / Reject order flow (3-min countdown)
- ✅ Mark order as "Ready for Pickup"
- ✅ Active orders list + history

### Earnings + Polish

- ✅ Earnings screen with period filter
- ❌ Operating hours settings
- ❌ Store profile edit (address, photos)
- ❌ Notification preferences
- ❌ Offline handling (queue accept/reject until reconnected)

---

## Phase 4 — Driver App

**Goal:** Drivers can receive, pick up, and complete deliveries.

### Setup + Onboarding + Availability

- ✅ React Native project init (SDK 54)
- ✅ Driver registration form
- ✅ Login (OTP) + pending approval screen
- ✅ Online / Offline toggle (animated component)
- ✅ Background location tracking lib
- ✅ Emit location to backend via Socket.io

### Order Assignment + Delivery Flow

- ✅ Incoming order modal with 60s countdown
- ✅ Request card with addresses + earnings
- ✅ Accept / Reject (60-second countdown)
- ✅ Pickup screen with maps deep-link
- ✅ Confirm pickup button
- ✅ Delivery screen with maps deep-link
- ✅ Confirm delivery button
- ✅ Auto-update order status on each action

### Earnings + Polish

- ✅ Earnings per delivery + daily summary
- ❌ Weekly payout history
- ✅ Ratings received from customers
- ✅ Delivery history list
- ✅ Help / support contact

---

## Phase 5 — Admin Dashboard

**Goal:** Internal tool to manage the entire platform.

### Core Management

- ✅ Next.js 15 web app init
- ✅ Admin login (phone OTP, like other roles)
- ✅ User management with search + suspend/unsuspend
- ✅ Store management with status tabs (Pending/Active/Suspended)
- ✅ Driver management with status tabs

### Operations + Analytics

- ✅ Order management with status + date filters
- ❌ Dispute resolution: flag orders, add notes, issue refunds
- ❌ Promo code creation (flat or %, expiry, usage limits)
- ❌ Zone configuration: delivery radius per city/area
- ✅ Commission & delivery fee settings page
- ✅ Analytics dashboard with stat cards + charts
  - Orders per day (chart)
  - GMV (Gross Merchandise Value)
  - Active drivers count
  - Top stores by volume
  - Customer retention metrics

---

## Phase 6 — Integration & QA

**Goal:** All components work together. No critical bugs before beta.

### End-to-End Integration

- ✅ Backend integration tests (Jest + Supertest, 8 test files)
- ✅ Frontend smoke tests (53 test files across all 4 apps)
- ❌ Payment flow: online payment + COD
- ❌ Push notifications verified on Android + iOS
- ❌ Store matching edge cases:
  - No store found → customer notified
  - Store rejects → auto-reassign verified
  - No driver → customer notified
- ❌ All timeouts and auto-reassignment jobs verified

### QA & Bug Fixes

- ❌ Internal QA on physical Android + iOS devices
- ❌ Performance testing: app load time, API response times
- ❌ Network edge cases: slow connection, offline, reconnection
- ❌ Security audit:
  - Auth token expiry and refresh
  - API route protection by role
  - Input validation / SQL injection checks
  - Sensitive data not logged
- ❌ Fix all critical and high priority bugs

### Pre-launch Checklist

- ❌ App icons, splash screens finalized
- ❌ Play Store + App Store developer accounts set up
- ❌ Privacy policy and Terms of Service pages
- ❌ Production environment provisioned and load tested
- ❌ Database backups and monitoring alerts set up (Sentry, Datadog or similar)
- ❌ Rollback plan documented

---

## Phase 7 — Beta Launch

**Goal:** Controlled launch with real users in a single city/zone.

### Soft Launch

- ❌ Onboard 10–20 pilot stores manually
- ❌ Onboard 5–10 pilot drivers
- ❌ Invite 50–100 beta customers (friends, family, community)
- ❌ Monitor all orders in real-time via admin dashboard
- ❌ Collect feedback via simple form or WhatsApp group

### Iteration

- ❌ Daily bug triage from beta feedback
- ❌ Fix top 10 most reported issues
- ❌ App Store / Play Store submission (for review approval)
- ❌ Prepare customer acquisition plan for public launch

---

## Phase 8 — Stabilization & Scale

**Goal:** Production-ready for public launch.

- ❌ Address all beta feedback
- ❌ Performance optimization (query indexing, caching hot paths)
- ❌ Public launch in target city
- ❌ Monitor error rates, latency, driver assignment success rate
- ❌ Set KPIs for Month 1: orders/day, avg delivery time, store acceptance rate
- ❌ Plan Phase 2 features based on real user data

---

## Dependency Map

```
Phase 0 (Design + Infra)
    └── Phase 1 (Backend)
            ├── Phase 2 (Customer App)    ← depends on Auth, Order, Matching APIs
            ├── Phase 3 (Store Portal)    ← depends on Auth, Inventory, Order APIs
            ├── Phase 4 (Driver App)      ← depends on Auth, Driver, Real-time APIs
            └── Phase 5 (Admin Dashboard) ← depends on all APIs
                    └── Phase 6 (QA)
                            └── Phase 7 (Beta)
                                    └── Phase 8 (Scale)
```

> Phase 2, 3, 4, 5 can be built in parallel once Phase 1 APIs are available.

---

## Team Roles (Suggested Minimum)

| Role               | Count | Responsible For                                       |
| ------------------ | ----- | ----------------------------------------------------- |
| Mobile Developer   | 1–2   | Customer App, Driver App, Store Portal (React Native) |
| Frontend Developer | 1     | Admin Dashboard (Next.js)                             |
| Backend Developer  | 1–2   | All APIs, matching engine, real-time                  |
| UI/UX Designer     | 1     | Figma designs, design system                          |
| QA Engineer        | 1     | Testing across all platforms                          |
| Project Lead       | 1     | Coordination, decisions, stakeholder updates          |

---

## Key Metrics to Track Post-Launch

| Metric                         | Target (Month 1) |
| ------------------------------ | ---------------- |
| Orders per day                 | 20+              |
| Avg delivery time              | < 45 min         |
| Store acceptance rate          | > 85%            |
| Driver assignment success rate | > 90%            |
| App crash rate                 | < 1%             |
| Customer reorder rate (30-day) | > 25%            |

## 🚧 Phase 9 — Marketplace Pivot (NEW — high priority)

**Decision (2026-05-06):** Switch from per-store inventory to a **catalog-based marketplace** model. The customer browses a unified product catalog; the system finds the nearest store carrying each item; drivers see only the dropoff coordinates and bill, never customer PII.

### Why

- Current model: each store defines its own items (duplicated names, no cross-store browsing)
- Pivot: single canonical catalog → cleaner UX, easier matching, better SEO
- Privacy: drivers should not learn customer name/phone — only dropoff lat/lng + items + amount

### Schema changes

- ✅ **New model `CatalogItem`** (admin-managed master products)
  - `id, name (unique), description, category, defaultUnit, imageUrl, isActive`
- ✅ **New model `StoreItem`** (which catalog items each store carries)
  - `id, storeId, catalogItemId, price, stockQty, isAvailable`
  - unique(storeId, catalogItemId) so no duplicate listings per store
- ✅ **Deprecate `Item` model** — replaced by StoreItem with FK to CatalogItem
- ✅ **Migration** (`20260506_marketplace_catalog`): existing items lifted into CatalogItem (deduped by name), then converted into StoreItem rows pointing at the catalog row. OrderItem.itemId loosened (denormalized name/price/unit kept for history).
- ✅ Indexes on Store ↔ StoreItem and CatalogItem ↔ StoreItem
- ✅ `Order.dropoffOtp` (4-digit handoff verification)

### Backend endpoints

- ✅ `GET /api/v1/catalog` — paginated catalog (public, filter by category/q)
- ✅ `GET /api/v1/catalog/:id` — single catalog item + list of stores carrying it (sorted by distance when lat/lng given), with each store's price + stock
- ✅ `GET /api/v1/catalog/search/q?q=...` — full-text search
- ✅ `POST /api/v1/catalog` — admin creates catalog item (Zod validated)
- ✅ `PUT /api/v1/catalog/:id` — admin edits
- ✅ `DELETE /api/v1/catalog/:id`
- ✅ `POST /api/v1/items` — store owner adds catalog item to their inventory `{ catalogItemId, price, stockQty }` (rejects duplicates with 409)
- ✅ `PUT /api/v1/items/:id` — update price/stock/availability (owner-only)
- ✅ `DELETE /api/v1/items/:id` — remove from inventory
- ✅ `PUT /api/v1/items/:id/toggle-availability` and `/stock`
- ✅ `GET /api/v1/stores/:id/items` — flattened (catalog joined) for customer-facing browse
- ❌ CSV bulk upload for store inventory
- ❌ CSV bulk upload for admin catalog

### Order flow change

- ✅ **Two ordering modes**:
  - `STORE_DIRECT`: customer browses one store, sends `{ storeItemId }`s
  - `CATALOG`: customer chose catalog items, sends `{ catalogItemId }`s and the engine picks the best store carrying all (majority-first ranking)
- ✅ Multi-store splits not supported in v1 (returns 400; future enhancement)
- ✅ Prices snapshotted into OrderItem at order time

### Matching engines (NEW: parallel-broadcast first-accept-wins)

- ✅ **Store matching — BROADCAST mode (default)**: top 5 candidate stores get notified in parallel. First store to tap Accept wins. Other broadcast recipients receive a "rescinded" notification. (`STORE_MATCHING_MODE=BROADCAST|CASCADE` env.)
  - Score = matchRatio × 0.6 + proximity × 0.3 + rating × 0.1
  - Filter: stores below 60% item match are skipped
  - Stores ranked majority-first (most matched items) then by distance
  - Safety net: if no acceptance within 3 minutes, retries with next 5 candidates
- ✅ **Driver assignment — BROADCAST mode (default)**: top 3 nearby ONLINE drivers notified in parallel, first-accept-wins. (`DRIVER_MATCHING_MODE=BROADCAST|CASCADE` env.)
  - Score = proximity × 0.6 + rating × 0.3 + freshness × 0.1
  - 60-second window per broadcast; if nobody accepts, retries excluding tried drivers

### Admin manual override (NEW)

- ✅ `GET /api/v1/admin/orders/:id` — full order detail (customer, store, driver, items, address, rating)
- ✅ `PUT /api/v1/admin/orders/:id/assign-store` — manually assign or change store; status → STORE_ACCEPTED, store owner notified
- ✅ `PUT /api/v1/admin/orders/:id/assign-driver` — manually assign or change driver; status → DRIVER_ASSIGNED, driver notified
- ❌ Admin UI: order detail page with assignment dropdowns + audit log

### Privacy (driver-side)

- ✅ **Driver order view** strips `customer.name`/`customer.phone`. Driver sees:
  - Pickup: store name + address + items
  - Dropoff: lat/lng + label/pincode/city only (no street, no name)
  - Bill: total + payment method (COD flag)
  - Verification: 4-digit dropoff OTP shown in the customer's app
- ✅ `PUT /api/v1/drivers/orders/:orderId/deliver` requires `dropoffOtp` body field; mismatched OTP rejected with 400
- ❌ Customer order view: hide driver's raw phone — call via masked number (placeholder for Twilio Programmable Voice)
- ❌ Audit log: track admin manual assignments + privacy-affecting actions

### Customer app

- ✅ **Two browse modes**: by store (current per-store browse) OR by catalog (browse all products)
- ❌ Catalog browse home: tile per category, infinite-scroll item grid
- ❌ Item detail: "Available at 3 stores nearby" picker (closest auto-selected, customer can switch)
- ✅ Floating cart preview button (appears once cart has items, sticky bottom)
- ❌ Show dropoff OTP on tracking screen once order is PICKED_UP
- ❌ Address picker integrated with map (DONE — onboarding/map-picker)

### Store Portal

- ✅ Backend supports "Add from catalog": `POST /api/v1/items { catalogItemId, price, stockQty }`
- ❌ UI: search master catalog → tap to add → set price + stock
- ❌ UI: "My products" replaces "My inventory" (drives the new add-from-catalog flow)
- ❌ Bulk price update screen
- ❌ Inline notification on `order:offered` socket event (broadcast notification)

### Driver app

- ✅ Backend supports privacy-preserving order view + dropoff OTP delivery
- ❌ UI: receive `order:offered` socket → show pickup screen with store address + items
- ❌ UI: pickup confirm → status PICKED_UP → show dropoff coords + OTP entry
- ❌ UI: enter 4-digit dropoff OTP to confirm delivery
- ❌ UI: rescinded notification when another driver accepts first

### Admin dashboard

- ❌ **New top nav: Catalog** — CRUD master products list, categories, images
- ❌ CSV bulk upload for catalog items
- ❌ Order detail page with manual assign-store + assign-driver dropdowns
- ❌ Approve catalog item suggestions (Phase 9.1: store-owners can suggest)

### Documentation

- ❌ Update `docs/database-schema.md` — CatalogItem, StoreItem, Order.dropoffOtp
- ❌ Update `docs/api-reference.md` — add /catalog endpoints, change /items, add admin /orders/:id/assign-store|driver
- ❌ Update `docs/matching-algorithm.md` — broadcast vs cascade modes, scoring formulas
- ❌ Update `docs/customer-app.md` / `docs/store-portal.md` / `docs/driver-app.md` / `docs/admin-dashboard.md`
- ❌ New `docs/privacy.md` — explain dropoff OTP flow + driver order view rules
