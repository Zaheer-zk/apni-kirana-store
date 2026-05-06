import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  children?: ReactNode;
  title?: string;
  style?: ViewStyle | ViewStyle[];
}

const sizeMap: Record<ButtonSize, { paddingV: number; paddingH: number; font: number; iconSize: number }> = {
  sm: { paddingV: spacing.sm, paddingH: spacing.md, font: fontSize.sm, iconSize: 16 },
  md: { paddingV: spacing.md, paddingH: spacing.lg, font: fontSize.md, iconSize: 18 },
  lg: { paddingV: spacing.lg, paddingH: spacing.xl, font: fontSize.md, iconSize: 20 },
};

export function Button({
  variant = 'primary',
  size = 'md',
  onPress,
  loading = false,
  disabled = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  children,
  title,
  style,
}: ButtonProps) {
  const sizeStyle = sizeMap[size];
  const isDisabled = disabled || loading;

  const containerStyle: ViewStyle = {
    paddingVertical: sizeStyle.paddingV,
    paddingHorizontal: sizeStyle.paddingH,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    alignSelf: fullWidth ? 'stretch' : 'flex-start',
    opacity: isDisabled ? 0.55 : 1,
    ...variantContainer[variant],
  };

  const labelStyle: TextStyle = {
    fontSize: sizeStyle.font,
    fontWeight: '700',
    ...variantLabel[variant],
  };

  const isOutlineLike = variant === 'outline' || variant === 'ghost';
  const spinnerColor = isOutlineLike ? colors.primary : colors.white;
  const iconColor = isOutlineLike ? colors.primary : colors.white;
  const label = children ?? title;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
      style={[containerStyle, style]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={spinnerColor} />
      ) : (
        <>
          {icon && iconPosition === 'left' && (
            <Ionicons name={icon} size={sizeStyle.iconSize} color={iconColor} />
          )}
          {typeof label === 'string' ? <Text style={labelStyle}>{label}</Text> : label ? <View>{label}</View> : null}
          {icon && iconPosition === 'right' && (
            <Ionicons name={icon} size={sizeStyle.iconSize} color={iconColor} />
          )}
        </>
      )}
    </TouchableOpacity>
  );
}

const variantContainer: Record<ButtonVariant, ViewStyle> = StyleSheet.create({
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.primaryDark },
  outline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.primary },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.error },
});

const variantLabel: Record<ButtonVariant, TextStyle> = StyleSheet.create({
  primary: { color: colors.white },
  secondary: { color: colors.white },
  outline: { color: colors.primary },
  ghost: { color: colors.primary },
  danger: { color: colors.white },
});
