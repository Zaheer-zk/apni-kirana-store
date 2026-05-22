import * as SecureStore from 'expo-secure-store';
import type { UserProfile, DriverProfile } from '@aks/shared';
import { useDriverStore } from '@/store/driver.store';
import { STORAGE_KEYS } from '@/lib/storage-keys';

/**
 * Persists a freshly-issued session: in-memory store first (instant), then
 * SecureStore in parallel. Call this after a successful login / OTP verify.
 *
 * `driverProfile` is whatever the auth response carried (often null right
 * after registration — the vehicle/licence step fills it in later). The
 * `driver.driverProfile` SecureStore key is owned by the screens that
 * actually fetch/create the driver entity, not by this helper.
 */
export async function persistSession(
  user: UserProfile,
  accessToken: string,
  refreshToken: string,
  driverProfile: DriverProfile | null = null,
): Promise<void> {
  useDriverStore.getState().setAuth(accessToken, user, driverProfile);
  await Promise.all([
    SecureStore.setItemAsync(STORAGE_KEYS.accessToken, accessToken),
    SecureStore.setItemAsync(STORAGE_KEYS.refreshToken, refreshToken),
    SecureStore.setItemAsync(STORAGE_KEYS.user, JSON.stringify(user)),
  ]);
}
