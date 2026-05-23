/**
 * Browser-side auth token storage. Mirrors the admin app's pattern but uses
 * a customer-specific localStorage key so the three web apps can coexist on
 * the same device without trampling each other's sessions.
 */
const TOKEN_KEY = 'aks_customer_token';
const REFRESH_KEY = 'aks_customer_refresh';
const USER_KEY = 'aks_customer_user';

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

export const clearSession = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
};

export const isAuthenticated = (): boolean => !!getToken();

/**
 * Persist the full auth payload from `/auth/login` or `/auth/verify-otp`.
 * Keeps the three localStorage keys in sync so a page refresh restores the
 * session.
 */
export function persistSession(payload: {
  accessToken: string;
  refreshToken: string;
  user: StoredUser;
}): void {
  setToken(payload.accessToken);
  setRefreshToken(payload.refreshToken);
  setStoredUser(payload.user);
}
