# Development Roadmap

## Apni Kirana Store — Hyperlocal Delivery App

**Version:** 1.0  
**Date:** 2026-05-06  
**Total Estimated Duration:** ~20 Weeks

---

## 📊 Current Status

| Metric | Count |
|--------|-------|
| ✅ Completed | **90** items |
| 🔲 Remaining | **58** items |
| **Overall** | **~61% complete** |

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0 — Foundation & Design | ✅ Done | Stack locked, monorepo + Docker, design system in code |
| Phase 1 — Backend Core | ✅ Done | All 7 routers, matching engine, BullMQ, Socket.io, FCM (stub) |
| Phase 2 — Customer App | ✅ Done | All 11 screens redesigned, SDK 54, full flow working |
| Phase 3 — Store Portal | ✅ Done | All screens scaffolded, integrated with backend |
| Phase 4 — Driver App | ✅ Done | All screens, online toggle, GPS tracking lib |
| Phase 5 — Admin Dashboard | ✅ Done | Phone OTP login, all CRUD + analytics |
| Phase 6 — Integration & QA | 🟡 Partial | Backend + frontend tests written; manual QA pending |
| Phase 7 — Beta Launch | 🔲 Pending | Pilot stores/drivers/customers not yet onboarded |
| Phase 8 — Scale | 🔲 Pending | Awaits beta feedback |

**Remaining work:** Twilio production integration, Razorpay live keys, Cloudinary uploads, FCM real device tokens, CI/CD, app store submissions, beta launch.

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
- [x] Lock tech stack
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
- [x] Set up Git monorepo structure
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
- [x] Set up local Docker Compose stack (production VPS deploy guide in docs/deployment.md)
- [ ] Set up CI/CD pipeline (GitHub Actions)
- [ ] Set up environments: `dev`, `staging`, `production`

### Week 2 — Design System & UI/UX

- [x] Define brand identity (colors, typography, logo)
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
- [x] Create shared design system (constants/theme.ts + 8 reusable components)
- [ ] Get design sign-off before dev starts

---

## Phase 1 — Backend Core (Week 3–6)

**Goal:** Build all API services that power every app. Apps are built against these APIs.

### Week 3 — Project Setup + Auth Service

- [x] Initialize Node.js project (TypeScript, Express, Prisma ORM)
- [x] Set up PostgreSQL schema (initial migrations)
  - Users (customers, stores, drivers, admins)
  - Addresses
  - Sessions / tokens
- [x] Auth Service
  - OTP generation and verification (SMS via Twilio or local gateway)
  - JWT access + refresh token flow
  - Role-based auth middleware (`customer`, `store`, `driver`, `admin`)
- [x] Redis setup for OTP storage and session cache
- [ ] API documentation setup (Swagger / Postman collection)

### Week 4 — Store & Inventory Service

- [x] Store model: name, address, lat/lng, category, status, operating hours
- [x] Store registration and admin approval flow
- [x] Inventory model: item name, category, price, unit, stock quantity, image URL
- [x] Inventory CRUD APIs (for store owners)
- [ ] Bulk CSV import endpoint
- [x] Item search API (by name, category, keyword)
- [x] Geolocation: store lookup by radius (Haversine + bounding box)
- [ ] Cloudinary integration for image uploads

### Week 5 — Order Service

- [x] Order model: items, customer, store, driver, status, timestamps
- [x] Order placement API
  - Validate cart items
  - Calculate totals, delivery fee, commission
  - Trigger store matching engine
- [x] Order status state machine:
  ```
  PENDING → STORE_ACCEPTED → DRIVER_ASSIGNED
  → PICKED_UP → DELIVERED
  (or) → REJECTED → REASSIGNED / CANCELLED
  ```
- [x] Order history APIs (customer, store, driver views)
- [x] Order cancellation with reason
- [ ] Razorpay payment integration (initiate + webhook for confirmation)

### Week 6 — Matching Engine + Notifications

- [x] Store Matching Engine
  - Input: order items + customer lat/lng
  - Query stores in radius sorted by distance
  - Score each store by item availability %
  - Select best match (score × proximity weight)
  - Auto-reassign if store rejects (3-min timeout via Redis TTL + queue)
- [x] Driver Assignment Engine
  - Query available drivers within 2 km of store
  - Send request to nearest driver
  - 60-second acceptance window → auto-move to next driver
- [x] Job queue (BullMQ + Redis) for:
  - Store timeout auto-reassignment
  - Driver timeout auto-reassignment
  - Scheduled reminders
- [ ] Firebase Cloud Messaging integration
  - Push notification service with templates per event
- [x] Socket.io setup for real-time:
  - Driver location updates (emit every 5s when on a job)
  - Order status push to customer

---

## Phase 2 — Customer App (Week 5–10)

**Goal:** Fully functional customer-facing React Native app.

### Week 5–6 — Setup + Auth + Navigation

- [x] Expo project init with TypeScript (SDK 54)
- [x] Navigation setup (Expo Router v6 with tabs)
- [x] OTP login screen + flow (integrated with Auth API)
- [x] Token storage (SecureStore)
- [x] Auto-login on app open if token valid
- [x] Splash screen with brand badge

### Week 7 — Home, Browse, Search

- [x] Home screen: category grid, popular items, nearby stores
- [x] Category browse screen with item list
- [x] Item search (debounced 400ms)
- [x] Item detail screen with sticky add-to-cart bar
- [x] Cart management with Zustand store

### Week 8 — Checkout + Order Placement

- [x] Cart review screen
- [x] Delivery address selector
- [x] Save multiple addresses to profile
- [x] Payment selection UI (COD / Online radio buttons)
- [x] Promo code input UI
- [x] Order summary and confirm
- [x] Order placement API call + loading/error states

### Week 9 — Order Tracking

- [x] Order status screen (5-step indicator)
- [x] Live map with driver marker (Socket.io updates)
- [ ] Estimated time display
- [ ] Push notification handling (foreground + background)
- [x] Cancel order flow (within allowed window)

### Week 10 — Profile + History + Polish

- [x] User profile screen with avatar, stats
- [x] Saved addresses management
- [x] Order history list with Active/Past tabs
- [ ] Reorder from history
- [x] Rate store and driver (5-star UI)
- [x] App-wide error handling and EmptyState component
- [x] Loading skeletons (Skeleton component)

---

## Phase 3 — Store Owner Portal (Week 7–11)

**Goal:** Store owners can manage inventory and fulfill orders.

### Week 7–8 — Setup + Onboarding + Inventory

- [x] React Native project init (SDK 54)
- [x] Store registration form
- [x] Login (OTP) + pending approval screen
- [x] Dashboard: today's orders count, earnings, open orders
- [x] Inventory list screen
- [x] Add / Edit item form
- [x] Toggle item in/out of stock
- [ ] CSV bulk upload for inventory

### Week 9–10 — Order Management

- [x] Incoming order banner with 3-min countdown
- [x] Order detail screen with items + accept/reject
- [x] Accept / Reject order flow (3-min countdown)
- [x] Mark order as "Ready for Pickup"
- [x] Active orders list + history

### Week 11 — Earnings + Polish

- [x] Earnings screen with period filter
- [ ] Operating hours settings
- [ ] Store profile edit (address, photos)
- [ ] Notification preferences
- [ ] Offline handling (queue accept/reject until reconnected)

---

## Phase 4 — Driver App (Week 9–13)

**Goal:** Drivers can receive, pick up, and complete deliveries.

### Week 9–10 — Setup + Onboarding + Availability

- [x] React Native project init (SDK 54)
- [x] Driver registration form
- [x] Login (OTP) + pending approval screen
- [x] Online / Offline toggle (animated component)
- [x] Background location tracking lib
- [x] Emit location to backend via Socket.io

### Week 11–12 — Order Assignment + Delivery Flow

- [x] Incoming order modal with 60s countdown
- [x] Request card with addresses + earnings
- [x] Accept / Reject (60-second countdown)
- [x] Pickup screen with maps deep-link
- [x] Confirm pickup button
- [x] Delivery screen with maps deep-link
- [x] Confirm delivery button
- [x] Auto-update order status on each action

### Week 13 — Earnings + Polish

- [x] Earnings per delivery + daily summary
- [ ] Weekly payout history
- [ ] Ratings received from customers
- [x] Delivery history list
- [ ] Help / support contact

---

## Phase 5 — Admin Dashboard (Week 11–14)

**Goal:** Internal tool to manage the entire platform.

### Week 11–12 — Core Management

- [x] Next.js 15 web app init
- [x] Admin login (phone OTP, like other roles)
- [x] User management with search + suspend/unsuspend
- [x] Store management with status tabs (Pending/Active/Suspended)
- [x] Driver management with status tabs

### Week 13–14 — Operations + Analytics

- [x] Order management with status + date filters
- [ ] Dispute resolution: flag orders, add notes, issue refunds
- [ ] Promo code creation (flat or %, expiry, usage limits)
- [ ] Zone configuration: delivery radius per city/area
- [x] Commission & delivery fee settings page
- [x] Analytics dashboard with stat cards + charts
  - Orders per day (chart)
  - GMV (Gross Merchandise Value)
  - Active drivers count
  - Top stores by volume
  - Customer retention metrics

---

## Phase 6 — Integration & QA (Week 14–16)

**Goal:** All components work together. No critical bugs before beta.

### Week 14 — End-to-End Integration

- [x] Backend integration tests (Jest + Supertest, 8 test files)
- [x] Frontend smoke tests (53 test files across all 4 apps)
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
