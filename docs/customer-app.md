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
| Store Detail | `/store/[id]` | Catalog, hours, ratings |
| Item Detail | `/item/[id]` | Image, description, +/- to cart |
| Cart | `/(tabs)/cart` | Per-store grouping, totals |
| Checkout | `/checkout` | Address, payment method, place order |
| Orders | `/(tabs)/orders` | Active + history |
| Order Tracking | `/order/[id]` | Live map + status timeline |
| Profile | `/(tabs)/profile` | Addresses, FCM permission, logout |

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
