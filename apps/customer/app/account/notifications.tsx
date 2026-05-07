import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '@/components/Card';
import { Header } from '@/components/Header';
import { Skeleton } from '@/components/Skeleton';
import { apiClient } from '@/lib/api';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

type PrefKey = 'orderUpdates' | 'driverUpdates' | 'promotional' | 'dailySummary';

type Prefs = Partial<Record<PrefKey, boolean>> & Record<string, unknown>;

interface PrefRow {
  key: PrefKey;
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
}

const ROWS: PrefRow[] = [
  {
    key: 'orderUpdates',
    icon: 'bag-handle',
    iconBg: colors.primaryLight,
    iconColor: colors.primary,
    title: 'Order updates',
    description: 'Status changes, accepted, on the way, delivered',
  },
  {
    key: 'driverUpdates',
    icon: 'bicycle',
    iconBg: colors.infoLight,
    iconColor: colors.info,
    title: 'Driver updates',
    description: 'Driver assigned, arriving, location pings',
  },
  {
    key: 'promotional',
    icon: 'pricetag',
    iconBg: colors.warningLight,
    iconColor: '#B45309',
    title: 'Promotional offers',
    description: 'Discounts, deals and seasonal sales',
  },
  {
    key: 'dailySummary',
    icon: 'calendar',
    iconBg: colors.purpleLight,
    iconColor: colors.purple,
    title: 'Daily summary',
    description: 'A daily recap of your orders and activity',
  },
];

function unwrap<T>(payload: unknown): T | null {
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    if (o['data'] && typeof o['data'] === 'object') return o['data'] as T;
    return o as T;
  }
  return null;
}

async function fetchPrefs(): Promise<Prefs> {
  const res = await apiClient.get('/api/v1/users/me/preferences');
  return unwrap<Prefs>(res.data) ?? {};
}

async function savePrefs(patch: Partial<Record<PrefKey, boolean>>): Promise<Prefs> {
  const res = await apiClient.put('/api/v1/users/me/preferences', patch);
  return unwrap<Prefs>(res.data) ?? {};
}

export default function NotificationsScreen() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['notifPrefs'],
    queryFn: fetchPrefs,
  });

  const mutation = useMutation({
    mutationFn: (patch: Partial<Record<PrefKey, boolean>>) => savePrefs(patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ['notifPrefs'] });
      const prev = qc.getQueryData<Prefs>(['notifPrefs']);
      qc.setQueryData<Prefs>(['notifPrefs'], (old) => ({ ...(old ?? {}), ...patch }));
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['notifPrefs'], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['notifPrefs'] });
    },
  });

  function toggle(key: PrefKey, current: boolean) {
    mutation.mutate({ [key]: !current });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header title="Notification Preferences" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Choose which notifications you want to receive. You can change this any time.
        </Text>

        {isLoading ? (
          <Card padding={0} style={styles.card}>
            {ROWS.map((row, idx) => (
              <View
                key={row.key}
                style={[
                  styles.row,
                  idx === ROWS.length - 1 ? { borderBottomWidth: 0 } : null,
                ]}
              >
                <Skeleton width={40} height={40} radius={20} />
                <View style={styles.rowText}>
                  <Skeleton width={'60%'} height={14} />
                  <View style={{ height: 6 }} />
                  <Skeleton width={'90%'} height={10} />
                </View>
                <Skeleton width={40} height={20} radius={10} />
              </View>
            ))}
          </Card>
        ) : isError ? (
          <Card>
            <Text style={styles.errorText}>
              Could not load your preferences. Please try again.
            </Text>
          </Card>
        ) : (
          <Card padding={0} style={styles.card}>
            {ROWS.map((row, idx) => {
              const value = !!data?.[row.key];
              return (
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
                    value={value}
                    onValueChange={() => toggle(row.key, value)}
                    disabled={mutation.isPending}
                    trackColor={{ false: colors.gray300, true: colors.primary }}
                    thumbColor={colors.white}
                  />
                </View>
              );
            })}
          </Card>
        )}

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
    overflow: 'hidden',
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
  errorText: {
    color: colors.error,
    fontSize: fontSize.sm,
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
