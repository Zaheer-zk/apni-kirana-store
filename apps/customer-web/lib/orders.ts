/**
 * Order types + API helpers for customer-web.
 *
 * Endpoints used (backend/src/routes/orders.routes.ts):
 *   GET  /api/v1/orders            — list (auto-scoped to caller's role)
 *   GET  /api/v1/orders/:id        — detail
 *   POST /api/v1/orders            — create (CUSTOMER role)
 *   PUT  /api/v1/orders/:id/cancel — cancel (CUSTOMER, PENDING|STORE_ACCEPTED)
 */
import { api, unwrap } from './api';
import type { OrderStatus, PaymentMethod, PaymentStatus, OrderType } from '@aks/shared';

export interface OrderItemRow {
  id?: string;
  itemId: string;
  name: string;
  price: number;
  unit: string;
  qty: number;
  imageUrl?: string | null;
}

export interface AddressEmbed {
  id: string;
  label: string;
  street: string;
  city: string;
  state: string;
  pincode: string;
  lat: number;
  lng: number;
}

export interface DriverEmbed {
  id: string;
  vehicleType?: string;
  vehicleNumber?: string;
  currentLat?: number | null;
  currentLng?: number | null;
  rating?: number;
  user?: { name?: string | null; phone?: string | null } | null;
}

export interface StoreEmbed {
  id: string;
  name: string;
  lat?: number | null;
  lng?: number | null;
  /** RESTAURANT triggers the extra 'Cooking' milestone on the tracking timeline. */
  category?: 'GROCERY' | 'PHARMACY' | 'GENERAL' | 'RESTAURANT' | null;
}

export interface CustomerOrder {
  id: string;
  customerId: string;
  storeId: string;
  driverId: string | null;
  orderType: OrderType;
  status: OrderStatus;
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  notes?: string | null;
  promoCode?: string | null;
  promoDiscount?: number | null;
  dropoffOtp?: string | null;
  cancelReason?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
  storeAcceptedAt?: string | null;
  deliveredAt?: string | null;

  items: OrderItemRow[];
  store?: StoreEmbed | null;
  driver?: DriverEmbed | null;
  deliveryAddress?: AddressEmbed | null;
}

export interface OrdersPage {
  orders: CustomerOrder[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export async function fetchOrdersPage(page: number, limit = 20): Promise<OrdersPage> {
  const res = await api.get('/api/v1/orders', { params: { page, limit } });
  const data = unwrap<{
    orders: CustomerOrder[];
    total?: number;
    page?: number;
    pages?: number;
    limit?: number;
  }>(res.data);
  return {
    orders: data.orders ?? [],
    total: data.total ?? data.orders?.length ?? 0,
    page: data.page ?? page,
    pages: data.pages ?? page,
    limit: data.limit ?? limit,
  };
}

export async function fetchOrder(id: string): Promise<CustomerOrder> {
  const res = await api.get(`/api/v1/orders/${id}`);
  return unwrap<CustomerOrder>(res.data);
}

export interface CreateOrderInput {
  storeId?: string;
  items: Array<{ storeItemId?: string; catalogItemId?: string; qty: number }>;
  /** Pick one: existing saved address (self / known recipient) … */
  deliveryAddressId?: string;
  /** … or inline address for "order for someone else" — backend creates
   *  a one-off Address row owned by the buyer (non-default). */
  recipientAddress?: {
    label: string;
    street: string;
    city: string;
    state: string;
    pincode: string;
    lat: number;
    lng: number;
  };
  paymentMethod: PaymentMethod;
  notes?: string;
  promoCode?: string;
  /** 'Order for someone else' — driver/store call this at dropoff if set. */
  recipientName?: string;
  recipientPhone?: string;
}

export async function createOrder(input: CreateOrderInput): Promise<CustomerOrder> {
  const res = await api.post('/api/v1/orders', input);
  return unwrap<CustomerOrder>(res.data);
}

export async function cancelOrder(id: string, reason: string): Promise<CustomerOrder> {
  const res = await api.put(`/api/v1/orders/${id}/cancel`, { reason });
  return unwrap<CustomerOrder>(res.data);
}

const ACTIVE: OrderStatus[] = [
  'PENDING',
  'STORE_ACCEPTED',
  'DRIVER_ASSIGNED',
  'PICKED_UP',
] as unknown as OrderStatus[];

const TERMINAL_BAD: OrderStatus[] = ['CANCELLED', 'REJECTED'] as unknown as OrderStatus[];

export function isActiveOrder(o: { status: OrderStatus | string }): boolean {
  return ACTIVE.includes(o.status as OrderStatus);
}

export function isCancelledOrRejected(o: { status: OrderStatus | string }): boolean {
  return TERMINAL_BAD.includes(o.status as OrderStatus);
}
