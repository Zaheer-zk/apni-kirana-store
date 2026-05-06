import { ReactNode } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius, shadow, spacing } from '@/constants/theme';

interface CardProps {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
  padding?: number;
  elevated?: boolean;
  /** Optional accent color for a left-edge stripe (e.g. red for active delivery). */
  accentColor?: string;
}

export function Card({
  children,
  style,
  padding = spacing.lg,
  elevated = true,
  accentColor,
}: CardProps) {
  return (
    <View
      style={[
        styles.card,
        elevated ? shadow.small : null,
        { padding },
        accentColor
          ? { borderLeftWidth: 4, borderLeftColor: accentColor }
          : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
