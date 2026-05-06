/**
 * Test data factories for the Apni Kirana Store backend.
 * All factories accept optional overrides and return persisted Prisma rows.
 */
import {
  ItemCategory,
  StoreCategory,
  StoreStatus,
  UserRole,
  VehicleType,
  DriverStatus,
  PaymentMethod,
  OrderStatus,
} from '@prisma/client';
import { prisma } from '../../src/config/prisma';
import { signAccessToken } from '../../src/utils/jwt';

let phoneCounter = 9000000000;
function nextPhone(): string {
  phoneCounter += 1;
  return phoneCounter.toString();
}

export async function createUser(overrides: Partial<{
  name: string;
  phone: string;
  role: UserRole;
  isActive: boolean;
}> = {}) {
  return prisma.user.create({
    data: {
      name: overrides.name ?? 'Test User',
      phone: overrides.phone ?? nextPhone(),
      role: overrides.role ?? 'CUSTOMER',
      isActive: overrides.isActive ?? true,
    },
  });
}

export async function createCustomer(overrides: Parameters<typeof createUser>[0] = {}) {
  return createUser({ ...overrides, role: 'CUSTOMER' });
}

export async function createAdmin(overrides: Parameters<typeof createUser>[0] = {}) {
  return createUser({ ...overrides, role: 'ADMIN', name: overrides?.name ?? 'Admin' });
}

export async function createStoreOwner(opts: {
  storeStatus?: StoreStatus;
  isOpen?: boolean;
  category?: StoreCategory;
  lat?: number;
  lng?: number;
} = {}) {
  const user = await createUser({ name: 'Store Owner', role: 'STORE_OWNER' });
  const store = await prisma.store.create({
    data: {
      ownerId: user.id,
      name: 'Test Store',
      description: 'A test store',
      category: opts.category ?? 'GROCERY',
      lat: opts.lat ?? 28.6139,
      lng: opts.lng ?? 77.209,
      street: '1 Main Rd',
      city: 'Delhi',
      state: 'DL',
      pincode: '110001',
      openTime: '09:00',
      closeTime: '21:00',
      status: opts.storeStatus ?? 'ACTIVE',
      isOpen: opts.isOpen ?? true,
    },
  });
  return { user, store };
}

export async function createDriver(opts: {
  status?: DriverStatus;
  lat?: number;
  lng?: number;
} = {}) {
  const user = await createUser({ name: 'Driver', role: 'DRIVER' });
  const driver = await prisma.driver.create({
    data: {
      userId: user.id,
      vehicleType: 'BIKE',
      vehicleNumber: 'DL01AB1234',
      licenseNumber: 'LIC-12345',
      status: opts.status ?? 'ONLINE',
      currentLat: opts.lat ?? 28.6139,
      currentLng: opts.lng ?? 77.209,
    },
  });
  return { user, driver };
}

export async function createItem(
  storeId: string,
  overrides: Partial<{
    name: string;
    category: ItemCategory;
    price: number;
    unit: string;
    stockQty: number;
    isAvailable: boolean;
    description: string;
  }> = {},
) {
  return prisma.item.create({
    data: {
      storeId,
      name: overrides.name ?? 'Test Item',
      category: overrides.category ?? 'GROCERY',
      price: overrides.price ?? 100,
      unit: overrides.unit ?? '1kg',
      stockQty: overrides.stockQty ?? 10,
      isAvailable: overrides.isAvailable ?? true,
      description: overrides.description,
    },
  });
}

export async function createAddress(
  userId: string,
  overrides: Partial<{
    label: string;
    street: string;
    city: string;
    state: string;
    pincode: string;
    lat: number;
    lng: number;
    isDefault: boolean;
  }> = {},
) {
  return prisma.address.create({
    data: {
      userId,
      label: overrides.label ?? 'Home',
      street: overrides.street ?? '1 Customer Rd',
      city: overrides.city ?? 'Delhi',
      state: overrides.state ?? 'DL',
      pincode: overrides.pincode ?? '110001',
      lat: overrides.lat ?? 28.6139,
      lng: overrides.lng ?? 77.209,
      isDefault: overrides.isDefault ?? true,
    },
  });
}

export async function createOrder(opts: {
  customerId: string;
  storeId: string;
  addressId: string;
  driverId?: string;
  status?: OrderStatus;
  paymentMethod?: PaymentMethod;
  items?: Array<{ name?: string; price?: number; unit?: string; qty?: number; itemId?: string | null }>;
}) {
  const items = opts.items ?? [{ name: 'X', price: 100, unit: '1kg', qty: 2 }];
  const subtotal = items.reduce((sum, it) => sum + (it.price ?? 100) * (it.qty ?? 1), 0);
  const deliveryFee = 30;
  const commission = parseFloat((subtotal * 0.05).toFixed(2));
  const total = parseFloat((subtotal + deliveryFee).toFixed(2));

  return prisma.order.create({
    data: {
      customerId: opts.customerId,
      storeId: opts.storeId,
      driverId: opts.driverId,
      status: opts.status ?? 'PENDING',
      subtotal,
      deliveryFee,
      commission,
      total,
      paymentMethod: opts.paymentMethod ?? 'CASH_ON_DELIVERY',
      paymentStatus: 'PENDING',
      deliveryAddressId: opts.addressId,
      items: {
        create: items.map((it) => ({
          itemId: it.itemId ?? null,
          name: it.name ?? 'X',
          price: it.price ?? 100,
          unit: it.unit ?? '1kg',
          qty: it.qty ?? 1,
        })),
      },
    },
    include: { items: true },
  });
}

/**
 * Creates a fresh user of the given role, signs an access token for them, and
 * returns both. Bypasses the OTP flow for test convenience.
 */
export async function loginAs(
  role: UserRole = 'CUSTOMER',
  overrides: Parameters<typeof createUser>[0] = {},
): Promise<{ token: string; user: Awaited<ReturnType<typeof createUser>> }> {
  const user = await createUser({ ...overrides, role });
  const token = signAccessToken({ id: user.id, role: user.role, phone: user.phone });
  return { token, user };
}

/**
 * Helper to issue an access token for an existing user.
 */
export function tokenFor(user: { id: string; role: UserRole; phone: string }): string {
  return signAccessToken({ id: user.id, role: user.role, phone: user.phone });
}
