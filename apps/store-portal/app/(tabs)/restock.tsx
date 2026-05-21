import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api } from '@/lib/api';
import {
  useRestockCart,
  restockCartCount,
  type RestockCartItem,
} from '@/store/restock-cart.store';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import { Skeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';

interface CatalogItem {
  id: string;
  name: string;
  category: string;
  defaultUnit?: string;
  unit?: string;
  imageUrl?: string | null;
}

function unwrapList(body: any): CatalogItem[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.items)) return body.items;
  if (Array.isArray(body?.data?.items)) return body.data.items;
  if (Array.isArray(body?.data)) return body.data;
  return [];
}

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function QtyStepper({ qty, onChange }: { qty: number; onChange: (n: number) => void }) {
  if (qty <= 0) {
    return (
      <TouchableOpacity activeOpacity={0.7} style={styles.addBtn} onPress={() => onChange(1)}>
        <Ionicons name="add" size={16} color={colors.white} />
        <Text style={styles.addBtnText}>Add</Text>
      </TouchableOpacity>
    );
  }
  return (
    <View style={styles.stepper}>
      <TouchableOpacity style={styles.stepBtn} activeOpacity={0.7} onPress={() => onChange(qty - 1)}>
        <Ionicons name="remove" size={16} color={colors.primary} />
      </TouchableOpacity>
      <Text style={styles.stepQty}>{qty}</Text>
      <TouchableOpacity style={styles.stepBtn} activeOpacity={0.7} onPress={() => onChange(qty + 1)}>
        <Ionicons name="add" size={16} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

export default function RestockScreen() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search.trim(), 300);

  const cartItems = useRestockCart((s) => s.items);
  const setQty = useRestockCart((s) => s.setQty);
  const count = useMemo(() => restockCartCount(cartItems), [cartItems]);

  const { data, isLoading, isError } = useQuery<CatalogItem[]>({
    queryKey: ['restock-catalog', debouncedSearch],
    queryFn: async () => {
      if (debouncedSearch) {
        const res = await api.get('/api/v1/catalog/search/q', { params: { q: debouncedSearch } });
        return unwrapList(res.data);
      }
      const res = await api.get('/api/v1/catalog', { params: { page: 1, limit: 100 } });
      return unwrapList(res.data);
    },
    staleTime: 1000 * 30,
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Restock</Text>
          <Text style={styles.subtitle}>Order stock — we find the best wholesaler</Text>
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

      <View style={styles.searchWrap}>
        <Input
          placeholder="Search items to restock..."
          value={search}
          onChangeText={setSearch}
          leftIcon="search"
          rightIcon={search ? 'close-circle' : undefined}
          onRightIconPress={() => setSearch('')}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>

      {isLoading ? (
        <View style={styles.list}>
          {[0, 1, 2, 3].map((n) => (
            <Card key={n} padding={spacing.md}>
              <View style={styles.row}>
                <Skeleton width={48} height={48} radius={radius.md} />
                <View style={{ flex: 1, gap: 6 }}>
                  <Skeleton width="65%" height={14} />
                  <Skeleton width="40%" height={12} />
                </View>
              </View>
            </Card>
          ))}
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => {
            const unit = item.defaultUnit ?? item.unit ?? '';
            const inCart = cartItems[item.id]?.qty ?? 0;
            const cartItem: Omit<RestockCartItem, 'qty'> = {
              catalogItemId: item.id,
              name: item.name,
              unit,
              category: item.category,
              imageUrl: item.imageUrl ?? null,
            };
            return (
              <Card padding={spacing.md}>
                <View style={styles.row}>
                  <View style={styles.thumb}>
                    <Ionicons name="cube" size={22} color={colors.primary} />
                  </View>
                  <View style={styles.info}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.meta}>
                      {unit ? `${unit} · ` : ''}
                      {item.category}
                    </Text>
                  </View>
                  <QtyStepper qty={inCart} onChange={(n) => setQty(cartItem, n)} />
                </View>
              </Card>
            );
          }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon={isError ? 'cloud-offline-outline' : 'cube-outline'}
              title={isError ? 'Could not load catalog' : 'No items found'}
              subtitle={
                isError
                  ? 'Please try again.'
                  : debouncedSearch
                    ? 'No catalog items match your search.'
                    : 'The catalog is empty.'
              }
            />
          }
        />
      )}

      {count > 0 && (
        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.cartBar}
          onPress={() => router.push('/restock/cart')}
        >
          <View style={styles.cartBadge}>
            <Text style={styles.cartBadgeText}>{count}</Text>
          </View>
          <Text style={styles.cartBarText}>Review restock order</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.white} />
        </TouchableOpacity>
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
    paddingBottom: spacing.sm,
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
  searchWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  list: { padding: spacing.lg, paddingBottom: 120, gap: spacing.md, flexGrow: 1 },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: { flex: 1, gap: 2 },
  name: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  meta: { fontSize: fontSize.xs, color: colors.textMuted },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    ...shadow.small,
  },
  addBtnText: { color: colors.white, fontSize: fontSize.sm, fontWeight: '700' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    paddingHorizontal: 4,
  },
  stepBtn: { padding: 6 },
  stepQty: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.textPrimary,
    minWidth: 20,
    textAlign: 'center',
  },

  cartBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    ...shadow.medium,
  },
  cartBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  cartBadgeText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '800' },
  cartBarText: { flex: 1, color: colors.white, fontSize: fontSize.md, fontWeight: '700' },
});
