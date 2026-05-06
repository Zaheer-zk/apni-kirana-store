import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card } from '@/components/Card';
import { Skeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';
import type { StoreEarningsSummary, StoreEarningsEntry } from '@aks/shared';

type Period = 'today' | 'week' | 'month';

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today',
  week: 'Week',
  month: 'Month',
};

export default function StoreEarningsScreen() {
  const [period, setPeriod] = useState<Period>('today');

  const { data: summary, isLoading: summaryLoading } = useQuery<StoreEarningsSummary>({
    queryKey: ['storeEarningsSummary'],
    queryFn: () =>
      api.get<StoreEarningsSummary>('/api/v1/stores/earnings/summary').then((r) => r.data),
  });

  const { data: breakdown, isLoading: breakdownLoading } = useQuery<StoreEarningsEntry[]>({
    queryKey: ['storeEarningsBreakdown', period],
    queryFn: () =>
      api
        .get<StoreEarningsEntry[]>(`/api/v1/stores/earnings/breakdown?period=${period}`)
        .then((r) => r.data),
  });

  const heroValue =
    period === 'today'
      ? summary?.today
      : period === 'week'
      ? summary?.week
      : summary?.month;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageTitle}>Earnings</Text>

        {/* Hero Card */}
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>{PERIOD_LABELS[period]} revenue</Text>
          {summaryLoading ? (
            <Skeleton width={180} height={42} style={{ marginTop: spacing.xs }} />
          ) : (
            <Text style={styles.heroValue}>₹{Number(heroValue ?? 0).toFixed(2)}</Text>
          )}
          {!summaryLoading ? (
            <Text style={styles.heroSubtext}>
              {summary?.todayOrders ?? 0} order{summary?.todayOrders === 1 ? '' : 's'} today
            </Text>
          ) : null}

          {/* Period Selector */}
          <View style={styles.periodSelector}>
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => {
              const isActive = period === p;
              return (
                <TouchableOpacity
                  key={p}
                  activeOpacity={0.7}
                  style={[styles.periodTab, isActive && styles.periodTabActive]}
                  onPress={() => setPeriod(p)}
                >
                  <Text style={[styles.periodTabText, isActive && styles.periodTabTextActive]}>
                    {PERIOD_LABELS[p]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Mini summary */}
        <View style={styles.miniRow}>
          <Card style={styles.miniCard} padding={spacing.lg}>
            <Text style={styles.miniLabel}>This Week</Text>
            {summaryLoading ? (
              <Skeleton width={80} height={20} />
            ) : (
              <Text style={styles.miniValue}>₹{Number(summary?.week ?? 0).toFixed(2)}</Text>
            )}
          </Card>
          <Card style={styles.miniCard} padding={spacing.lg}>
            <Text style={styles.miniLabel}>This Month</Text>
            {summaryLoading ? (
              <Skeleton width={80} height={20} />
            ) : (
              <Text style={styles.miniValue}>₹{Number(summary?.month ?? 0).toFixed(2)}</Text>
            )}
          </Card>
        </View>

        {/* Order Breakdown */}
        <Text style={styles.sectionTitle}>Orders</Text>

        {breakdownLoading ? (
          <View style={{ gap: spacing.sm }}>
            <Skeleton height={64} radius={radius.lg} />
            <Skeleton height={64} radius={radius.lg} />
            <Skeleton height={64} radius={radius.lg} />
          </View>
        ) : !breakdown || breakdown.length === 0 ? (
          <Card style={styles.emptyCard} padding={spacing.xxl}>
            <EmptyState
              icon="cash-outline"
              title="No orders in this period"
              subtitle="Once orders are completed, they show up here."
            />
          </Card>
        ) : (
          breakdown.map((entry) => (
            <Card key={entry.orderId} padding={spacing.lg} style={styles.breakdownRow}>
              <View style={styles.breakdownLeft}>
                <View style={styles.breakdownIcon}>
                  <Ionicons name="receipt-outline" size={18} color={colors.primary} />
                </View>
                <View>
                  <Text style={styles.breakdownOrderId}>
                    #{entry.orderId.slice(-8).toUpperCase()}
                  </Text>
                  <Text style={styles.breakdownDate}>
                    {new Date(entry.completedAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                  <Text style={styles.breakdownItems}>
                    {entry.itemsCount} item{entry.itemsCount === 1 ? '' : 's'}
                  </Text>
                </View>
              </View>
              <Text style={styles.breakdownAmount}>
                ₹{entry.storeRevenue.toFixed(2)}
              </Text>
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },
  pageTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },

  hero: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    ...shadow.medium,
  },
  heroLabel: {
    fontSize: fontSize.xs,
    color: colors.primaryLight,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heroValue: {
    fontSize: fontSize.display + 4,
    fontWeight: '800',
    color: colors.white,
    marginTop: spacing.xs,
  },
  heroSubtext: {
    fontSize: fontSize.sm,
    color: colors.primaryLight,
    marginTop: spacing.xs,
  },
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.full,
    padding: 4,
    marginTop: spacing.lg,
  },
  periodTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    alignItems: 'center',
  },
  periodTabActive: {
    backgroundColor: colors.white,
  },
  periodTabText: {
    fontSize: fontSize.sm,
    color: colors.white,
    fontWeight: '700',
  },
  periodTabTextActive: {
    color: colors.primary,
  },

  miniRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  miniCard: { flex: 1 },
  miniLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  miniValue: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.textPrimary,
  },

  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  breakdownIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breakdownOrderId: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  breakdownDate: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  breakdownItems: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  breakdownAmount: { fontSize: fontSize.lg, fontWeight: '800', color: colors.primary },
  emptyCard: { paddingVertical: spacing.md },
});
