import axios from 'axios';
import { getToken, clearToken } from './auth';

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15_000,
});

// Attach auth token to every request
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 → redirect to login. Also surface backend's `{ success: false,
// error }` envelopes — those return HTTP 200 in some legacy paths and would
// otherwise pass silently into pages that assume `data` is the payload.
api.interceptors.response.use(
  (response) => {
    const body = response.data;
    if (body && typeof body === 'object' && 'success' in body && body.success === false) {
      const message =
        typeof body.error === 'string'
          ? body.error
          : body.error?.message ?? 'Request failed';
      return Promise.reject(new Error(message));
    }
    return response;
  },
  (error) => {
    if (error?.response?.status === 401) {
      clearToken();
      if (typeof window !== 'undefined') {
        window.location.replace('/login');
      }
    }
    // Normalise to a friendly Error so React Query's `error.message` is useful.
    const apiMessage =
      error?.response?.data?.error ??
      error?.response?.data?.message ??
      error?.message ??
      'Network error';
    if (error instanceof Error) {
      error.message = typeof apiMessage === 'string' ? apiMessage : error.message;
    }
    return Promise.reject(error);
  }
);
