import { Ionicons } from '@expo/vector-icons';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '@/components/Header';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';

const APP_VERSION = '1.0.0';

interface LinkRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}

function LinkRow({ icon, label, onPress }: LinkRowProps) {
  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={onPress}>
      <View style={styles.iconBox}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

export default function AboutScreen() {
  function openUrl(url: string) {
    Linking.openURL(url).catch(() => {});
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header title="About" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.logoBadge}>
            <Ionicons name="basket" size={48} color={colors.white} />
          </View>
          <Text style={styles.appName}>Apni Kirana Store</Text>
          <Text style={styles.tagline}>Daily essentials, delivered fast</Text>
          <Text style={styles.version}>Version {APP_VERSION}</Text>
        </View>

        <View style={styles.linkCard}>
          <LinkRow
            icon="document-text-outline"
            label="Terms of Service"
            onPress={() => openUrl('https://apnikirana.example/terms')}
          />
          <View style={styles.divider} />
          <LinkRow
            icon="shield-checkmark-outline"
            label="Privacy Policy"
            onPress={() => openUrl('https://apnikirana.example/privacy')}
          />
          <View style={styles.divider} />
          <LinkRow
            icon="globe-outline"
            label="Visit our website"
            onPress={() => openUrl('https://apnikirana.example')}
          />
        </View>

        <View style={styles.linkCard}>
          <LinkRow
            icon="logo-instagram"
            label="Instagram"
            onPress={() => openUrl('https://instagram.com/apnikirana')}
          />
          <View style={styles.divider} />
          <LinkRow
            icon="logo-twitter"
            label="Twitter / X"
            onPress={() => openUrl('https://twitter.com/apnikirana')}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Made in India 🇮🇳</Text>
          <Text style={styles.copyright}>
            © {new Date().getFullYear()} Apni Kirana Store. All rights reserved.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  hero: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  logoBadge: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadow.large,
  },
  appName: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  tagline: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  version: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '700',
  },
  linkCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.small,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.lg + 36 + spacing.md,
  },
  footer: {
    alignItems: 'center',
    marginTop: spacing.xxl,
    gap: spacing.xs,
  },
  footerText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  copyright: {
    marginTop: spacing.sm,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
