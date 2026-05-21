import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '@/lib/api';
import {
  useRestockCart,
  restockCartCount,
  restockCartSubtotal,
} from '@/store/restock-cart.store';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import { Skeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';

interface WholesalerItem {
  id: string;
  price: number;
  stockQty: number;
  catalogItem: {
    name: string;
    defaultUnit: string;
    imageUrl: string | null;
  };
}

interface ItemsResponse {
  wholesaler: { id: string; name: string; status: string };
  items: WholesalerItem[];
}

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function QtyStepper({
  qty,
  max,
  onChange,
}: {
  qty: number;
  max: number;
  onChange: (next: number) => void;
}) {
  if (qty <= 0) {
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        style={styles.addBtn}
        disabled={max <= 0}
        onPress={() => onChange(1)}
      >
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
      <TouchableOpacity
        style={styles.stepBtn}
        activeOpacity={0.7}
        disabled={qty >= max}
        onPress={() => onChange(qty + 1)}
      >
        <Ionicons name="add" size={16} color={qty >= max ? colors.textMuted : colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

export default function WholesalerDetailScreen() {
  const { wholesalerId } = useLocalSearchParams<{ wholesalerId: string }>();
  const headerHeight = useHeaderHeight();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search.trim(), 300);

  const cartItems = useRestockCart((s) => s.items);
  const enterWholesaler = useRestockCart((s) => s.enterWholesaler);
  const setQty = useRestockCart((s) => s.setQty);

  const { data, isLoading, isError } = useQuery<ItemsResponse>({
    queryKey: ['wholesaler-items', wholesalerId, debouncedSearch],
    queryFn: async () => {
      const res = await api.get(`/api/v1/wholesalers/${wholesalerId}/items`, {
        params: { limit: 100, ...(debouncedSearch ? { q: debouncedSearch } : {}) },
      });
      return res.data?.data ?? { wholesaler: null, items: [] };
    },
    enabled: !!wholesalerId,
  });

  // Register the wholesaler with the cart (resets cart if switching wholesaler).
  useEffect(() => {
    if (data?.wholesaler) {
      enterWholesaler(data.wholesaler.id, data.wholesaler.name);
    }
  }, [data?.wholesaler, enterWholesaler]);

  const count = useMemo(() => restockCartCount(cartItems), [cartItems]);
  const subtotal = useMemo(() => restockCartSubtotal(cartItems), [cartItems]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <View style={[styles.searchWrap, { paddingTop: headerHeight + spacing.sm }]}>
        {data?.wholesaler ? <Text style={styles.wsName}>{data.wholesaler.name}</Text> : null}
        <Input
          placeholder="Search items..."
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
                  <Skeleton width="70%" height={14} />
                  <Skeleton width="40%" height={12} />
                </View>
              </View>
            </Card>
          ))}
        </View>
      ) : (
        <FlatList
          data={data?.items ?? []}
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => {
            const inCart = cartItems[item.id]?.qty ?? 0;
            const outOfStock = item.stockQty <= 0;
            return (
              <Card padding={spacing.md}>
                <View style={styles.row}>
                  <View style={styles.thumb}>
                    <Ionicons name="cube" size={22} color={colors.primary} />
                  </View>
                  <View style={styles.info}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.catalogItem.name}
                    </Text>
                    <Text style={styles.meta}>
                      ₹{item.price.toFixed(2)} / {item.catalogItem.defaultUnit}
                    </Text>
                    <Text style={[styles.stock, outOfStock && styles.stockOut]}>
                      {outOfStock ? 'Out of stock' : `${item.stockQty} in stock`}
                    </Text>
                  </View>
                  <QtyStepper
                    qty={inCart}
                    max={item.stockQty}
                    onChange={(next) =>
                      setQty(
                        {
                          storeItemId: item.id,
                          name: item.catalogItem.name,
                          unit: item.catalogItem.defaultUnit,
                          price: item.price,
                          imageUrl: item.catalogItem.imageUrl,
                          stockQty: item.stockQty,
                        },
                        next,
                      )
                    }
                  />
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
              title={isError ? 'Could not load items' : 'No items'}
              subtitle={
                isError
                  ? 'Please try again.'
                  : debouncedSearch
                    ? 'No items match your search.'
                    : 'This wholesaler has no stock listed.'
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
          <Text style={styles.cartBarText}>View cart</Text>
          <Text style={styles.cartBarTotal}>₹{subtotal.toFixed(2)}</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.white} />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  searchWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  wsName: { fontSize: fontSize.lg, fontWeight: '800', color: colors.textPrimary },
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
  meta: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  stock: { fontSize: fontSize.xs, color: colors.textMuted },
  stockOut: { color: colors.error },

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
  stepQty: { fontSize: fontSize.md, fontWeight: '800', color: colors.textPrimary, minWidth: 20, textAlign: 'center' },

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
  cartBarTotal: { color: colors.white, fontSize: fontSize.md, fontWeight: '800' },
});
