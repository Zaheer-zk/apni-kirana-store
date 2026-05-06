import { ReactNode } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius, shadow, spacing } from '@/constants/theme';

interface CardProps {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
  padding?: number;
  elevated?: boolean;
}

export function Card({ children, style, padding = spacing.lg, elevated = true }: CardProps) {
  return (
    <View
      style={[
        styles.card,
        elevated ? shadow.small : null,
        { padding },
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
