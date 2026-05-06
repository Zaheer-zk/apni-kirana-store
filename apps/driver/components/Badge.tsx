import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

export type BadgeVariant =
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'default'
  | 'primary';

interface BadgeProps {
  variant?: BadgeVariant;
  text: string;
  /** Show a small leading dot (good for status pills). */
  dot?: boolean;
  style?: ViewStyle;
}

const palette: Record<BadgeVariant, { bg: string; fg: string; dot: string }> = {
  success: { bg: colors.successLight, fg: colors.successDark, dot: colors.success },
  warning: { bg: colors.warningLight, fg: colors.warningDark, dot: colors.warning },
  error: { bg: colors.errorLight, fg: colors.primaryDark, dot: colors.error },
  info: { bg: colors.infoLight, fg: colors.infoDark, dot: colors.info },
  default: { bg: colors.gray100, fg: colors.gray700, dot: colors.gray500 },
  primary: { bg: colors.primaryLight, fg: colors.primaryDark, dot: colors.primary },
};

export function Badge({ variant = 'default', text, dot = false, style }: BadgeProps) {
  const tone = palette[variant];
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }, style]}>
      {dot ? (
        <View style={[styles.dot, { backgroundColor: tone.dot }]} />
      ) : null}
      <Text style={[styles.text, { color: tone.fg }]} numberOfLines={1}>
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
    gap: spacing.xs,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
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
