import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTransitionStore } from '@/store/transition.store';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';

/**
 * Full-screen branded splash. Mounted at the root so it survives across
 * navigation — call `useTransitionStore.getState().showTransition('msg')`
 * before `router.replace(...)` and the overlay stays visible until the
 * destination screen has had time to mount.
 */
export function TransitionOverlay() {
  const visible = useTransitionStore((s) => s.visible);
  const message = useTransitionStore((s) => s.message);

  if (!visible) return null;

  return (
    <View style={styles.root} pointerEvents="auto">
      <StatusBar style="light" />
      <View style={styles.logoBadge}>
        <Ionicons name="basket" size={56} color={colors.white} />
      </View>
      <Text style={styles.brand}>Apni Kirana Store</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <ActivityIndicator
        size="large"
        color={colors.white}
        style={{ marginTop: spacing.xl }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    zIndex: 9999,
    elevation: 9999,
  },
  logoBadge: {
    width: 104,
    height: 104,
    borderRadius: radius.xl,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
    ...shadow.large,
  },
  brand: {
    color: colors.white,
    fontSize: fontSize.xxl,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: spacing.sm,
  },
  message: {
    color: colors.primaryLight,
    fontSize: fontSize.md,
    textAlign: 'center',
    fontWeight: '500',
  },
});
