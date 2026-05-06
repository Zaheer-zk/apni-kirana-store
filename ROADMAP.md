# Development Roadmap

## Apni Kirana Store — Hyperlocal Delivery App

**Version:** 1.0  
**Date:** 2026-05-06  
**Total Estimated Duration:** ~20 Weeks

---

## Overview

```
Phase 0  │ Foundation & Design          │ Week 1–2
Phase 1  │ Backend Core                 │ Week 3–6
Phase 2  │ Customer App (MVP)           │ Week 5–10
Phase 3  │ Store Owner Portal           │ Week 7–11
Phase 4  │ Driver App                   │ Week 9–13
Phase 5  │ Admin Dashboard              │ Week 11–14
Phase 6  │ Integration & QA             │ Week 14–16
Phase 7  │ Beta Launch                  │ Week 17–18
Phase 8  │ Stabilization & Scale        │ Week 19–20
```

---

## Phase 0 — Foundation & Design (Week 1–2)

**Goal:** Resolve open questions, finalize decisions, set up infrastructure, produce design assets.

### Week 1 — Decisions & Architecture

- [ ] Finalize open questions from BRD (launch city, language, medicine flow, SLAs)
- [ ] Lock tech stack
  - Mobile: **React Native** (Expo) — single codebase iOS + Android
  - Backend: **Node.js + Express**
  - Database: **PostgreSQL** (primary) + **Redis** (cache + sessions)
  - Real-time: **Socket.io**
  - Maps: **Google Maps API**
  - Push: **Firebase Cloud Messaging (FCM)**
  - Storage: **Cloudinary** (images)
  - Payment: **Razorpay**
- [ ] Define delivery radius defaults and zone boundaries
- [ ] Define commission % and delivery fee structure
- [ ] Set up Git monorepo structure
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
- [ ] Set up cloud infrastructure (AWS / GCP / Railway) - ubuntu vps
- [ ] Set up CI/CD pipeline (GitHub Actions)
- [ ] Set up environments: `dev`, `staging`, `production`

### Week 2 — Design System & UI/UX

- [ ] Define brand identity (colors, typography, logo)
- [ ] Design UI in Figma — Customer App screens:
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
- [ ] Design Store Owner Portal screens:
  - Dashboard
  - Inventory list / add item
  - Incoming order notification
  - Order detail
- [ ] Design Driver App screens:
  - Dashboard / availability toggle
  - Incoming request
  - Pickup navigation
  - Delivery confirmation
- [ ] Create shared design system (components, spacing, colors)
- [ ] Get design sign-off before dev starts

---

## Phase 1 — Backend Core (Week 3–6)

**Goal:** Build all API services that power every app. Apps are built against these APIs.

### Week 3 — Project Setup + Auth Service

- [ ] Initialize Node.js project (TypeScript, Express, Prisma ORM)
- [ ] Set up PostgreSQL schema (initial migrations)
  - Users (customers, stores, drivers, admins)
  - Addresses
  - Sessions / tokens
- [ ] Auth Service
  - OTP generation and verification (SMS via Twilio or local gateway)
  - JWT access + refresh token flow
  - Role-based auth middleware (`customer`, `store`, `driver`, `admin`)
- [ ] Redis setup for OTP storage and session cache
- [ ] API documentation setup (Swagger / Postman collection)

### Week 4 — Store & Inventory Service

- [ ] Store model: name, address, lat/lng, category, status, operating hours
- [ ] Store registration and admin approval flow
- [ ] Inventory model: item name, category, price, unit, stock quantity, image URL
- [ ] Inventory CRUD APIs (for store owners)
- [ ] Bulk CSV import endpoint
- [ ] Item search API (by name, category, keyword)
- [ ] Geolocation: store lookup by radius using PostGIS or Haversine formula
- [ ] Cloudinary integration for image uploads

### Week 5 — Order Service

- [ ] Order model: items, customer, store, driver, status, timestamps
- [ ] Order placement API
  - Validate cart items
  - Calculate totals, delivery fee, commission
  - Trigger store matching engine
- [ ] Order status state machine:
  ```
  PENDING → STORE_ACCEPTED → DRIVER_ASSIGNED
  → PICKED_UP → DELIVERED
  (or) → REJECTED → REASSIGNED / CANCELLED
  ```
- [ ] Order history APIs (customer, store, driver views)
- [ ] Order cancellation with reason
- [ ] Razorpay payment integration (initiate + webhook for confirmation)

### Week 6 — Matching Engine + Notifications

- [ ] Store Matching Engine
  - Input: order items + customer lat/lng
  - Query stores in radius sorted by distance
  - Score each store by item availability %
  - Select best match (score × proximity weight)
  - Auto-reassign if store rejects (3-min timeout via Redis TTL + queue)
- [ ] Driver Assignment Engine
  - Query available drivers within 2 km of store
  - Send request to nearest driver
  - 60-second acceptance window → auto-move to next driver
- [ ] Job queue (BullMQ + Redis) for:
  - Store timeout auto-reassignment
  - Driver timeout auto-reassignment
  - Scheduled reminders
- [ ] Firebase Cloud Messaging integration
  - Push notification service with templates per event
- [ ] Socket.io setup for real-time:
  - Driver location updates (emit every 5s when on a job)
  - Order status push to customer

---

## Phase 2 — Customer App (Week 5–10)

**Goal:** Fully functional customer-facing React Native app.

### Week 5–6 — Setup + Auth + Navigation

- [ ] Expo project init with TypeScript
- [ ] Navigation setup (React Navigation — tab + stack)
- [ ] OTP login screen + flow (integrated with Auth API)
- [ ] Token storage (SecureStore)
- [ ] Auto-login on app open if token valid
- [ ] Splash screen and onboarding slides

### Week 7 — Home, Browse, Search

- [ ] Home screen: category grid, featured/popular items
- [ ] Category browse screen with item list
- [ ] Item search (debounced API calls)
- [ ] Item detail screen (image, price, unit, add to cart)
- [ ] Cart management (add, remove, update qty) — local state + persistent storage

### Week 8 — Checkout + Order Placement

- [ ] Cart review screen
- [ ] Delivery address screen (Google Maps autocomplete + GPS detect)
- [ ] Save multiple addresses to profile
- [ ] Payment selection (COD / Razorpay online)
- [ ] Promo code entry + validation
- [ ] Order summary and confirm
- [ ] Order placement API call + loading/error states

### Week 9 — Order Tracking

- [ ] Order status screen (step indicator)
- [ ] Live map with driver marker (Socket.io updates)
- [ ] Estimated time display
- [ ] Push notification handling (foreground + background)
- [ ] Cancel order flow (within allowed window)

### Week 10 — Profile + History + Polish

- [ ] User profile screen (edit name, phone)
- [ ] Saved addresses management
- [ ] Order history list + detail
- [ ] Reorder from history
- [ ] Rate store and driver (post-delivery)
- [ ] App-wide error handling and empty states
- [ ] Loading skeletons and animations

---

## Phase 3 — Store Owner Portal (Week 7–11)

**Goal:** Store owners can manage inventory and fulfill orders.

### Week 7–8 — Setup + Onboarding + Inventory

- [ ] React Native (or React Web) project init
- [ ] Store registration form (name, address, category, docs upload)
- [ ] Login (OTP) + pending approval screen
- [ ] Dashboard: today's orders count, earnings, open orders
- [ ] Inventory list screen (paginated)
- [ ] Add / Edit item form (name, category, price, unit, image, stock)
- [ ] Toggle item in/out of stock (one-tap)
- [ ] CSV bulk upload for inventory

### Week 9–10 — Order Management

- [ ] Incoming order push notification + in-app alert
- [ ] Order detail screen: items list, customer address, total
- [ ] Accept / Reject order flow (3-min countdown)
- [ ] Mark order as "Ready for Pickup"
- [ ] Active orders list + history

### Week 11 — Earnings + Polish

- [ ] Earnings screen: per-order breakdown, daily/weekly/monthly totals
- [ ] Operating hours settings
- [ ] Store profile edit (address, photos)
- [ ] Notification preferences
- [ ] Offline handling (queue accept/reject until reconnected)

---

## Phase 4 — Driver App (Week 9–13)

**Goal:** Drivers can receive, pick up, and complete deliveries.

### Week 9–10 — Setup + Onboarding + Availability

- [ ] React Native project init (shared Expo setup)
- [ ] Driver registration form (name, vehicle, license, ID upload)
- [ ] Login (OTP) + pending approval screen
- [ ] Online / Offline toggle on dashboard
- [ ] Background location tracking when online (expo-location)
- [ ] Emit location to backend via Socket.io every 5 seconds on active job

### Week 11–12 — Order Assignment + Delivery Flow

- [ ] Incoming order request notification (sound + vibration)
- [ ] Request card: pickup address, delivery address, distance, estimated earnings
- [ ] Accept / Reject (60-second countdown)
- [ ] Pickup screen: store address, Google Maps deep-link navigation
- [ ] Confirm pickup (photo capture or OTP from store)
- [ ] Delivery screen: customer address, Google Maps deep-link navigation
- [ ] Confirm delivery (photo capture or OTP from customer)
- [ ] Auto-update order status on each action

### Week 13 — Earnings + Polish

- [ ] Earnings per delivery + daily summary
- [ ] Weekly payout history
- [ ] Ratings received from customers
- [ ] Delivery history list
- [ ] Help / support contact

---

## Phase 5 — Admin Dashboard (Week 11–14)

**Goal:** Internal tool to manage the entire platform.

### Week 11–12 — Core Management

- [ ] Next.js web app init
- [ ] Admin login (email + password, 2FA optional)
- [ ] User management: list, search, suspend/unsuspend customers
- [ ] Store management: pending approvals, approve/reject, suspend
- [ ] Driver management: pending approvals, approve/reject, suspend

### Week 13–14 — Operations + Analytics

- [ ] Order management: all orders, filter by status/date, view detail
- [ ] Dispute resolution: flag orders, add notes, issue refunds
- [ ] Promo code creation (flat or %, expiry, usage limits)
- [ ] Zone configuration: delivery radius per city/area
- [ ] Commission & delivery fee settings
- [ ] Analytics dashboard:
  - Orders per day (chart)
  - GMV (Gross Merchandise Value)
  - Active drivers count
  - Top stores by volume
  - Customer retention metrics

---

## Phase 6 — Integration & QA (Week 14–16)

**Goal:** All components work together. No critical bugs before beta.

### Week 14 — End-to-End Integration

- [ ] Full order flow test: Customer → Store → Driver → Delivered
- [ ] Real-time tracking verified across devices
- [ ] Payment flow: online payment + COD
- [ ] Push notifications verified on Android + iOS
- [ ] Store matching edge cases:
  - No store found → customer notified
  - Store rejects → auto-reassign verified
  - No driver → customer notified
- [ ] All timeouts and auto-reassignment jobs verified

### Week 15 — QA & Bug Fixes

- [ ] Internal QA on physical Android + iOS devices
- [ ] Performance testing: app load time, API response times
- [ ] Network edge cases: slow connection, offline, reconnection
- [ ] Security audit:
  - Auth token expiry and refresh
  - API route protection by role
  - Input validation / SQL injection checks
  - Sensitive data not logged
- [ ] Fix all critical and high priority bugs

### Week 16 — Pre-launch Checklist

- [ ] App icons, splash screens finalized
- [ ] Play Store + App Store developer accounts set up
- [ ] Privacy policy and Terms of Service pages
- [ ] Production environment provisioned and load tested
- [ ] Database backups and monitoring alerts set up (Sentry, Datadog or similar)
- [ ] Rollback plan documented

---

## Phase 7 — Beta Launch (Week 17–18)

**Goal:** Controlled launch with real users in a single city/zone.

### Week 17 — Soft Launch

- [ ] Onboard 10–20 pilot stores manually
- [ ] Onboard 5–10 pilot drivers
- [ ] Invite 50–100 beta customers (friends, family, community)
- [ ] Monitor all orders in real-time via admin dashboard
- [ ] Collect feedback via simple form or WhatsApp group

### Week 18 — Iteration

- [ ] Daily bug triage from beta feedback
- [ ] Fix top 10 most reported issues
- [ ] App Store / Play Store submission (for review approval)
- [ ] Prepare customer acquisition plan for public launch

---

## Phase 8 — Stabilization & Scale (Week 19–20)

**Goal:** Production-ready for public launch.

- [ ] Address all beta feedback
- [ ] Performance optimization (query indexing, caching hot paths)
- [ ] Public launch in target city
- [ ] Monitor error rates, latency, driver assignment success rate
- [ ] Set KPIs for Month 1: orders/day, avg delivery time, store acceptance rate
- [ ] Plan Phase 2 features based on real user data

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

---

_Roadmap is subject to revision based on team size, scope changes, and beta feedback._
