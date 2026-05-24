/**
 * Address types + small API helpers used by the addresses page, the checkout
 * flow, and anywhere else the customer-web needs to read/write the user's
 * saved delivery locations.
 *
 * Endpoints (backend/src/routes/addresses.routes.ts):
 *   GET    /api/v1/addresses           — list
 *   POST   /api/v1/addresses           — create
 *   PUT    /api/v1/addresses/:id       — update (partial)
 *   DELETE /api/v1/addresses/:id       — delete
 *   PUT    /api/v1/addresses/:id/default — set default
 */
import { z } from 'zod';
import { api, unwrap } from './api';

export interface SavedAddress {
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
  createdAt?: string;
  updatedAt?: string;
}

// Validation schema mirrors the backend Zod schema so the form catches
// bad input before the round-trip. Keep these in sync.
export const addressFormSchema = z.object({
  label: z.string().min(1, 'Label is required').max(50),
  street: z.string().min(3, 'Street is required').max(200),
  city: z.string().min(1, 'City is required').max(100),
  state: z.string().min(1, 'State is required').max(100),
  pincode: z
    .string()
    .regex(/^\d{6}$/, 'Pincode must be 6 digits'),
  lat: z.number({ invalid_type_error: 'Pick a location on the map' }).min(-90).max(90),
  lng: z.number({ invalid_type_error: 'Pick a location on the map' }).min(-180).max(180),
  isDefault: z.boolean().optional(),
});

export type AddressFormInput = z.infer<typeof addressFormSchema>;

export async function fetchAddresses(): Promise<SavedAddress[]> {
  const res = await api.get('/api/v1/addresses');
  const data = unwrap<SavedAddress[] | { items: SavedAddress[] }>(res.data);
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && 'items' in data) return data.items;
  return [];
}

export async function createAddress(input: AddressFormInput): Promise<SavedAddress> {
  const res = await api.post('/api/v1/addresses', input);
  return unwrap<SavedAddress>(res.data);
}

export async function updateAddress(
  id: string,
  input: Partial<AddressFormInput>,
): Promise<SavedAddress> {
  const res = await api.put(`/api/v1/addresses/${id}`, input);
  return unwrap<SavedAddress>(res.data);
}

export async function deleteAddress(id: string): Promise<void> {
  await api.delete(`/api/v1/addresses/${id}`);
}

export async function setDefaultAddress(id: string): Promise<SavedAddress> {
  const res = await api.put(`/api/v1/addresses/${id}/default`);
  return unwrap<SavedAddress>(res.data);
}

/** Format an address into a single readable line, e.g. for cart / checkout. */
export function formatAddressLine(addr: SavedAddress): string {
  return `${addr.street}, ${addr.city}, ${addr.state} ${addr.pincode}`;
}
