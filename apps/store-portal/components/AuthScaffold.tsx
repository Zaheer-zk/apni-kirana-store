import { StatusBar } from 'expo-status-bar';
import { ReactNode } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';

/**
 * Shared hero + sheet layout for every auth screen (login, register,
 * forgot-password, change-password). Keeps the screens themselves to just
 * their form content.
 *
 * Hero shows the Quick Easy Mart icon badge on the brand background; the white
 * sheet leads with the horizontal wordmark so the brand reads cleanly over a
 * light surface before the form copy starts.
 */
export function AuthScaffold({ children }: { children: ReactNode }) {
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.heroSafe}>
        <View style={styles.hero}>
          <View style={styles.logoBadge}>
            <Image
              source={require('@/assets/apni-icon.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        style={styles.sheetWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={20}
      >
        <ScrollView
          style={styles.sheet}
          contentContainerStyle={styles.sheetContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.handle} />
          <Image
            source={require('@/assets/apni-horizontal.png')}
            style={styles.wordmark}
            resizeMode="contain"
            accessibilityLabel="Quick Easy Mart"
          />
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primary },
  heroSafe: { backgroundColor: colors.primary },
  hero: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
    paddingHorizontal: spacing.xxl,
  },
  logoBadge: {
    width: 76,
    height: 76,
    borderRadius: radius.xl,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...shadow.large,
  },
  logoImage: { width: 76, height: 76 },
  sheetWrap: { flex: 1, marginTop: -spacing.xl },
  sheet: {
    flex: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  sheetContent: { padding: spacing.xxl, paddingBottom: spacing.xxxl },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray200,
    marginBottom: spacing.lg,
  },
  wordmark: {
    alignSelf: 'center',
    width: 220,
    height: 56,
    marginBottom: spacing.lg,
  },
});

/** Styles shared by the auth screens' form content. */
export const authStyles = StyleSheet.create({
  title: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.textPrimary },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
    lineHeight: 20,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorLight,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.lg,
  },
  errorText: { flex: 1, color: colors.error, fontSize: fontSize.sm, fontWeight: '600' },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.infoLight,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.lg,
  },
  noticeText: { flex: 1, color: colors.info, fontSize: fontSize.xs, fontWeight: '600' },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  linkText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '700' },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  footerMuted: { color: colors.textSecondary, fontSize: fontSize.sm },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.gray100,
    borderRadius: radius.md,
    padding: 4,
    marginBottom: spacing.xl,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  segmentBtnActive: { backgroundColor: colors.white, ...shadow.small },
  segmentText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textSecondary },
  segmentTextActive: { color: colors.primary },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  otpBox: {
    flex: 1,
    aspectRatio: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    backgroundColor: colors.white,
  },
  otpBoxFilled: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
});
