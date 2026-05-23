/**
 * Browser-side auth token storage for the store dashboard. Mirrors
 * `apps/customer-web/lib/auth.ts` exactly but with `aks_store_*` keys so the
 * three web surfaces can coexist on the same device (and inside the same
 * browser profile) without trampling each other's sessions.
 *
 * We also persist a snapshot of the owner's store profile because the
 * dashboard / inventory screens need `storeId` before the first network
 * round-trip — without it the open/closed toggle and inventory query would
 * throw "store id missing".
 */

/**
 * Local store-snapshot type. We deliberately don't reuse
 * `@aks/shared`'s `StoreProfile` because that type was modelled for the
 * mobile customer app (`address: string`, `category: ItemCategory`) and
 * doesn't include the dashboard-only flag `isOpen`. Keeping this type
 * local also means the snapshot is permissive — old localStorage payloads
 * never break a TS compile.
 */
export interface StoredStore {
  id?: string;
  name?: string;
  isOpen?: boolean;
  lat?: number;
  lng?: number;
  category?: string;
  status?: string;
  street?: string;
  city?: string;
  state?: string;
  pincode?: string;
  openTime?: string;
  closeTime?: string;
  description?: string | null;
  [key: string]: unknown;
}

const TOKEN_KEY = 'aks_store_token';
const REFRESH_KEY = 'aks_store_refresh';
const USER_KEY = 'aks_store_user';
const STORE_KEY = 'aks_store_profile';

export interface StoredUser {
  id: string;
  phone: string;
  name?: string | null;
  email?: string | null;
  role: string;
}

export const getToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
};

export const setToken = (token: string): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
};

export const getRefreshToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY);
};

export const setRefreshToken = (token: string): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(REFRESH_KEY, token);
};

export const getStoredUser = (): StoredUser | null => {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
};

export const setStoredUser = (user: StoredUser): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const getStoredStore = (): StoredStore | null => {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredStore;
  } catch {
    return null;
  }
};

export const setStoredStore = (store: StoredStore | null): void => {
  if (typeof window === 'undefined') return;
  if (store) {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } else {
    localStorage.removeItem(STORE_KEY);
  }
};

export const clearSession = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(STORE_KEY);
};

export const isAuthenticated = (): boolean => !!getToken();

/**
 * Persist the full auth payload returned by `/auth/login` or `/auth/verify-otp`.
 * The optional `storeProfile` field comes through for STORE_OWNER accounts
 * that already have a store registered.
 */
export function persistSession(payload: {
  accessToken: string;
  refreshToken: string;
  user: StoredUser;
  storeProfile?: StoredStore | null;
}): void {
  setToken(payload.accessToken);
  setRefreshToken(payload.refreshToken);
  setStoredUser(payload.user);
  if (payload.storeProfile) setStoredStore(payload.storeProfile);
}
