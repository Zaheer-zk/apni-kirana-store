import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card } from '@/components/Card';
import { Badge, type BadgeVariant } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';
import type { DriverEarningsSummary, DriverEarningsEntry } from '@aks/shared';

type Period = 'today' | 'week' | 'month';

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today',
  week: 'This Week',
  month: 'This Month',
};

const PAYOUT_STATUS_VARIANT: Record<string, BadgeVariant> = {
  PENDING: 'warning',
  PROCESSING: 'info',
  PAID: 'success',
};

export default function EarningsScreen() {
  const [period, setPeriod] = useState<Period>('today');

  const { data: summary, isLoading } = useQuery<DriverEarningsSummary>({
    queryKey: ['driverEarningsSummary'],
    queryFn: () =>
      api
        .get<DriverEarningsSummary>('/api/v1/drivers/earnings/summary')
        .then((r) => r.data),
  });

  const { data: breakdown, isLoading: breakdownLoading } = useQuery<
    DriverEarningsEntry[]
  >({
    queryKey: ['driverEarningsBreakdown', period],
    queryFn: () =>
      api
        .get<DriverEarningsEntry[]>(
          `/api/v1/drivers/earnings/breakdown?period=${period}`,
        )
        .then((r) => r.data),
  });

  const heroValue =
    period === 'today'
      ? summary?.today
      : period === 'week'
      ? summary?.week
      : summary?.month;

  return (
    // Android: include left/right so screen respects horizontal insets (tab bar handles bottom)
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageTitle}>Earnings</Text>

        {/* Hero Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroLeft}>
            <Text style={styles.heroLabel}>
              {period === 'today'
                ? "Today's earnings"
                : period === 'week'
                ? 'This week'
                : 'This month'}
            </Text>
            {isLoading ? (
              <Skeleton
                width={140}
                height={36}
                style={{ marginTop: spacing.sm }}
              />
            ) : (
              <Text style={styles.heroValue}>
                ₹{Number(heroValue ?? 0).toFixed(2)}
              </Text>
            )}
          </View>
          <View style={styles.heroIconWrap}>
            <Ionicons name="wallet" size={32} color={colors.white} />
          </View>
        </View>

        {/* Period Selector */}
        <View style={styles.periodSelector}>
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => {
            const active = period === p;
            return (
              <TouchableOpacity
                key={p}
                activeOpacity={0.7}
                style={[styles.periodTab, active && styles.periodTabActive]}
                onPress={() => setPeriod(p)}
              >
                <Text
                  style={[
                    styles.periodTabText,
                    active && styles.periodTabTextActive,
                  ]}
                >
                  {PERIOD_LABELS[p]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Summary tiles */}
        <View style={styles.summaryRow}>
          <Card style={styles.summaryCard} padding={spacing.md}>
            <Text style={styles.summaryLabel}>Today</Text>
            <Text style={styles.summaryValue}>
              ₹{summary?.today?.toFixed(0) ?? '0'}
            </Text>
          </Card>
          <Card style={styles.summaryCard} padding={spacing.md}>
            <Text style={styles.summaryLabel}>Week</Text>
            <Text style={styles.summaryValue}>
              ₹{summary?.week?.toFixed(0) ?? '0'}
            </Text>
          </Card>
          <Card style={styles.summaryCard} padding={spacing.md}>
            <Text style={styles.summaryLabel}>Month</Text>
            <Text style={styles.summaryValue}>
              ₹{summary?.month?.toFixed(0) ?? '0'}
            </Text>
          </Card>
        </View>

        {/* Payout Status */}
        {summary?.payoutStatus && (
          <Card style={styles.payoutCard}>
            <View style={styles.payoutHeader}>
              <View style={styles.payoutIconWrap}>
                <Ionicons name="cash" size={20} color={colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.payoutLabel}>Next payout</Text>
                <Text style={styles.payoutAmount}>
                  ₹{summary.pendingPayout?.toFixed(2) ?? '0.00'}
                </Text>
              </View>
              <Badge
                variant={PAYOUT_STATUS_VARIANT[summary.payoutStatus] ?? 'default'}
                text={summary.payoutStatus}
              />
            </View>
          </Card>
        )}

        {/* Per-Delivery Breakdown */}
        <Text style={styles.sectionTitle}>Per-delivery breakdown</Text>

        {breakdownLoading ? (
          <View style={{ gap: spacing.sm }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.breakdownSkeleton}>
                <View>
                  <Skeleton width={100} height={14} />
                  <Skeleton width={140} height={12} style={{ marginTop: 6 }} />
                </View>
                <Skeleton width={70} height={18} />
              </View>
            ))}
          </View>
        ) : !breakdown || breakdown.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            title="No deliveries"
            subtitle={`No deliveries in ${PERIOD_LABELS[period].toLowerCase()}. Stay online to earn!`}
          />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {breakdown.map((entry) => (
              <Card key={entry.orderId} style={styles.breakdownCard} padding={spacing.md}>
                <View style={styles.breakdownLeft}>
                  <View style={styles.breakdownIconWrap}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
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
                  </View>
                </View>
                <Text style={styles.breakdownAmount}>
                  +₹{entry.driverEarnings.toFixed(2)}
                </Text>
              </Card>
            ))}
          </View>
        )}

        {isLoading && !summary && (
          <ActivityIndicator
            color={colors.primary}
            style={{ marginTop: spacing.xl }}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  pageTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
  },

  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.medium,
  },
  heroLeft: { flex: 1 },
  heroLabel: {
    fontSize: fontSize.sm,
    color: colors.primaryLight,
    fontWeight: '600',
  },
  heroValue: {
    fontSize: 38,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.5,
    marginTop: 4,
  },
  heroIconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  periodSelector: {
    flexDirection: 'row',
    backgroundColor: colors.gray100,
    borderRadius: radius.md,
    padding: 4,
  },
  periodTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  periodTabActive: {
    backgroundColor: colors.card,
    ...shadow.small,
  },
  periodTabText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  periodTabTextActive: { color: colors.primary },

  summaryRow: { flexDirection: 'row', gap: spacing.sm },
  summaryCard: { flex: 1, alignItems: 'flex-start' },
  summaryLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
  },

  payoutCard: { padding: spacing.lg },
  payoutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  payoutIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.warningLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payoutLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
  },
  payoutAmount: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 2,
  },

  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },

  breakdownCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  breakdownIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breakdownOrderId: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  breakdownDate: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  breakdownAmount: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.accent,
  },
  breakdownSkeleton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
});
