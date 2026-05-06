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
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { StoreEarningsSummary, StoreEarningsEntry } from '@aks/shared';

type Period = 'today' | 'week' | 'month';

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today',
  week: 'This Week',
  month: 'This Month',
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

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.pageTitle}>Earnings</Text>

        {summaryLoading ? (
          <ActivityIndicator color="#2563EB" style={{ marginVertical: 20 }} />
        ) : (
          <View style={styles.summaryGrid}>
            <View style={[styles.summaryCard, styles.summaryCardFull]}>
              <Text style={styles.summaryLabel}>Today's Revenue</Text>
              <Text style={styles.summaryValueLarge}>₹{summary?.today?.toFixed(2) ?? '0.00'}</Text>
              <Text style={styles.summarySubtext}>
                {summary?.todayOrders ?? 0} orders
              </Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>This Week</Text>
              <Text style={styles.summaryValue}>₹{summary?.week?.toFixed(2) ?? '0.00'}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>This Month</Text>
              <Text style={styles.summaryValue}>₹{summary?.month?.toFixed(2) ?? '0.00'}</Text>
            </View>
          </View>
        )}

        {/* Period Selector */}
        <View style={styles.periodSelector}>
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.periodTab, period === p && styles.periodTabActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[styles.periodTabText, period === p && styles.periodTabTextActive]}>
                {PERIOD_LABELS[p]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Order Breakdown */}
        <Text style={styles.sectionTitle}>Order Breakdown</Text>

        {breakdownLoading ? (
          <ActivityIndicator color="#2563EB" style={{ marginTop: 16 }} />
        ) : breakdown && breakdown.length === 0 ? (
          <Text style={styles.emptyText}>No orders in this period</Text>
        ) : (
          breakdown?.map((entry) => (
            <View key={entry.orderId} style={styles.breakdownRow}>
              <View>
                <Text style={styles.breakdownOrderId}>#{entry.orderId.slice(-8).toUpperCase()}</Text>
                <Text style={styles.breakdownDate}>
                  {new Date(entry.completedAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
                <Text style={styles.breakdownItems}>{entry.itemsCount} items</Text>
              </View>
              <Text style={styles.breakdownAmount}>₹{entry.storeRevenue.toFixed(2)}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 32 },
  pageTitle: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 20 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  summaryCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  summaryCardFull: { flexBasis: '100%', backgroundColor: '#EFF6FF' },
  summaryLabel: { fontSize: 12, color: '#9CA3AF', fontWeight: '600', marginBottom: 6 },
  summaryValue: { fontSize: 22, fontWeight: '800', color: '#111827' },
  summaryValueLarge: { fontSize: 36, fontWeight: '800', color: '#2563EB' },
  summarySubtext: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 4,
    marginBottom: 20,
  },
  periodTab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  periodTabActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  periodTabText: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
  periodTabTextActive: { color: '#2563EB' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 12 },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  breakdownOrderId: { fontSize: 14, fontWeight: '700', color: '#111827' },
  breakdownDate: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  breakdownItems: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  breakdownAmount: { fontSize: 18, fontWeight: '800', color: '#2563EB' },
  emptyText: { color: '#9CA3AF', fontSize: 14, textAlign: 'center', marginTop: 8 },
});
