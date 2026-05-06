import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useStorePortalStore } from '@/store/store.store';

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
      // Tolerant unwrap: { success, data: { items } } | { items } | StoreInventoryItem[]
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
  return (
    <TouchableOpacity style={styles.card} onPress={onEdit} activeOpacity={0.85}>
      <View style={styles.cardImagePlaceholder}>
        <Text style={styles.cardImageEmoji}>🛒</Text>
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.cardMeta}>
          {item.unit} · {item.category}
        </Text>
        <View style={styles.cardPriceRow}>
          <Text style={styles.cardPrice}>₹{Number(item.price).toFixed(2)}</Text>
          <Text style={styles.cardStock}>
            Stock:{' '}
            <Text style={[styles.cardStockValue, item.stockQty === 0 && styles.outOfStock]}>
              {item.stockQty}
            </Text>
          </Text>
        </View>
      </View>
      <View style={styles.cardRight}>
        <Switch
          value={item.isAvailable}
          onValueChange={onToggleAvailability}
          trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
          thumbColor={item.isAvailable ? '#2563EB' : '#9CA3AF'}
        />
        <TouchableOpacity onPress={onDelete} style={styles.deleteBtn} hitSlop={8}>
          <Text style={styles.deleteBtnText}>Remove</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
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
    Alert.alert('Remove Product', `Remove "${name}" from your store?`, [
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
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Products</Text>
        <Text style={styles.itemCount}>{items?.length ?? 0} items</Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search my products..."
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Category Filter */}
      <FlatList
        horizontal
        data={CATEGORY_FILTERS}
        keyExtractor={(item) => item.value}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.filterChip, categoryFilter === item.value && styles.filterChipActive]}
            onPress={() => setCategoryFilter(item.value)}
          >
            <Text
              style={[
                styles.filterChipText,
                categoryFilter === item.value && styles.filterChipTextActive,
              ]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.filterList}
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
      />

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
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
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📦</Text>
              <Text style={styles.emptyText}>
                {search ? 'No products match your search' : 'No products yet'}
              </Text>
              {!search && (
                <>
                  <Text style={styles.emptySubtext}>Browse the catalog to add items</Text>
                  <TouchableOpacity
                    style={styles.emptyCta}
                    onPress={() => router.push('/inventory/browse-catalog')}
                  >
                    <Text style={styles.emptyCtaText}>Browse Catalog</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/inventory/browse-catalog')}
        activeOpacity={0.85}
      >
        <Text style={styles.fabPlus}>+</Text>
        <Text style={styles.fabText}>Add from catalog</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  itemCount: { fontSize: 13, color: '#9CA3AF', fontWeight: '600' },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },
  filterBar: { maxHeight: 56 },
  filterList: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  filterChipActive: { backgroundColor: '#EFF6FF', borderColor: '#2563EB' },
  filterChipText: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
  filterChipTextActive: { color: '#2563EB' },
  list: { padding: 16, gap: 10, paddingBottom: 110 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { alignItems: 'center', paddingTop: 64 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 15, color: '#374151', fontWeight: '600' },
  emptySubtext: { fontSize: 13, color: '#9CA3AF', marginTop: 4 },
  emptyCta: {
    marginTop: 16,
    backgroundColor: '#2563EB',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  emptyCtaText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardImagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardImageEmoji: { fontSize: 26 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 },
  cardMeta: { fontSize: 12, color: '#9CA3AF', marginBottom: 4 },
  cardPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardPrice: { fontSize: 15, fontWeight: '800', color: '#111827' },
  cardStock: { fontSize: 12, color: '#9CA3AF' },
  cardStockValue: { color: '#6B7280', fontWeight: '700' },
  outOfStock: { color: '#DC2626' },
  cardRight: { alignItems: 'center', gap: 6 },
  deleteBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  deleteBtnText: { color: '#DC2626', fontSize: 11, fontWeight: '700' },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 24,
    height: 52,
    paddingHorizontal: 18,
    borderRadius: 26,
    backgroundColor: '#2563EB',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#2563EB',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fabPlus: { fontSize: 22, color: '#fff', fontWeight: '300', lineHeight: 24 },
  fabText: { fontSize: 14, color: '#fff', fontWeight: '700' },
});
