const TOKEN_KEY = 'admin_token';
const SUPER_KEY = 'admin_is_super';

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
