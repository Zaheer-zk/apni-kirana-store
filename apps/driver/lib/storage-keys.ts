// Namespaced expo-secure-store keys for the driver app.
// All 3 mobile apps share the same secure-store in Expo Go, so every
// key MUST be prefixed with `driver.` to avoid cross-app collisions.
export const STORAGE_KEYS = {
  accessToken: 'driver.accessToken',
  refreshToken: 'driver.refreshToken',
  user: 'driver.user',
  driverProfile: 'driver.driverProfile',
} as const;
