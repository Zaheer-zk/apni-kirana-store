import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

export type BadgeVariant =
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'default'
  | 'primary'
  | 'purple'
  | 'indigo';

interface BadgeProps {
  variant?: BadgeVariant;
  text: string;
  /** When true, render a small leading dot in the foreground colour. */
  dot?: boolean;
  style?: ViewStyle;
}

const palette: Record<BadgeVariant, { bg: string; fg: string }> = {
  success: { bg: colors.successLight, fg: '#047857' },
  warning: { bg: colors.warningLight, fg: '#B45309' },
  error: { bg: colors.errorLight, fg: '#B91C1C' },
  info: { bg: colors.infoLight, fg: colors.primaryDark },
  default: { bg: colors.gray100, fg: colors.gray700 },
  primary: { bg: colors.primaryLight, fg: colors.primaryDark },
  purple: { bg: colors.purpleLight, fg: colors.purple },
  indigo: { bg: colors.indigoLight, fg: colors.indigo },
};

export function Badge({ variant = 'default', text, dot, style }: BadgeProps) {
  const { bg, fg } = palette[variant];
  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]}>
      {dot ? <View style={[styles.dot, { backgroundColor: fg }]} /> : null}
      <Text style={[styles.text, { color: fg }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
