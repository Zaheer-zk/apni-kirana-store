import axios, { AxiosError } from 'axios';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '@/store/auth.store';
import { STORAGE_KEYS } from '@/lib/storage-keys';

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Request interceptor: attach Bearer token
apiClient.interceptors.request.use(
  async (config) => {
    // Prefer Zustand in-memory token for speed
    const { accessToken } = useAuthStore.getState();
    const token = accessToken ?? (await SecureStore.getItemAsync(STORAGE_KEYS.accessToken));

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

// Response interceptor: handle 401
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Clear all stored credentials
      await SecureStore.deleteItemAsync(STORAGE_KEYS.accessToken);
      await SecureStore.deleteItemAsync(STORAGE_KEYS.refreshToken);
      await SecureStore.deleteItemAsync(STORAGE_KEYS.user);
      useAuthStore.getState().clearAuth();

      // Redirect to login
      router.replace('/(auth)/login');
    }

    // Surface the backend's real error string so callers' Alert.alert(…,
    // err.message) shows something actionable instead of the generic
    // "Request failed with status code 400" that axios sets by default.
    // Backends return either `{ error: "string" }` or `{ error: { fieldErrors, formErrors } }`
    // (Zod's flattened shape).
    const body = error.response?.data as
      | { error?: unknown; message?: string }
      | undefined;
    if (body) {
      let readable: string | undefined;
      if (typeof body.error === 'string') {
        readable = body.error;
      } else if (typeof body.message === 'string') {
        readable = body.message;
      } else if (body.error && typeof body.error === 'object') {
        const e = body.error as {
          fieldErrors?: Record<string, string[]>;
          formErrors?: string[];
        };
        const first =
          e.formErrors?.[0] ??
          Object.values(e.fieldErrors ?? {})
            .flat()
            .find(Boolean);
        if (first) readable = first;
      }
      if (readable) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (error as any).message = readable;
      }
    }
    return Promise.reject(error);
  }
);
