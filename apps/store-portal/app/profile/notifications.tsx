import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHeaderHeight } from '@react-navigation/elements';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { colors, fontSize, radius, spacing } from '@/constants/theme';
import { api } from '@/lib/api';

interface NotifPrefs {
  orderUpdates?: boolean;
  promotional?: boolean;
  dailySummary?: boolean;
  driverUpdates?: boolean;
  newOrderAlerts?: boolean;
  rescindedAlerts?: boolean;
  earningsSummary?: boolean;
  newDeliveryAlerts?: boolean;
  payoutNotifications?: boolean;
  newStoreApprovals?: boolean;
  newDriverApprovals?: boolean;
  refundEvents?: boolean;
}

type StoreToggleKey =
  | 'newOrderAlerts'
  | 'rescindedAlerts'
  | 'earningsSummary'
  | 'promotional';

const QUERY_KEY = ['notifPrefs'] as const;

async function fetchPrefs(): Promise<NotifPrefs> {
  const res = await api.get<NotifPrefs>('/api/v1/users/me/preferences');
  return res.data ?? {};
}

async function updatePrefs(patch: Partial<NotifPrefs>): Promise<NotifPrefs> {
  const res = await api.put<NotifPrefs>('/api/v1/users/me/preferences', patch);
  return res.data ?? {};
}

interface RowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  showDivider?: boolean;
}

function PrefRow({
  icon,
  title,
  subtitle,
  value,
  onValueChange,
  disabled,
  showDivider,
}: RowProps) {
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
          disabled={disabled}
          trackColor={{ false: colors.gray300, true: colors.primaryLight }}
          thumbColor={value ? colors.primary : colors.gray400}
        />
      </View>
      {showDivider ? <View style={styles.divider} /> : null}
    </>
  );
}

function SkeletonRow({ showDivider }: { showDivider?: boolean }) {
  return (
    <>
      <View style={styles.row}>
        <View style={[styles.rowIconWrap, styles.skeletonBlock]} />
        <View style={{ flex: 1, paddingRight: spacing.md, gap: 6 }}>
          <View style={[styles.skeletonBlock, styles.skeletonTitle]} />
          <View style={[styles.skeletonBlock, styles.skeletonSubtitle]} />
        </View>
        <View style={[styles.skeletonBlock, styles.skeletonSwitch]} />
      </View>
      {showDivider ? <View style={styles.divider} /> : null}
    </>
  );
}

export default function NotificationsScreen() {
  const queryClient = useQueryClient();
  // Use real header height instead of hardcoded 100 — Android's bar height differs from iOS
  const headerHeight = useHeaderHeight();

  const { data, isLoading } = useQuery<NotifPrefs>({
    queryKey: QUERY_KEY,
    queryFn: fetchPrefs,
  });

  const mutation = useMutation<
    NotifPrefs,
    Error,
    Partial<NotifPrefs>,
    { previous: NotifPrefs | undefined }
  >({
    mutationFn: updatePrefs,
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<NotifPrefs>(QUERY_KEY);
      queryClient.setQueryData<NotifPrefs>(QUERY_KEY, (old) => ({
        ...(old ?? {}),
        ...patch,
      }));
      return { previous };
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(QUERY_KEY, ctx.previous);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const toggle = (key: StoreToggleKey, value: boolean) => {
    mutation.mutate({ [key]: value } as Partial<NotifPrefs>);
  };

  const get = (key: StoreToggleKey, fallback: boolean): boolean => {
    const v = data?.[key];
    return typeof v === 'boolean' ? v : fallback;
  };

  if (isLoading) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: headerHeight + spacing.md }]}
        showsVerticalScrollIndicator={false}
      >
        <Card padding={0} style={styles.menuCard}>
          <SkeletonRow showDivider />
          <SkeletonRow showDivider />
          <SkeletonRow showDivider />
          <SkeletonRow />
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: headerHeight + spacing.md }]}
      showsVerticalScrollIndicator={false}
    >
      <Card padding={0} style={styles.menuCard}>
        <PrefRow
          icon="notifications-outline"
          title="New order alerts"
          subtitle="Get notified the moment an order arrives"
          value={get('newOrderAlerts', true)}
          onValueChange={(v) => toggle('newOrderAlerts', v)}
          showDivider
        />
        <PrefRow
          icon="close-circle-outline"
          title="Order taken by another store"
          subtitle="Alerts when an order moves to a different store"
          value={get('rescindedAlerts', true)}
          onValueChange={(v) => toggle('rescindedAlerts', v)}
          showDivider
        />
        <PrefRow
          icon="cash-outline"
          title="Daily earnings summary"
          subtitle="Receive a summary every evening"
          value={get('earningsSummary', false)}
          onValueChange={(v) => toggle('earningsSummary', v)}
          showDivider
        />
        <PrefRow
          icon="megaphone-outline"
          title="Promotional offers"
          subtitle="Marketplace promos and partner programs"
          value={get('promotional', false)}
          onValueChange={(v) => toggle('promotional', v)}
        />
      </Card>

      <View style={styles.noteBox}>
        <Ionicons name="cloud-done-outline" size={18} color={colors.textSecondary} />
        <Text style={styles.noteText}>Synced with your account</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  // paddingTop is set dynamically (header height + spacing); was hardcoded 100 which double-stacks on Android
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.lg },
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
  skeletonBlock: {
    backgroundColor: colors.gray200,
    borderRadius: radius.sm,
  },
  skeletonTitle: {
    height: 14,
    width: '55%',
  },
  skeletonSubtitle: {
    height: 10,
    width: '80%',
  },
  skeletonSwitch: {
    width: 44,
    height: 26,
    borderRadius: radius.full,
  },
});
