import * as SecureStore from 'expo-secure-store';
import type { UserProfile } from '@aks/shared';
import { useAuthStore } from '@/store/auth.store';
import { STORAGE_KEYS } from '@/lib/storage-keys';

/**
 * Persists a freshly-issued session: in-memory store first (instant), then
 * SecureStore in parallel. Call this after a successful login / OTP verify.
 */
export async function persistSession(
  user: UserProfile,
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  useAuthStore.getState().setAuth(user, accessToken);
  await Promise.all([
    SecureStore.setItemAsync(STORAGE_KEYS.accessToken, accessToken),
    SecureStore.setItemAsync(STORAGE_KEYS.refreshToken, refreshToken),
    SecureStore.setItemAsync(STORAGE_KEYS.user, JSON.stringify(user)),
  ]);
}
