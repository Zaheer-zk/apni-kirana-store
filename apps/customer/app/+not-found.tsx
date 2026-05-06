import { Ionicons } from '@expo/vector-icons';
import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not Found', headerShown: false }} />
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <View style={styles.iconBox}>
            <Ionicons name="basket-outline" size={48} color={colors.primary} />
          </View>
          <Text style={styles.label}>404</Text>
          <Text style={styles.title}>Page not found</Text>
          <Text style={styles.subtitle}>
            We couldn&apos;t find what you were looking for.
          </Text>
          <Link href="/(tabs)/home" replace asChild>
            <Text style={styles.cta}>← Back to Home</Text>
          </Link>
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  iconBox: {
    width: 96,
    height: 96,
    borderRadius: radius.xl,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as '600',
    color: colors.primary,
    letterSpacing: 1,
  },
  title: {
    marginTop: spacing.sm,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold as '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: spacing.md,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  cta: {
    marginTop: spacing.xxl,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold as '600',
    color: colors.primary,
  },
});
