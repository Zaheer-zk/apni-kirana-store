# Business Requirements Document (BRD)

## Apni Kirana Store — Hyperlocal Delivery App

**Version:** 1.0  
**Date:** 2026-05-06  
**Status:** Draft

---

## 1. Executive Summary

Apni Kirana Store is a mobile hybrid application that connects users with nearby local stores (general stores, pharmacies, grocery shops) for on-demand delivery. The platform handles item discovery, smart store matching, and driver dispatch — end-to-end within a user's local area.

---

## 2. Problem Statement

- Customers have to physically visit multiple stores to find what they need.
- Local small stores lack digital presence and lose business to large e-commerce platforms.
- No efficient, affordable hyperlocal delivery option exists for daily essentials and medicines.

---

## 3. Business Objectives

| #   | Objective                                                                       |
| --- | ------------------------------------------------------------------------------- |
| 1   | Enable users to order daily essentials and medicines from their nearest stores. |
| 2   | Onboard local stores (kirana, pharmacy) as merchant partners.                   |
| 3   | Build a driver network for last-mile delivery.                                  |
| 4   | Generate revenue through delivery fees and merchant commissions.                |
| 5   | Reduce order fulfillment time to under 45 minutes.                              |

---

## 4. Stakeholders

| Role                   | Responsibility                           |
| ---------------------- | ---------------------------------------- |
| Customer               | Places orders, tracks delivery           |
| Store Owner (Merchant) | Lists inventory, accepts/rejects orders  |
| Delivery Driver        | Picks up and delivers orders             |
| Platform Admin         | Manages users, stores, drivers, disputes |

---

## 5. User Personas

### 5.1 Customer

- Age: 18–60
- Needs: Quick delivery of groceries, medicines, household items
- Pain point: No time to visit stores; uncertain stock availability

### 5.2 Store Owner

- Small kirana or pharmacy owner
- Needs: More orders, simple inventory management
- Pain point: No online presence, losing customers to big apps

### 5.3 Delivery Driver

- Age: 20–40, owns a bike/scooter
- Needs: Flexible earning, nearby pickup jobs
- Pain point: Irregular income, no platform to find gigs

---

## 6. Scope

### 6.1 In Scope

- Customer mobile app (Android + iOS via hybrid framework)
- Store owner mobile/web portal
- Driver mobile app
- Admin web dashboard
- Real-time order tracking
- Location-based store discovery
- Push notifications

### 6.2 Out of Scope (Phase 1)

- Subscription/membership plans
- In-app chat support
- Scheduled delivery (future phase)
- B2B ordering
- Payment gateway integration beyond basic (COD + one gateway)

---

## 7. Functional Requirements

### 7.1 Customer App

#### Authentication

- [ ] Register/Login via mobile number (OTP)
- [ ] Social login (Google) — optional Phase 2
- [ ] Profile management (name, address, saved locations)

#### Item Discovery

- [ ] Browse items by category: Grocery, Medicine, Household, Snacks, Beverages
- [ ] Search items by name or barcode scan
- [ ] View item details (name, image, price, unit)
- [ ] Add items to cart (from multiple categories)

#### Order Placement

- [ ] Review cart and confirm order
- [ ] Set delivery address (GPS auto-detect or manual)
- [ ] Choose payment method (Cash on Delivery / Online)
- [ ] Apply promo/discount code
- [ ] Place order — triggers store matching flow

#### Store Matching (Background Logic)

- [ ] System finds all stores within configurable radius (default: 3 km)
- [ ] Checks each store's inventory for ordered items
- [ ] Assigns order to nearest store with highest item availability
- [ ] If no single store has all items — either split order or notify customer

#### Order Tracking

- [ ] Real-time status: Order Placed → Store Accepted → Driver Assigned → Picked Up → Delivered
- [ ] Live map with driver location
- [ ] Estimated delivery time display
- [ ] Push notification on each status change

#### Post-Delivery

- [ ] Rate store and driver (1–5 stars)
- [ ] Order history
- [ ] Reorder previous orders

---

### 7.2 Store Owner App / Portal

#### Onboarding

- [ ] Register store (name, address, category, license/ID upload)
- [ ] Admin approval before going live

#### Inventory Management

- [ ] Add/edit/delete items (name, price, unit, stock quantity, image)
- [ ] Mark items as out of stock instantly
- [ ] Bulk upload via CSV

#### Order Management

- [ ] Receive incoming order notification
- [ ] Accept or reject order (with reason) within 3 minutes — else auto-cancel
- [ ] Mark order as ready for pickup

#### Earnings

- [ ] View daily/weekly/monthly earnings
- [ ] Payout history

---

### 7.3 Driver App

#### Onboarding

- [ ] Register (name, vehicle details, license, ID upload)
- [ ] Admin approval before going live

#### Order Assignment

- [ ] Receive nearby pickup request notification
- [ ] Accept or reject (auto-reassign if rejected)
- [ ] View pickup store location and delivery address

#### Delivery Workflow

- [ ] Navigate to store (in-app maps integration)
- [ ] Confirm item pickup with OTP or photo
- [ ] Navigate to customer
- [ ] Confirm delivery (OTP or photo)

#### Earnings

- [ ] Per-delivery earnings summary
- [ ] Weekly payout summary

---

### 7.4 Admin Dashboard (Web)

- [ ] User management (customers, stores, drivers)
- [ ] Store approval / suspension
- [ ] Driver approval / suspension
- [ ] Order overview and dispute resolution
- [ ] Promo/discount code management
- [ ] Delivery zone and radius configuration
- [ ] Commission and delivery fee settings
- [ ] Analytics: orders per day, GMV, active drivers, top stores

---

## 8. Non-Functional Requirements

| Category      | Requirement                                                |
| ------------- | ---------------------------------------------------------- |
| Performance   | App loads within 3 seconds on 4G                           |
| Availability  | 99.5% uptime                                               |
| Scalability   | Support up to 10,000 concurrent users initially            |
| Security      | OTP auth, encrypted payments, HTTPS only                   |
| Offline       | Cart accessible offline; order placement requires internet |
| Location      | GPS accuracy within 50 meters                              |
| Notifications | Push notifications delivered within 5 seconds of trigger   |

---

## 9. User Flows

### 9.1 Happy Path — Customer Order

```
Open App → Browse/Search Item → Add to Cart
→ Checkout → Set Address → Choose Payment
→ Place Order → [System finds nearest store with stock]
→ Store Accepts → Driver Assigned
→ Driver Picks Up → Real-time Tracking
→ Delivered → Rate & Review
```

### 9.2 Store Matching Logic

```
Order Placed
  → Query stores within radius sorted by distance
  → Check inventory API for each store
  → Select store with most items available (greedy match)
  → If item match < 80% → notify customer of partial availability
  → Store receives order → accepts/rejects (3-min window)
  → If rejected → reassign to next best store
```

### 9.3 Driver Assignment

```
Store Accepts Order
  → Query available drivers within 2 km of store
  → Send request to nearest driver
  → If no response in 60 sec → send to next driver
  → Driver accepts → assigned to order
```

---

## 10. High-Level Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Customer App   │     │  Store App      │     │   Driver App    │
│  (Hybrid)       │     │  (Hybrid/Web)   │     │  (Hybrid)       │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                        │
         └───────────────────────┼────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │       API Gateway       │
                    └────────────┬────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
 ┌────────▼────────┐  ┌──────────▼──────┐  ┌──────────▼──────┐
 │  Auth Service   │  │  Order Service  │  │ Matching Engine │
 └─────────────────┘  └─────────────────┘  └─────────────────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │       Database          │
                    │  (Users, Orders,        │
                    │   Inventory, Locations) │
                    └─────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Real-time Layer       │
                    │   (WebSockets / FCM)    │
                    └─────────────────────────┘
```

---

## 11. Technology Considerations

| Layer              | Suggested Option               | Notes                                      |
| ------------------ | ------------------------------ | ------------------------------------------ |
| Mobile App         | React Native                   | Hybrid — single codebase for iOS + Android |
| Backend            | Node.js (Express)              | REST APIs                                  |
| Database           | PostgreSQL + Redis             | Relational + cache/session                 |
| Real-time          | Socket.io                      | Driver location tracking                   |
| Maps               | Google Maps API                | Navigation and geocoding                   |
| Push Notifications | Firebase Cloud Messaging (FCM) | All platforms                              |
| Storage            | Cloudinary                     | Item/store images                          |
| Payment            | Razorpay - for now COD         | Online payments                            |

---

## 12. Revenue Model

| Stream            | Description                                            |
| ----------------- | ------------------------------------------------------ |
| Delivery Fee      | Charged to customer per order (flat or distance-based) |
| Commission        | % of order value charged to store (e.g., 8–15%)        |
| Surge Pricing     | Higher delivery fee during peak hours                  |
| Featured Listings | Stores pay to appear higher in search (Phase 2)        |

---

## 13. Assumptions

1. All stores have a smartphone and stable internet.
2. Drivers have smartphones with GPS enabled at all times while active.
3. Initial launch in a single city / defined geographic zone.
4. Inventory is managed by stores themselves (no central warehouse).
5. Delivery radius and zones are configurable by admin.

---

## 14. Risks & Mitigations

| Risk                          | Mitigation                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------ |
| Store rejects or delays order | Auto-reassign to next store after 3-min timeout                                |
| No driver available           | Notify customer; option to wait or cancel                                      |
| Inaccurate store inventory    | Real-time stock update obligation for store owners; penalty for false listings |
| Low driver supply at launch   | Incentive bonuses for early driver signups                                     |
| GPS inaccuracy in dense areas | Allow manual address pin drop on map                                           |

---

## 15. Milestones (Suggested)

| Phase   | Deliverable                       | Timeline   |
| ------- | --------------------------------- | ---------- |
| Phase 0 | BRD finalized, tech stack decided | Week 1–2   |
| Phase 1 | Customer app + Store portal (MVP) | Week 3–10  |
| Phase 2 | Driver app + Real-time tracking   | Week 8–14  |
| Phase 3 | Admin dashboard                   | Week 12–16 |
| Phase 4 | Beta launch (single city)         | Week 17–18 |
| Phase 5 | Feedback, bug fixes, scale        | Week 19+   |

---

## 16. Open Questions

1. Will stores self-onboard or require manual onboarding by the team?

- will use team for now.

2. What is the target city/region for launch?

- for now single. - khandela, sikar, Rajasthan

3. Is driver employment model gig-based or salaried?

- gig based

4. Should the app support multiple languages (Urdu, Hindi, English)?

- Hindi , english

5. What is the maximum acceptable order-to-delivery time SLA?

- 10- 15 min based on the distance and the order item.

6. Will there be a minimum order value?

- no

7. Should medicine orders require a prescription upload?

- yes
