import { Image, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, fontSize } from '@/constants/theme';

interface AvatarProps {
  name?: string;
  imageUrl?: string;
  size?: number;
  backgroundColor?: string;
  style?: ViewStyle;
}

function getInitials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

export function Avatar({
  name,
  imageUrl,
  size = 48,
  backgroundColor = colors.primaryLight,
  style,
}: AvatarProps) {
  const dimension = { width: size, height: size, borderRadius: size / 2 };

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={[dimension, styles.image, style]}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        dimension,
        { backgroundColor },
        style,
      ]}
    >
      <Text style={[styles.initials, { fontSize: Math.max(fontSize.xs, size * 0.4) }]}>
        {getInitials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    backgroundColor: colors.gray200,
  },
  initials: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
});
