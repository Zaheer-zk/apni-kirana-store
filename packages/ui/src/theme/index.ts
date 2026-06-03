/**
 * Brand tokens for the Quick Easy Mart web apps.
 *
 * These mirror the React Native theme in `apps/customer/constants/theme.ts`
 * so the mobile + web surfaces stay visually identical. If you change brand
 * colours here, also update `apps/customer/constants/theme.ts` (and vice
 * versa) — they are intentionally duplicated because the Expo app cannot
 * import a Node-only TypeScript module that uses ESM-only deps.
 *
 * Consumers:
 *   - Tailwind preset (`tailwind.preset.ts`) reads these for utility colours.
 *   - Non-Tailwind code (charts, inline styles, third-party widgets like
 *     Leaflet popups) can import the raw hex values from here.
 */

export const colors = {
  // Brand
  primary: '#16A34A',
  primaryDark: '#15803D',
  primaryLight: '#DCFCE7',
  accent: '#F59E0B',
  accentLight: '#FEF3C7',

  // Surfaces
  background: '#F9FAFB',
  card: '#FFFFFF',
  surface: '#FFFFFF',
  overlay: 'rgba(17, 24, 39, 0.45)',

  // Text
  text: '#111827',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  textInverse: '#FFFFFF',

  // Borders / dividers
  border: '#E5E7EB',
  borderStrong: '#D1D5DB',
  divider: '#F3F4F6',

  // Status
  success: '#10B981',
  successLight: '#D1FAE5',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  error: '#EF4444',
  errorLight: '#FEE2E2',
  info: '#3B82F6',
  infoLight: '#DBEAFE',
  purple: '#8B5CF6',
  purpleLight: '#EDE9FE',
  indigo: '#6366F1',
  indigoLight: '#E0E7FF',

  // Misc
  black: '#000000',
  white: '#FFFFFF',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827',
} as const;

export const radius = {
  sm: '0.5rem',
  md: '0.75rem',
  lg: '1rem',
  xl: '1.5rem',
  full: '9999px',
} as const;

export const fontSize = {
  xs: '0.75rem',
  sm: '0.875rem',
  md: '1rem',
  lg: '1.125rem',
  xl: '1.25rem',
  xxl: '1.5rem',
  xxxl: '1.75rem',
  display: '2rem',
} as const;

export const shadow = {
  small:
    '0 1px 2px 0 rgb(0 0 0 / 0.06), 0 1px 3px 0 rgb(0 0 0 / 0.06)',
  medium:
    '0 2px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.06)',
  large:
    '0 10px 25px -5px rgb(0 0 0 / 0.12), 0 8px 10px -6px rgb(0 0 0 / 0.08)',
} as const;

export const theme = { colors, radius, fontSize, shadow } as const;
export type Theme = typeof theme;
