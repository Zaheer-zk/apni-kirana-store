import {
  DriverStatus,
  ItemCategory,
  OrderStatus,
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
