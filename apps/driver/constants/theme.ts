import { Platform, ViewStyle } from 'react-native';

/**
 * Apni Kirana Store — Driver Design System
 * Mirrors the customer app's structure but with the red-branded driver palette.
 */

export const colors = {
  // Brand (driver = red)
  primary: '#DC2626',
  primaryDark: '#991B1B',
  primaryLight: '#FEE2E2',
  primaryTint: '#FEF2F2',

  // Accent (driver = green for "online" / earnings)
  accent: '#16A34A',
  accentDark: '#15803D',
  accentLight: '#DCFCE7',

  // Surfaces
  background: '#F9FAFB',
  card: '#FFFFFF',
  surface: '#FFFFFF',
  overlay: 'rgba(17, 24, 39, 0.55)',

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
  successDark: '#065F46',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  warningDark: '#92400E',
  error: '#EF4444',
  errorLight: '#FEE2E2',
  info: '#3B82F6',
  infoLight: '#DBEAFE',
  infoDark: '#1E40AF',

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

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 28,
  display: 32,
} as const;

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

/**
 * Cross-platform shadow helper. iOS uses shadow* props; Android uses elevation.
 */
const ANDROID_ELEVATION: Record<'small' | 'medium' | 'large', number> = {
  small: 2,
  medium: 4,
  large: 8,
};

function makeShadow(level: 'small' | 'medium' | 'large'): ViewStyle {
  if (Platform.OS === 'android') {
    return { elevation: ANDROID_ELEVATION[level] };
  }

  if (level === 'small') {
    return {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 2,
    };
  }

  if (level === 'medium') {
    return {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
    };
  }

  return {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  };
}

export const shadow = {
  small: makeShadow('small'),
  medium: makeShadow('medium'),
  large: makeShadow('large'),
} as const;

export const theme = {
  colors,
  spacing,
  radius,
  fontSize,
  fontWeight,
  shadow,
} as const;

export type Theme = typeof theme;
