import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { useFavoriteIds, useToggleFavorite } from '@/lib/favorites';
import { colors } from '@/constants/theme';

/**
 * Heart toggle for a catalog product. Reads the shared favorited-id set so
 * every card on a screen shares one fetch. Logged-out taps route to login.
 * Renders nothing when no catalogItemId is available (legacy item responses).
 */
export function FavoriteHeart({
  catalogItemId,
  size = 22,
  style,
}: {
  catalogItemId?: string;
  size?: number;
  style?: ViewStyle;
}) {
  const { ids, isLoggedIn } = useFavoriteIds();
  const toggle = useToggleFavorite();

  if (!catalogItemId) return null;
  const active = ids.has(catalogItemId);

  function handlePress() {
    if (!isLoggedIn) {
      router.push('/(auth)/login' as never);
      return;
    }
    toggle.mutate({ catalogItemId: catalogItemId!, next: !active });
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      hitSlop={8}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={active ? 'Remove from favorites' : 'Add to favorites'}
      style={[styles.btn, style]}
    >
      <Ionicons
        name={active ? 'heart' : 'heart-outline'}
        size={size}
        color={active ? colors.error : colors.textSecondary}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
