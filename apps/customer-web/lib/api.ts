import axios, { AxiosError } from 'axios';
import { clearSession, getToken } from './auth';

/**
 * Customer-web Axios instance. Mirrors `apps/admin/lib/api.ts` so the
 * response-unwrap behaviour ({ success, data, error }) is identical across
 * web surfaces. On 401 we clear the local session and bounce to /login —
 * but only in the browser (server components shouldn't redirect from here).
 */
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    const body = response.data;
    // Backend wraps every response as { success, data, message? }. Legacy
    // endpoints sometimes still return `{ success: false }` with HTTP 200 —
    // surface those as rejected promises so React Query treats them as
    // errors instead of "successful but empty" data.
    if (body && typeof body === 'object' && 'success' in body && body.success === false) {
      const message =
        typeof body.error === 'string'
          ? body.error
          : (body.error?.message ?? body.message ?? 'Request failed');
      return Promise.reject(new Error(message));
    }
    return response;
  },
  (error: AxiosError) => {
    if (error?.response?.status === 401) {
      clearSession();
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.replace(`/login?next=${next}`);
      }
    }
    // Normalise so `error.message` is human-readable for React Query / forms.
    const respData = error?.response?.data as
      | { error?: string | { message?: string }; message?: string }
      | undefined;
    const apiMessage =
      (typeof respData?.error === 'string' ? respData.error : respData?.error?.message) ??
      respData?.message ??
      error?.message ??
      'Network error';
    if (error instanceof Error && typeof apiMessage === 'string') {
      error.message = apiMessage;
    }
    return Promise.reject(error);
  },
);

/**
 * Convenience: unwrap a `{ success, data }` envelope into just `data`.
 * Returns the raw payload if the envelope shape isn't present (older
 * routes sometimes return the data directly).
 */
export function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as object)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

/**
 * Convenience: unwrap a paginated list. Backend can return:
 *  - an array directly
 *  - `{ data: T[] }`
 *  - `{ data: { items: T[], total, page, pages } }`
 */
export function unwrapList<T>(payload: unknown, listKey?: string): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    if (Array.isArray(o.data)) return o.data as T[];
    if (o.data && typeof o.data === 'object') {
      const inner = o.data as Record<string, unknown>;
      if (listKey && Array.isArray(inner[listKey])) return inner[listKey] as T[];
      if (Array.isArray(inner.items)) return inner.items as T[];
    }
    if (listKey && Array.isArray(o[listKey])) return o[listKey] as T[];
    if (Array.isArray(o.items)) return o.items as T[];
  }
  return [];
}
