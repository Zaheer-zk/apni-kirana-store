import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api } from '@/lib/api';
import { useStorePortalStore } from '@/store/store.store';
import { Card } from '@/components/Card';
import { Skeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';

interface Wholesaler {
  id: string;
  name: string;
  description: string | null;
  category: string;
  city: string;
  rating: number;
  isOpen: boolean;
  itemCount: number;
  distanceKm: number | null;
}

function unwrapList(body: any): Wholesaler[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  return [];
}

function WholesalerCard({ item }: { item: Wholesaler }) {
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={() => router.push(`/restock/${item.id}`)}>
      <Card padding={spacing.md}>
        <View style={styles.row}>
          <View style={styles.icon}>
            <Ionicons name="business" size={24} color={colors.primary} />
          </View>
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {item.city} · {item.itemCount} item{item.itemCount === 1 ? '' : 's'}
              {item.distanceKm != null ? ` · ${item.distanceKm} km` : ''}
            </Text>
            <View style={[styles.statusPill, item.isOpen ? styles.openPill : styles.closedPill]}>
              <Text style={[styles.statusText, item.isOpen ? styles.openText : styles.closedText]}>
                {item.isOpen ? 'Open now' : 'Closed'}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </View>
      </Card>
    </TouchableOpacity>
  );
}

export default function RestockScreen() {
  const storeProfile = useStorePortalStore((s) => s.storeProfile);
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery<Wholesaler[]>({
    queryKey: ['wholesalers'],
    queryFn: async () => {
      const params: Record<string, number> = {};
      if (storeProfile?.lat != null && storeProfile?.lng != null) {
        params.lat = storeProfile.lat;
        params.lng = storeProfile.lng;
      }
      const res = await api.get('/api/v1/wholesalers', { params });
      return unwrapList(res.data);
    },
    staleTime: 1000 * 60,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Restock</Text>
          <Text style={styles.subtitle}>Order stock from wholesalers</Text>
        </View>
        <TouchableOpacity
          style={styles.ordersBtn}
          activeOpacity={0.7}
          onPress={() => router.push('/restock/orders')}
        >
          <Ionicons name="receipt-outline" size={16} color={colors.primary} />
          <Text style={styles.ordersBtnText}>My orders</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.list}>
          {[0, 1, 2].map((n) => (
            <Card key={n} padding={spacing.md}>
              <View style={styles.row}>
                <Skeleton width={52} height={52} radius={radius.md} />
                <View style={{ flex: 1, gap: 6 }}>
                  <Skeleton width="60%" height={14} />
                  <Skeleton width="40%" height={12} />
                </View>
              </View>
            </Card>
          ))}
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(w) => w.id}
          renderItem={({ item }) => <WholesalerCard item={item} />}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <EmptyState
              icon={isError ? 'cloud-offline-outline' : 'business-outline'}
              title={isError ? 'Could not load wholesalers' : 'No wholesalers yet'}
              subtitle={
                isError
                  ? 'Pull down to retry.'
                  : 'No wholesalers are available in your area right now.'
              }
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  title: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.textPrimary },
  subtitle: { marginTop: 2, fontSize: fontSize.sm, color: colors.textSecondary },
  ordersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
  },
  ordersBtnText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '700' },
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md, flexGrow: 1 },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: { flex: 1, gap: 3 },
  name: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  meta: { fontSize: fontSize.xs, color: colors.textMuted },
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginTop: 2,
  },
  openPill: { backgroundColor: '#DCFCE7' },
  closedPill: { backgroundColor: colors.gray100 },
  statusText: { fontSize: 10, fontWeight: '700' },
  openText: { color: '#15803D' },
  closedText: { color: colors.textMuted },
});
