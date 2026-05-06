import { ItemCategory } from './enums';

// Store discovery
export const DEFAULT_STORE_RADIUS_KM = 3;
export const MAX_STORE_RADIUS_KM = 10;

// Order flow timeouts
export const STORE_ACCEPT_TIMEOUT_MS = 180000; // 3 minutes
export const DRIVER_ACCEPT_TIMEOUT_MS = 60000; // 1 minute

// Driver search
export const DRIVER_SEARCH_RADIUS_KM = 2;

// Order matching
export const MIN_ITEM_MATCH_PERCENT = 0.8;

// Real-time tracking
export const DRIVER_LOCATION_EMIT_INTERVAL_MS = 5000; // 5 seconds

// Auth / JWT
export const JWT_ACCESS_EXPIRES_IN = '15m';
export const JWT_REFRESH_EXPIRES_IN = '30d';

// OTP
export const OTP_EXPIRES_IN_SECONDS = 300; // 5 minutes
export const OTP_LENGTH = 6;

// Business rules
export const COMMISSION_PERCENT = 0.10; // 10%
export const BASE_DELIVERY_FEE = 30;    // in rupees
export const PER_KM_DELIVERY_FEE = 5;  // in rupees per km

// Display labels for item categories
export const ItemCategoryLabels: Record<ItemCategory, string> = {
  [ItemCategory.GROCERY]: 'Grocery',
  [ItemCategory.MEDICINE]: 'Medicine',
  [ItemCategory.HOUSEHOLD]: 'Household',
  [ItemCategory.SNACKS]: 'Snacks',
  [ItemCategory.BEVERAGES]: 'Beverages',
  [ItemCategory.OTHER]: 'Other',
};
