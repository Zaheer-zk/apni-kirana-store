// Namespaced expo-secure-store keys for the customer app.
//
// In Expo Go all 3 apps (customer / store-portal / driver) share one
// secure-store, so unprefixed keys collide and logging into one app makes
// another think it's signed in. Every customer SecureStore call MUST use
// these prefixed constants.
export const STORAGE_KEYS = {
  accessToken: 'customer.accessToken',
  refreshToken: 'customer.refreshToken',
  user: 'customer.user',
} as const;
