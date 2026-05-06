import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';

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
      // Optional dynamic import — if not installed this throws synchronously.
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
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}

function PrefRow({ title, subtitle, value, onValueChange }: RowProps) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: '#2563EB', false: '#D1D5DB' }}
        thumbColor="#fff"
      />
    </View>
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
    // Optimistic persist
    storage.set(STORAGE_KEY, JSON.stringify(next)).catch(() => {
      /* swallow */
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.headerBtn} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#2563EB" />
        </View>
      ) : (
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
        >
          <View style={styles.card}>
            <PrefRow
              title="New order alerts"
              subtitle="Get notified the moment an order arrives"
              value={prefs.newOrderAlerts}
              onValueChange={(v) => update({ newOrderAlerts: v })}
            />
            <View style={styles.divider} />
            <PrefRow
              title="Order rescinded"
              subtitle="Alerts when a customer cancels an active order"
              value={prefs.orderRescinded}
              onValueChange={(v) => update({ orderRescinded: v })}
            />
            <View style={styles.divider} />
            <PrefRow
              title="Daily earnings summary"
              subtitle="Receive a summary every evening"
              value={prefs.dailyEarningsSummary}
              onValueChange={(v) => update({ dailyEarningsSummary: v })}
            />
            <View style={styles.divider} />
            <PrefRow
              title="Promotional offers from admin"
              subtitle="Marketplace promos and partner programs"
              value={prefs.promotionalOffers}
              onValueChange={(v) => update({ promotionalOffers: v })}
            />
          </View>

          <View style={styles.noteBox}>
            <Ionicons name="cloud-offline-outline" size={18} color="#6B7280" />
            <Text style={styles.noteText}>
              Sync with server coming soon. Preferences are saved on this
              device.
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerBtn: { width: 40, alignItems: 'flex-start' },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  rowSubtitle: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  divider: { height: 1, backgroundColor: '#F3F4F6' },
  noteBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 12,
  },
  noteText: { flex: 1, fontSize: 13, color: '#4B5563', lineHeight: 18 },
});
