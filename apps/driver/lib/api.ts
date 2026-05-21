import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { STORAGE_KEYS } from './storage-keys';
import { useDriverStore } from '@/store/driver.store';

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

// Response interceptor — handle expired sessions, then surface error messages
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ message?: string }>) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync(STORAGE_KEYS.accessToken);
      await SecureStore.deleteItemAsync(STORAGE_KEYS.refreshToken);
      await SecureStore.deleteItemAsync(STORAGE_KEYS.user);
      await SecureStore.deleteItemAsync(STORAGE_KEYS.driverProfile);
      useDriverStore.getState().clearAuth();
      router.replace('/(auth)/login');
    }
    const message =
      error.response?.data?.message ?? error.message ?? 'An unexpected error occurred';
    return Promise.reject(new Error(message));
  }
);

export default api;
