export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  STORE_OWNER = 'STORE_OWNER',
  DRIVER = 'DRIVER',
  ADMIN = 'ADMIN',
}

export enum OrderStatus {
  PENDING = 'PENDING',
  STORE_ACCEPTED = 'STORE_ACCEPTED',
  DRIVER_ASSIGNED = 'DRIVER_ASSIGNED',
  PICKED_UP = 'PICKED_UP',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
}

export enum StoreStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

// CUSTOMER = hyperlocal order placed by a customer.
// RESTOCK  = B2B order a store owner places with a wholesaler to refill stock.
export enum OrderType {
  CUSTOMER = 'CUSTOMER',
  RESTOCK = 'RESTOCK',
}

export enum DriverStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  OFFLINE = 'OFFLINE',
  ONLINE = 'ONLINE',
}

export enum ItemCategory {
  GROCERY = 'GROCERY',
  MEDICINE = 'MEDICINE',
  HOUSEHOLD = 'HOUSEHOLD',
  SNACKS = 'SNACKS',
  BEVERAGES = 'BEVERAGES',
  ELECTRONICS = 'ELECTRONICS',
  OTHER = 'OTHER',
}

export enum PaymentMethod {
  CASH_ON_DELIVERY = 'CASH_ON_DELIVERY',
  ONLINE = 'ONLINE',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

// Mirrors the remaining Prisma enums in backend/prisma/schema.prisma so the
// apps can import them from @aks/shared instead of redeclaring them.
export enum StoreCategory {
  GROCERY = 'GROCERY',
  PHARMACY = 'PHARMACY',
  GENERAL = 'GENERAL',
  RESTAURANT = 'RESTAURANT',
}

export enum VehicleType {
  BIKE = 'BIKE',
  SCOOTER = 'SCOOTER',
  CAR = 'CAR',
}

export enum DiscountType {
  FLAT = 'FLAT',
  PERCENT = 'PERCENT',
}

export enum SupportThreadStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED',
}
