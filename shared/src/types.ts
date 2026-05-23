import {
  DriverStatus,
  ItemCategory,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  StoreStatus,
  UserRole,
} from './enums';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Address {
  id: string;
  userId: string;
  label: string;
  street: string;
  city: string;
  state: string;
  pincode: string;
  lat: number;
  lng: number;
  isDefault: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  createdAt: string;
}

export interface OperatingHours {
  open: string;
  close: string;
}

export interface StoreProfile {
  id: string;
  name: string;
  ownerId: string;
  address: string;
  lat: number;
  lng: number;
  category: ItemCategory;
  status: StoreStatus;
  isWholesaler?: boolean;
  operatingHours: OperatingHours;
  rating: number;
}

export interface InventoryItem {
  id: string;
  storeId: string;
  name: string;
  category: ItemCategory;
  price: number;
  unit: string;
  stockQty: number;
  imageUrl: string;
  isAvailable: boolean;
}

export interface CartItem {
  itemId: string;
  name: string;
  price: number;
  unit: string;
  qty: number;
  imageUrl: string;
}

export interface OrderItem {
  itemId: string;
  name: string;
  price: number;
  unit: string;
  qty: number;
}

export interface Order {
  id: string;
  customerId: string;
  storeId: string;
  driverId: string | null;
  orderType: OrderType;
  buyerStoreId: string | null;
  items: OrderItem[];
  status: OrderStatus;
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  deliveryAddress: Address;
  createdAt: string;
  updatedAt: string;
}

export interface DriverProfile {
  id: string;
  name: string;
  phone: string;
  vehicleType: string;
  vehicleNumber: string;
  status: DriverStatus;
  rating: number;
  currentLocation: LatLng | null;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  data: Record<string, string>;
  isRead: boolean;
  createdAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// ─── Driver-side projections ─────────────────────────────────────────────
// These describe the shape the driver mobile + web apps consume from the
// `GET /api/v1/drivers/*` endpoints. They're separate from `DriverProfile`
// (which is the canonical driver entity) because the dashboards include
// derived fields (`hoursOnline`, `earnings`, `payoutStatus`) that the bare
// entity doesn't carry.

/**
 * Snapshot of today's deliveries + earnings for the driver dashboard.
 * Returned by `GET /api/v1/drivers/stats/today`.
 */
export interface DailyDriverStats {
  /** Number of orders delivered today by this driver. */
  deliveriesCount: number;
  /** Earnings in rupees credited today (delivery fees on DELIVERED orders). */
  earnings: number;
  /** Hours the driver has been online today (may be omitted on early builds). */
  hoursOnline?: number;
  /** Rolling driver rating (0-5). */
  rating?: number;
  /** Number of ratings the driver has received. */
  totalRatings?: number;
  /** Current driver status — useful for routing after login. */
  status?: string;
}

/**
 * One row in the driver's delivery history list
 * (`GET /api/v1/drivers/deliveries`).
 */
export interface DriverDelivery {
  /** Order id this delivery is associated with. */
  orderId: string;
  /** Order status at last refresh. */
  status: string;
  /** Pickup area string — "{store name}, {city}" or similar. */
  pickupArea: string;
  /** Delivery area string — area + city only (privacy: no street). */
  deliveryArea: string;
  /** Earnings credited to the driver for this delivery (rupees). */
  driverEarnings: number;
  /** ISO timestamp when the order was created. */
  createdAt: string;
}

/**
 * Aggregated earnings summary for the driver earnings screen
 * (`GET /api/v1/drivers/earnings/summary`).
 */
export interface DriverEarningsSummary {
  today: number;
  week: number;
  month: number;
  /** Cumulative lifetime earnings in rupees. */
  total?: number;
  /** Amount currently pending payout. */
  pendingPayout?: number;
  /** PENDING | PROCESSING | PAID. */
  payoutStatus?: string;
}

/**
 * One row in the driver per-delivery earnings breakdown
 * (`GET /api/v1/drivers/earnings/breakdown?period=`).
 */
export interface DriverEarningsEntry {
  orderId: string;
  driverEarnings: number;
  /** ISO timestamp when the order was DELIVERED. */
  completedAt: string;
}

// ─── Store-side projections ──────────────────────────────────────────────
// Shapes the store-portal (Expo) and store-web (Next.js) surfaces consume
// from `GET /api/v1/stores/*`. Kept here so both apps stay in lock-step with
// the backend response shape.

/** Single line item embedded inside a store order. */
export interface StoreOrderLineItem {
  itemId: string;
  name: string;
  price: number;
  unit: string;
  quantity: number;
}

/**
 * Slim Order shape used by store-side list screens (dashboard active orders
 * + orders tabs). Includes only what those views render; the full
 * {@link OrderDetail} is fetched on demand.
 */
export interface StoreOrder {
  id: string;
  status: OrderStatus;
  itemsCount: number;
  subtotal?: number;
  deliveryFee?: number;
  total: number;
  /** "{city}, {pincode}" or address label — already privacy-redacted. */
  deliveryArea: string;
  deliveryPincode?: string;
  createdAt: string;
}

/**
 * Today's snapshot used by the store dashboard
 * (`GET /api/v1/stores/stats/today`).
 */
export interface StoreDashboardStats {
  ordersReceived: number;
  ordersCompleted: number;
  /** Today's revenue in rupees (sum of subtotal on DELIVERED orders). */
  revenue: number;
  /** Orders awaiting acceptance — drives the "pending" pill on the dashboard. */
  pending: number;
}

/**
 * One row in the order timeline rendered on the order detail screen
 * (privacy-safe — drivers see a redacted variant).
 */
export interface OrderStatusEvent {
  status: OrderStatus | 'STORE_REJECTED';
  timestamp?: string | null;
  /** True for the row representing the order's current status. */
  isCurrent?: boolean;
}

/**
 * Full order detail returned by `GET /api/v1/orders/:id`. Customer / driver
 * surfaces may receive a redacted subset (`customer = null`, address coords
 * only), so nullable fields are typed as such.
 */
export interface OrderDetail {
  id: string;
  status: OrderStatus | 'STORE_REJECTED';
  items: StoreOrderLineItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  deliveryArea: string;
  deliveryPincode: string;
  customer?: { id: string; name: string; phone: string } | null;
  driver?: { id: string; user?: { name: string; phone: string } | null } | null;
  store?: { id: string; name: string; lat: number; lng: number } | null;
  createdAt: string;
  statusTimeline?: OrderStatusEvent[];
}

/**
 * Flat inventory row returned by `GET /api/v1/stores/me/items` and
 * `GET /api/v1/stores/:id/items`. The catalogItem join is already flattened
 * into name/category/unit/imageUrl for easy consumption.
 */
export interface StoreInventoryItem {
  id: string;
  storeId: string;
  catalogItemId: string;
  name: string;
  description?: string | null;
  category: string;
  unit: string;
  imageUrl?: string | null;
  price: number;
  stockQty: number;
  isAvailable: boolean;
}

/**
 * One catalog row returned by `GET /api/v1/catalog` and
 * `GET /api/v1/catalog/search/q`. `_count.storeItems` lets store-web show
 * "carried by N stores" hints when browsing the master catalog.
 */
export interface CatalogItemRow {
  id: string;
  name: string;
  category: string;
  unit: string;
  imageUrl?: string | null;
  _count?: { storeItems?: number };
}
