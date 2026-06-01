import { Ionicons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiClient } from '@/lib/api';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

// Mirrors apps/customer-web/app/wallet/page.tsx — same /api/v1/users/me/wallet
// endpoint and same transaction shape. Refunds, promo credits, and goodwill
// adjustments land here; ORDER_PAYMENT entries are debits when wallet was
// used to settle a bill.

type TxnKind =
  | 'REFUND'
  | 'PROMO_CREDIT'
  | 'GOODWILL'
  | 'ORDER_PAYMENT'
  | 'ADJUSTMENT';

interface WalletTxn {
  id: string;
  kind: TxnKind;
  amount: number; // signed paise
  balanceAfter: number;
  orderId: string | null;
  note: string | null;
  actorId: string | null;
  createdAt: string;
}

interface WalletView {
  balance: number; // paise
  currency: string;
  transactions: WalletTxn[];
}

const KIND_LABEL: Record<TxnKind, string> = {
  REFUND: 'Refund',
  PROMO_CREDIT: 'Promo credit',
  GOODWILL: 'Goodwill credit',
  ORDER_PAYMENT: 'Order payment',
  ADJUSTMENT: 'Adjustment',
};

const KIND_ICON: Record<TxnKind, keyof typeof Ionicons.glyphMap> = {
  REFUND: 'arrow-undo-outline',
  PROMO_CREDIT: 'pricetag-outline',
  GOODWILL: 'gift-outline',
  ORDER_PAYMENT: 'receipt-outline',
  ADJUSTMENT: 'swap-horizontal-outline',
};

const KIND_TINT: Record<TxnKind, { bg: string; fg: string }> = {
  REFUND: { bg: '#D1FAE5', fg: '#15803D' },
  PROMO_CREDIT: { bg: '#DBEAFE', fg: '#1E40AF' },
  GOODWILL: { bg: '#DBEAFE', fg: '#1E40AF' },
  ORDER_PAYMENT: { bg: '#FEE2E2', fg: '#B91C1C' },
  ADJUSTMENT: { bg: '#FEF3C7', fg: '#B45309' },
};

function unwrap<T>(payload: unknown): T | null {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return (payload as T) ?? null;
}

function formatRupees(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const value = Math.abs(paise) / 100;
  return `${sign}₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function WalletScreen() {
  const [refreshing, setRefreshing] = useState(false);

  const walletQuery = useQuery<WalletView | null>({
    queryKey: ['wallet'],
    queryFn: async () => {
      const res = await apiClient.get('/api/v1/users/me/wallet', {
        params: { limit: 50 },
      });
      return unwrap<WalletView>(res.data);
    },
  });

  async function onRefresh() {
    setRefreshing(true);
    await walletQuery.refetch();
    setRefreshing(false);
  }

  const balance = walletQuery.data?.balance ?? 0;
  const txns = walletQuery.data?.transactions ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Wallet' }} />
      <FlatList
        data={txns}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <Card style={styles.balanceCard}>
              <View style={styles.balanceRow}>
                <View style={styles.balanceIconWrap}>
                  <Ionicons name="wallet" size={22} color={colors.white} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.balanceLabel}>Available balance</Text>
                  {walletQuery.isLoading ? (
                    <Skeleton width={140} height={32} />
                  ) : (
                    <Text style={styles.balanceValue}>{formatRupees(balance)}</Text>
                  )}
                </View>
              </View>
              <Text style={styles.balanceHint}>
                Refunds from cancelled orders and promo credits land here automatically.
              </Text>
            </Card>
            <Text style={styles.sectionLabel}>Recent activity</Text>
          </View>
        }
        renderItem={({ item }) => <TxnRow t={item} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          walletQuery.isLoading ? (
            <View style={styles.skeletonWrap}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} width="100%" height={64} radius={radius.md} />
              ))}
            </View>
          ) : walletQuery.isError ? (
            <View style={{ paddingHorizontal: spacing.lg }}>
              <Text style={styles.errorText}>
                Couldn&apos;t load your wallet. Pull to refresh.
              </Text>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <EmptyState
                emoji="💸"
                title="No transactions yet"
                subtitle="Once you receive a refund or apply a promo credit, it shows up here."
              />
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

function TxnRow({ t }: { t: WalletTxn }) {
  const tint = KIND_TINT[t.kind];
  const credit = t.amount > 0;
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => (t.orderId ? router.push(`/order/${t.orderId}` as never) : null)}
      disabled={!t.orderId}
      style={styles.txnRow}
    >
      <View style={[styles.txnIconWrap, { backgroundColor: tint.bg }]}>
        <Ionicons name={KIND_ICON[t.kind]} size={18} color={tint.fg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.txnTitle} numberOfLines={1}>
          {KIND_LABEL[t.kind]}
        </Text>
        <Text style={styles.txnMeta} numberOfLines={1}>
          {t.note ?? formatDate(t.createdAt)}
          {t.orderId ? ` · #${t.orderId.slice(-6).toUpperCase()}` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.txnAmount, credit ? styles.txnCredit : styles.txnDebit]}>
          {credit ? '+' : ''}
          {formatRupees(t.amount)}
        </Text>
        <Text style={styles.txnBalance}>bal {formatRupees(t.balanceAfter)}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxxl },
  headerBlock: { padding: spacing.lg, gap: spacing.md },
  balanceCard: {
    padding: spacing.lg,
    backgroundColor: colors.primary,
  },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  balanceIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  balanceValue: {
    fontSize: fontSize.display,
    fontWeight: '800',
    color: colors.white,
    marginTop: 2,
  },
  balanceHint: {
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.85)',
    marginTop: spacing.md,
    lineHeight: 16,
  },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },
  txnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.card,
  },
  txnIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txnTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  txnMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  txnAmount: { fontSize: fontSize.sm, fontWeight: '800' },
  txnCredit: { color: colors.success },
  txnDebit: { color: colors.error },
  txnBalance: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  separator: { height: 1, backgroundColor: colors.divider, marginLeft: spacing.lg + 36 + spacing.md },
  skeletonWrap: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  emptyWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.xxxl },
  errorText: {
    fontSize: fontSize.sm,
    color: colors.error,
    textAlign: 'center',
    padding: spacing.lg,
  },
});
