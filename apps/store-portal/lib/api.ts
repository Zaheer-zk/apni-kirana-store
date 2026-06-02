import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { STORAGE_KEYS } from './storage-keys';
import { useStorePortalStore } from '@/store/store.store';

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — attach bearer token
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await SecureStore.getItemAsync(STORAGE_KEYS.accessToken);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

// Response interceptor — handle expired sessions, then surface error messages.
// Mirrors apps/driver/lib/api.ts: extracts the backend's `error` string or
// Zod's `{ fieldErrors, formErrors }` shape so callers see the real reason
// instead of axios's generic "Request failed with status code N".
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ error?: unknown; message?: string }>) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync(STORAGE_KEYS.accessToken);
      await SecureStore.deleteItemAsync(STORAGE_KEYS.refreshToken);
      await SecureStore.deleteItemAsync(STORAGE_KEYS.user);
      await SecureStore.deleteItemAsync(STORAGE_KEYS.storeProfile);
      useStorePortalStore.getState().clearAuth();
      router.replace('/(auth)/login');
    }
    const body = error.response?.data;
    let readable: string | undefined;
    if (body) {
      if (typeof body.error === 'string') readable = body.error;
      else if (typeof body.message === 'string') readable = body.message;
      else if (body.error && typeof body.error === 'object') {
        const e = body.error as {
          fieldErrors?: Record<string, string[]>;
          formErrors?: string[];
        };
        readable =
          e.formErrors?.[0] ??
          Object.values(e.fieldErrors ?? {})
            .flat()
            .find(Boolean);
      }
    }
    const message = readable ?? error.message ?? 'An unexpected error occurred';
    return Promise.reject(new Error(message));
  }
);

export default api;
