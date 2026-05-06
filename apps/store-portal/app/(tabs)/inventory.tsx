import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useStorePortalStore } from '@/store/store.store';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Skeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface StoreInventoryItem {
  id: string;
  storeId: string;
  catalogItemId: string;
  name: string;
  category: string;
  unit: string;
  price: number;
  stockQty: number;
  isAvailable: boolean;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface PaginatedItemsResponse {
  items: StoreInventoryItem[];
  total: number;
  page: number;
  pages?: number;
}

// ---------------------------------------------------------------------------
// Filter chips
// ---------------------------------------------------------------------------
const CATEGORY_FILTERS: { label: string; value: string }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Grocery', value: 'GROCERY' },
  { label: 'Dairy', value: 'DAIRY' },
  { label: 'Beverages', value: 'BEVERAGES' },
  { label: 'Snacks', value: 'SNACKS' },
  { label: 'Personal Care', value: 'PERSONAL_CARE' },
  { label: 'Household', value: 'HOUSEHOLD' },
];

// ---------------------------------------------------------------------------
// Hook: fetch the signed-in store owner's inventory using their storeId
// ---------------------------------------------------------------------------
export function useMyInventory() {
  const storeId = useStorePortalStore((s) => s.storeProfile?.id);

  return useQuery<StoreInventoryItem[]>({
    queryKey: ['storeInventory', storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<PaginatedItemsResponse> | PaginatedItemsResponse | StoreInventoryItem[]>(
        `/api/v1/stores/${storeId}/items`,
        { params: { limit: 200 } }
      );
      const body = res.data as any;
      if (Array.isArray(body)) return body as StoreInventoryItem[];
      if (Array.isArray(body?.items)) return body.items as StoreInventoryItem[];
      if (Array.isArray(body?.data?.items)) return body.data.items as StoreInventoryItem[];
      if (Array.isArray(body?.data)) return body.data as StoreInventoryItem[];
      return [];
    },
  });
}

// ---------------------------------------------------------------------------
// Inventory row card
// ---------------------------------------------------------------------------
interface RowProps {
  item: StoreInventoryItem;
  onToggleAvailability: (next: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}

function InventoryRow({ item, onToggleAvailability, onEdit, onDelete }: RowProps) {
  const outOfStock = item.stockQty === 0;
  return (
    <TouchableOpacity onPress={onEdit} activeOpacity={0.7}>
      <Card padding={spacing.md}>
        <View style={styles.row}>
          <View style={styles.thumb}>
            <Ionicons name="cube" size={26} color={colors.primary} />
          </View>
          <View style={styles.rowInfo}>
            <Text style={styles.rowName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.rowMeta}>
              {item.unit} · {item.category}
            </Text>
            <View style={styles.rowFooter}>
              <Text style={styles.rowPrice}>₹{Number(item.price).toFixed(2)}</Text>
              {outOfStock ? (
                <Badge variant="error" text="Out of stock" />
              ) : (
                <Text style={styles.rowStock}>
                  Stock: <Text style={styles.rowStockValue}>{item.stockQty}</Text>
                </Text>
              )}
            </View>
          </View>
          <View style={styles.rowRight}>
            <Switch
              value={item.isAvailable}
              onValueChange={onToggleAvailability}
              trackColor={{ false: colors.gray300, true: colors.primaryLight }}
              thumbColor={item.isAvailable ? colors.primary : colors.gray400}
            />
            <TouchableOpacity onPress={onDelete} activeOpacity={0.7} hitSlop={8}>
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

function RowSkeleton() {
  return (
    <Card padding={spacing.md}>
      <View style={styles.row}>
        <Skeleton width={56} height={56} radius={radius.md} />
        <View style={{ flex: 1, gap: 6 }}>
          <Skeleton width="60%" height={14} />
          <Skeleton width="40%" height={12} />
          <Skeleton width="50%" height={14} />
        </View>
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function InventoryScreen() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const queryClient = useQueryClient();
  const storeId = useStorePortalStore((s) => s.storeProfile?.id);

  const { data: items, isLoading, refetch, isRefetching } = useMyInventory();

  const toggleAvailabilityMutation = useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      api
        .put(`/api/v1/items/${id}/toggle-availability`, { isAvailable })
        .then((r) => r.data),
    onMutate: async ({ id, isAvailable }) => {
      await queryClient.cancelQueries({ queryKey: ['storeInventory', storeId] });
      const previous = queryClient.getQueryData<StoreInventoryItem[]>(['storeInventory', storeId]);
      queryClient.setQueryData<StoreInventoryItem[]>(['storeInventory', storeId], (old) =>
        (old ?? []).map((it) => (it.id === id ? { ...it, isAvailable } : it))
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['storeInventory', storeId], context.previous);
      }
      Alert.alert('Error', 'Could not update availability');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['storeInventory', storeId] }),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/items/${id}`).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['storeInventory', storeId] }),
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Remove product', `Remove "${name}" from your store?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => deleteItemMutation.mutate(id),
      },
    ]);
  };

  const filtered = (items ?? []).filter((item) => {
    const matchesSearch =
      search.trim() === '' ||
      item.name.toLowerCase().includes(search.toLowerCase().trim());
    const matchesCategory = categoryFilter === 'ALL' || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>My products</Text>
          <Text style={styles.headerCount}>
            {items?.length ?? 0} {items?.length === 1 ? 'item' : 'items'}
          </Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Input
          placeholder="Search my products..."
          value={search}
          onChangeText={setSearch}
          leftIcon="search"
          rightIcon={search ? 'close-circle' : undefined}
          onRightIconPress={() => setSearch('')}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>

      {/* Category Filter */}
      <FlatList
        horizontal
        data={CATEGORY_FILTERS}
        keyExtractor={(item) => item.value}
        renderItem={({ item }) => {
          const isActive = categoryFilter === item.value;
          return (
            <TouchableOpacity
              activeOpacity={0.7}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => setCategoryFilter(item.value)}
            >
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={styles.filterList}
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
      />

      {isLoading ? (
        <View style={styles.list}>
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshing={isRefetching}
          onRefresh={refetch}
          renderItem={({ item }) => (
            <InventoryRow
              item={item}
              onToggleAvailability={(next) =>
                toggleAvailabilityMutation.mutate({ id: item.id, isAvailable: next })
              }
              onEdit={() => router.push(`/inventory/${item.id}`)}
              onDelete={() => handleDelete(item.id, item.name)}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="cube-outline"
              title={search ? 'No products match your search' : 'No products yet'}
              subtitle={
                search
                  ? 'Try a different search term or category.'
                  : 'Browse the catalog to add your first product.'
              }
              actionLabel={!search ? 'Browse catalog' : undefined}
              onAction={!search ? () => router.push('/inventory/browse-catalog') : undefined}
            />
          }
        />
      )}

      {/* Floating Action Button */}
      <View style={styles.fabWrap} pointerEvents="box-none">
        <Button
          title="Add from catalog"
          icon="add"
          onPress={() => router.push('/inventory/browse-catalog')}
          style={styles.fab}
          size="md"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  headerCount: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '600',
    marginTop: 2,
  },
  searchWrap: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
  filterBar: { maxHeight: 56, flexGrow: 0 },
  filterList: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, gap: spacing.sm },
  filterChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.gray100,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  filterChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  filterChipText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  filterChipTextActive: { color: colors.primaryDark, fontWeight: '700' },
  list: {
    padding: spacing.lg,
    paddingBottom: 120,
    gap: spacing.md,
    flexGrow: 1,
  },

  // row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowInfo: { flex: 1, gap: 2 },
  rowName: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  rowMeta: { fontSize: fontSize.xs, color: colors.textMuted },
  rowFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 4 },
  rowPrice: { fontSize: fontSize.md, fontWeight: '800', color: colors.textPrimary },
  rowStock: { fontSize: fontSize.xs, color: colors.textMuted },
  rowStockValue: { color: colors.textSecondary, fontWeight: '700' },
  rowRight: { alignItems: 'center', gap: spacing.xs },
  removeText: { color: colors.error, fontSize: fontSize.xs, fontWeight: '700' },

  // FAB
  fabWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.xl,
    alignItems: 'center',
  },
  fab: {
    paddingHorizontal: spacing.xl,
    height: 52,
    ...shadow.large,
  },
});
