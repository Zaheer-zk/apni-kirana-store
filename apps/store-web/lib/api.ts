import axios, { AxiosError } from 'axios';
import { clearSession, getToken } from './auth';

/**
 * store-web Axios instance. Mirrors `apps/customer-web/lib/api.ts` so the
 * response-unwrap behaviour ({ success, data, error }) is identical across
 * web surfaces. On 401 we clear the local session and bounce to /login —
 * but only in the browser (server components shouldn't redirect from here).
 */
/**
 * Resolve the API base URL at build time. See apps/customer-web/lib/api.ts
 * for the rationale — silently defaulting to localhost in production bakes
 * a broken HTTP URL into the client bundle and breaks every API call.
 */
function resolveBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (process.env.NODE_ENV === 'production') {
    if (!url) {
      throw new Error(
        'NEXT_PUBLIC_API_URL is required for production builds. Set it in .env.prod ' +
          'and pass --env-file .env.prod to docker compose.',
      );
    }
    if (!url.startsWith('https://')) {
      throw new Error(
        `NEXT_PUBLIC_API_URL must be HTTPS in production (got: "${url}").`,
      );
    }
  }
  return url ?? 'http://localhost:3000';
}

export const api = axios.create({
  baseURL: resolveBaseUrl(),
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
    // Three error shapes — string, AppError object, Zod flattened.
    const respData = error?.response?.data as
      | { error?: unknown; message?: string }
      | undefined;
    let apiMessage: string | undefined;
    if (typeof respData?.error === 'string') {
      apiMessage = respData.error;
    } else if (respData?.error && typeof respData.error === 'object') {
      const e = respData.error as {
        message?: string;
        fieldErrors?: Record<string, string[]>;
        formErrors?: string[];
      };
      apiMessage =
        e.message ??
        e.formErrors?.[0] ??
        Object.values(e.fieldErrors ?? {})
          .flat()
          .find(Boolean);
    }
    apiMessage = apiMessage ?? respData?.message ?? error?.message ?? 'Network error';
    if (error instanceof Error && typeof apiMessage === 'string') {
      error.message = apiMessage;
    }
    return Promise.reject(error);
  },
);

/** Convenience: unwrap `{ success, data }` into just `data`. */
export function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as object)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

/** Convenience: unwrap a list under various known envelope shapes. */
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
