// Namespaced expo-secure-store keys for the store-portal app.
// All 3 mobile apps share a single Expo Go secure-store sandbox, so every
// key MUST be prefixed per app to avoid cross-app auth bleed.
export const STORAGE_KEYS = {
  accessToken: 'store.accessToken',
  refreshToken: 'store.refreshToken',
  user: 'store.user',
  storeProfile: 'store.storeProfile',
} as const;
