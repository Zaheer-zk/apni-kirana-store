import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

export type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'default' | 'primary' | 'purple' | 'indigo';

interface BadgeProps {
  variant?: BadgeVariant;
  text: string;
  style?: ViewStyle;
}

const palette: Record<BadgeVariant, { bg: string; fg: string }> = {
  success: { bg: colors.successLight, fg: colors.success },
  warning: { bg: colors.warningLight, fg: '#B45309' },
  error: { bg: colors.errorLight, fg: colors.error },
  info: { bg: colors.infoLight, fg: colors.info },
  default: { bg: colors.gray100, fg: colors.gray700 },
  primary: { bg: colors.primaryLight, fg: colors.primaryDark },
  purple: { bg: colors.purpleLight, fg: colors.purple },
  indigo: { bg: colors.indigoLight, fg: colors.indigo },
};

export function Badge({ variant = 'default', text, style }: BadgeProps) {
  const { bg, fg } = palette[variant];
  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]}>
      <Text style={[styles.text, { color: fg }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
  },
  text: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
