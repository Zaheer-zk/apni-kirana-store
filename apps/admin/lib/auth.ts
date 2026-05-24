const TOKEN_KEY = 'admin_token';
const SUPER_KEY = 'admin_is_super';
const INFO_KEY = 'admin_info';

/**
 * Minimal admin identity we cache from the login response so the top-right
 * profile dropdown can render name + initials without a follow-up /me call.
 */
export type AdminInfo = {
  id?: string;
  name?: string;
  username?: string;
  email?: string;
};

export const setAdminInfo = (info: AdminInfo): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(INFO_KEY, JSON.stringify(info));
};

export const getAdminInfo = (): AdminInfo | null => {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(INFO_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminInfo;
  } catch {
    return null;
  }
};

export const clearAdminInfo = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(INFO_KEY);
};

export const getToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
};

export const setToken = (token: string): void => {
  localStorage.setItem(TOKEN_KEY, token);
};

export const clearToken = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(SUPER_KEY);
  localStorage.removeItem(INFO_KEY);
};

export const isAuthenticated = (): boolean => !!getToken();

// Whether the logged-in admin is the super admin (can manage other admins).
// This only gates UI affordances — the backend independently enforces it.
export const setSuperAdmin = (value: boolean): void => {
  if (value) localStorage.setItem(SUPER_KEY, '1');
  else localStorage.removeItem(SUPER_KEY);
};

export const isSuperAdmin = (): boolean => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(SUPER_KEY) === '1';
};
