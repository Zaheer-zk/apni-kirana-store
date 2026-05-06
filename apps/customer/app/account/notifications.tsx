import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '@/components/Header';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';

interface PrefRow {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  defaultValue: boolean;
}

const ROWS: PrefRow[] = [
  {
    key: 'orderUpdates',
    icon: 'bag-handle',
    iconBg: colors.primaryLight,
    iconColor: colors.primary,
    title: 'Order updates',
    description: 'Status changes, accepted, on the way, delivered',
    defaultValue: true,
  },
  {
    key: 'promos',
    icon: 'pricetag',
    iconBg: colors.warningLight,
    iconColor: '#B45309',
    title: 'Promotional offers',
    description: 'Discounts, deals and seasonal sales',
    defaultValue: false,
  },
  {
    key: 'driverUpdates',
    icon: 'bicycle',
    iconBg: colors.infoLight,
    iconColor: colors.info,
    title: 'Delivery driver updates',
    description: 'Driver assigned, arriving, location pings',
    defaultValue: true,
  },
  {
    key: 'emailSummary',
    icon: 'mail',
    iconBg: colors.purpleLight,
    iconColor: colors.purple,
    title: 'Email summaries',
    description: 'Weekly recap of your orders and savings',
    defaultValue: false,
  },
];

export default function NotificationsScreen() {
  const [prefs, setPrefs] = useState<Record<string, boolean>>(() =>
    ROWS.reduce<Record<string, boolean>>((acc, r) => {
      acc[r.key] = r.defaultValue;
      return acc;
    }, {}),
  );

  function toggle(key: string) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header title="Notification Preferences" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Choose which notifications you want to receive. You can change this any time.
        </Text>

        <View style={styles.card}>
          {ROWS.map((row, idx) => (
            <View
              key={row.key}
              style={[
                styles.row,
                idx === ROWS.length - 1 ? { borderBottomWidth: 0 } : null,
              ]}
            >
              <View style={[styles.iconBox, { backgroundColor: row.iconBg }]}>
                <Ionicons name={row.icon} size={18} color={row.iconColor} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{row.title}</Text>
                <Text style={styles.rowDesc}>{row.description}</Text>
              </View>
              <Switch
                value={!!prefs[row.key]}
                onValueChange={() => toggle(row.key)}
                trackColor={{ false: colors.gray300, true: colors.primary }}
                thumbColor={colors.white}
              />
            </View>
          ))}
        </View>

        <View style={styles.note}>
          <Ionicons name="information-circle" size={16} color={colors.info} />
          <Text style={styles.noteText}>Settings are saved automatically</Text>
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
  intro: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  card: {
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  rowDesc: {
    marginTop: 2,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.infoLight,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.lg,
  },
  noteText: {
    flex: 1,
    color: colors.info,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
});
