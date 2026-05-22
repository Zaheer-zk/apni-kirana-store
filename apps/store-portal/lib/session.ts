import * as SecureStore from 'expo-secure-store';
import type { StoreProfile, UserProfile } from '@aks/shared';
import { useStorePortalStore } from '@/store/store.store';
import { STORAGE_KEYS } from '@/lib/storage-keys';

/**
 * Persists a freshly-issued session: in-memory store first (instant), then
 * SecureStore in parallel. Call this after a successful login / OTP verify.
 *
 * Note: this does NOT touch `store.storeProfile` — the caller decides whether
 * a store profile is known yet and persists it separately if so.
 */
export async function persistSession(
  user: UserProfile,
  accessToken: string,
  refreshToken: string,
  storeProfile: StoreProfile | null = null,
): Promise<void> {
  useStorePortalStore.getState().setAuth(accessToken, user, storeProfile);
  await Promise.all([
    SecureStore.setItemAsync(STORAGE_KEYS.accessToken, accessToken),
    SecureStore.setItemAsync(STORAGE_KEYS.refreshToken, refreshToken),
    SecureStore.setItemAsync(STORAGE_KEYS.user, JSON.stringify(user)),
  ]);
}
