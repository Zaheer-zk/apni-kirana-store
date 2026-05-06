import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { Card } from '@/components/Card';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

const STORAGE_KEY = 'store-notif-prefs';

interface NotifPrefs {
  newOrderAlerts: boolean;
  orderRescinded: boolean;
  dailyEarningsSummary: boolean;
  promotionalOffers: boolean;
}

const DEFAULTS: NotifPrefs = {
  newOrderAlerts: true,
  orderRescinded: true,
  dailyEarningsSummary: false,
  promotionalOffers: false,
};

// Storage shim: prefer AsyncStorage if available, else fall back to SecureStore.
const storage = {
  async get(key: string): Promise<string | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('@react-native-async-storage/async-storage');
      const AsyncStorage = mod?.default ?? mod;
      if (AsyncStorage?.getItem) return await AsyncStorage.getItem(key);
    } catch {
      /* fall through */
    }
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('@react-native-async-storage/async-storage');
      const AsyncStorage = mod?.default ?? mod;
      if (AsyncStorage?.setItem) {
        await AsyncStorage.setItem(key, value);
        return;
      }
    } catch {
      /* fall through */
    }
    await SecureStore.setItemAsync(key, value);
  },
};

interface RowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  showDivider?: boolean;
}

function PrefRow({ icon, title, subtitle, value, onValueChange, showDivider }: RowProps) {
  return (
    <>
      <View style={styles.row}>
        <View style={styles.rowIconWrap}>
          <Ionicons name={icon} size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1, paddingRight: spacing.md }}>
          <Text style={styles.rowTitle}>{title}</Text>
          {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
        </View>
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: colors.gray300, true: colors.primaryLight }}
          thumbColor={value ? colors.primary : colors.gray400}
        />
      </View>
      {showDivider ? <View style={styles.divider} /> : null}
    </>
  );
}

export default function NotificationsScreen() {
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const raw = await storage.get(STORAGE_KEY);
        if (active && raw) {
          const parsed = JSON.parse(raw);
          setPrefs({ ...DEFAULTS, ...parsed });
        }
      } catch {
        /* keep defaults */
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const update = (patch: Partial<NotifPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    storage.set(STORAGE_KEY, JSON.stringify(next)).catch(() => {
      /* swallow */
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Card padding={0} style={styles.menuCard}>
        <PrefRow
          icon="notifications-outline"
          title="New order alerts"
          subtitle="Get notified the moment an order arrives"
          value={prefs.newOrderAlerts}
          onValueChange={(v) => update({ newOrderAlerts: v })}
          showDivider
        />
        <PrefRow
          icon="close-circle-outline"
          title="Order rescinded"
          subtitle="Alerts when a customer cancels an active order"
          value={prefs.orderRescinded}
          onValueChange={(v) => update({ orderRescinded: v })}
          showDivider
        />
        <PrefRow
          icon="cash-outline"
          title="Daily earnings summary"
          subtitle="Receive a summary every evening"
          value={prefs.dailyEarningsSummary}
          onValueChange={(v) => update({ dailyEarningsSummary: v })}
          showDivider
        />
        <PrefRow
          icon="megaphone-outline"
          title="Promotional offers from admin"
          subtitle="Marketplace promos and partner programs"
          value={prefs.promotionalOffers}
          onValueChange={(v) => update({ promotionalOffers: v })}
        />
      </Card>

      <View style={styles.noteBox}>
        <Ionicons name="cloud-offline-outline" size={18} color={colors.textSecondary} />
        <Text style={styles.noteText}>
          Sync with server coming soon. Preferences are saved on this device.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 100, paddingBottom: spacing.xxxl, gap: spacing.lg },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  menuCard: { overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary },
  rowSubtitle: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.divider, marginLeft: spacing.lg + 36 + spacing.md },
  noteBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.gray100,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'flex-start',
  },
  noteText: { flex: 1, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 18 },
});
