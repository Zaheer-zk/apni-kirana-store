import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCartStore } from '@/store/cart.store';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';

const TAB_BAR_HEIGHT = 70;

export function CartFloatingBar() {
  const items = useCartStore((s) => s.items);
  const total = useCartStore((s) => s.total);
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const count = items.reduce((sum, i) => sum + i.qty, 0);
  const visible = items.length > 0;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          friction: 7,
          tension: 80,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 80,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 120,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, translateY, opacity]);

  if (!visible) return null;

  const bottomOffset =
    TAB_BAR_HEIGHT + Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 0) + spacing.sm;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          bottom: bottomOffset,
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.pill}
        onPress={() => router.push('/cart')}
      >
        <View style={styles.left}>
          <View style={styles.iconBubble}>
            <Ionicons name="basket" size={16} color={colors.primary} />
          </View>
          <Text style={styles.countText}>
            {count} item{count === 1 ? '' : 's'}
          </Text>
        </View>

        <Text style={styles.totalText}>₹{total().toFixed(0)}</Text>

        <View style={styles.right}>
          <Text style={styles.viewText}>View cart</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.white} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 50,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
    ...shadow.large,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  iconBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  totalText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flex: 1,
    justifyContent: 'flex-end',
  },
  viewText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
});
