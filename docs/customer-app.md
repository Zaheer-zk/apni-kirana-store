# Customer App

The Expo React Native app shoppers use to browse local stores, place orders, and track deliveries.

## User journey

```
Open app -> Login (OTP) -> Allow location -> Home (nearby stores)
   -> Tap store -> Browse items -> Add to cart -> Checkout
   -> Pick address & payment -> Place order
   -> Track order live (store accepting -> packing -> driver assigned -> en route -> delivered)
   -> Rate
```

## Screens

| Screen | Path | Notes |
| --- | --- | --- |
| Splash | `/` | Bootstraps auth + location |
| Login | `/login` | Phone + OTP |
| OTP Verify | `/login/verify` | 6-digit input, resend timer |
| Home | `/(tabs)/home` | Nearby stores, categories, search bar |
| Search | `/search` | Cross-store item search |
| Catalog Browse | `/(tabs)/catalog` | Browse the master catalog by category/search |
| Catalog Item Detail | `/catalog/[id]` | Product page; lists "Available at N stores nearby" sorted by price/distance |
| Store Detail | `/store/[id]` | Inventory, hours, ratings |
| Item Detail | `/item/[id]` | Per-store item page: image, description, +/- to cart |
| Cart | `/(tabs)/cart` | Per-store grouping, totals |
| Checkout | `/checkout` | Address, payment method, place order |
| Orders | `/(tabs)/orders` | Active + history |
| Order Tracking | `/order/[id]` | Live map + status timeline |
| Profile | `/(tabs)/profile` | Addresses, FCM permission, logout |

## Browse modes — store-direct vs catalog

The customer app supports two ways to find what you want:

| Mode | How | What happens at checkout |
| --- | --- | --- |
| **Browse by store** | Tap a nearby store from Home → browse its inventory (`GET /stores/:id/items`). Cart items are `StoreItem.id`s. | `POST /orders` body uses `items: [{ storeItemId, qty }]`. Order goes to that specific store. |
| **Browse by catalog** | Open the Catalog tab → browse the master product list (`GET /catalog?...`). Tap a product → `Catalog Item Detail` shows every nearby store carrying it (`GET /catalog/:id?lat=&lng=&radius=`), sorted by distance + price. The customer picks a store **or** lets the system pick. | If the customer chose a specific store, `POST /orders` uses `items: [{ storeItemId, qty }]`. If they didn't (cart filled from the catalog without choosing), the body uses `items: [{ catalogItemId, qty }]` and the matching engine picks the **best store carrying the most of the items** (majority-first). |

Both modes feed the same checkout. The cart UI shows whichever path the
customer used and warns before mixing modes.

## Order tracking & dropoff OTP

The Order Tracking screen subscribes to the order's socket room and renders the
status timeline. Once the order reaches `PICKED_UP`, a prominent card appears
at the top:

```
Driver is on the way

Show this code at handoff:
   ┌─────────┐
   │  3 4 7 1 │
   └─────────┘
```

The 4-digit `dropoffOtp` is fetched from `GET /orders/:id` (only customers,
store owners, and admins see it; drivers never see it server-side). The
customer reads it aloud to the driver who types it into their app to confirm
delivery. See `docs/privacy.md`.

## State management — Zustand

| Store | Persisted | Holds |
| --- | --- | --- |
| `useAuthStore` | Yes (SecureStore) | `accessToken`, `refreshToken`, `user`, `setSession`, `logout` |
| `useCartStore` | Yes (AsyncStorage) | per-store carts, `addItem`, `removeItem`, `clearStore`, `total` |
| `useLocationStore` | No | current `lat`/`lng`, permission state |

Carts are isolated per store — moving from one store to another doesn't merge baskets (the user is prompted before switching).

## API integration — React Query

All HTTP calls go through a typed `api` client built on `axios`:

- Base URL from `EXPO_PUBLIC_API_URL`.
- Bearer token auto-injected from `useAuthStore`.
- 401 interceptor calls `/auth/refresh`, swaps tokens in the store, and retries the request once.
- 5xx responses surface a toast.

Common queries:

```ts
useNearbyStores({ lat, lng, category })   // GET /stores/nearby
useStoreItems(storeId)                    // GET /stores/:id/items
useMyOrders()                             // GET /orders
useOrder(orderId)                         // GET /orders/:id  (also subscribes to socket room)
```

Mutations: `useSendOtp`, `useVerifyOtp`, `usePlaceOrder`, `useRateOrder`.

## Realtime — Socket.io

A single socket connection is established post-login in `lib/socket.ts`. On `order` screens, the component subscribes via `socket.emit('order:subscribe', { orderId })` and listens for:

- `order:status` — updates the timeline.
- `driver:location` — updates the marker on the map.

Disconnect is handled by the socket lib's auto-reconnect with exponential backoff. On reconnect, the active order subscription is replayed.

## Location permissions

- On first launch, request `Location.requestForegroundPermissionsAsync()`.
- If denied, show a banner explaining why nearby stores can't load and offer a "Use city center" fallback.
- Re-request on the home screen when the user taps "Find stores near me".

Background location is **not** required for the customer app — it only uses foreground GPS at home/checkout.

## Push notifications

On login, request notification permissions, fetch the FCM token via `@react-native-firebase/messaging`, and PUT it to `/notifications/fcm-token`. Re-register on token refresh.

## Environment variables

| Var | Example | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | `http://192.168.1.42:3001` | Backend base URL |
| `EXPO_PUBLIC_GOOGLE_MAPS_KEY` | `AIza...` | Maps SDK |
| `EXPO_PUBLIC_RAZORPAY_KEY_ID` | `rzp_test_...` | Payment SDK |

Set these inline (`EXPO_PUBLIC_API_URL=... npx expo start --lan`) or in an `.env` file at the app root.
