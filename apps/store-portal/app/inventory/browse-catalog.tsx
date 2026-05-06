import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useStorePortalStore } from '@/store/store.store';
import { useMyInventory } from '@/app/(tabs)/inventory';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CatalogItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  imageUrl?: string | null;
  _count?: { storeItems?: number };
}

interface CatalogResponse {
  items: CatalogItem[];
  total: number;
  page: number;
  pages: number;
}

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
// Tolerant unwrap for { success, data } envelope or raw response
// ---------------------------------------------------------------------------
function unwrapList(body: any): CatalogItem[] {
  if (Array.isArray(body)) return body as CatalogItem[];
  if (Array.isArray(body?.items)) return body.items as CatalogItem[];
  if (Array.isArray(body?.data?.items)) return body.data.items as CatalogItem[];
  if (Array.isArray(body?.data)) return body.data as CatalogItem[];
  return [];
}

// ---------------------------------------------------------------------------
// Debounce helper
// ---------------------------------------------------------------------------
function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Add-to-store modal
// ---------------------------------------------------------------------------
interface AddModalProps {
  visible: boolean;
  catalogItem: CatalogItem | null;
  onClose: () => void;
  onSubmit: (price: number, stockQty: number) => void;
  isSubmitting: boolean;
}

function AddToStoreModal({ visible, catalogItem, onClose, onSubmit, isSubmitting }: AddModalProps) {
  const [price, setPrice] = useState('');
  const [stockQty, setStockQty] = useState('');

  useEffect(() => {
    if (visible) {
      setPrice('');
      setStockQty('');
    }
  }, [visible, catalogItem?.id]);

  const handleSubmit = () => {
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      return Alert.alert('Validation', 'Enter a valid price');
    }
    const stockNum = parseInt(stockQty, 10);
    if (isNaN(stockNum) || stockNum < 0) {
      return Alert.alert('Validation', 'Enter a valid stock quantity');
    }
    onSubmit(priceNum, stockNum);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={modalStyles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={modalStyles.kavWrap}
        >
          <Pressable style={modalStyles.sheet} onPress={() => {}}>
            <Text style={modalStyles.title}>Add to my store</Text>
            {catalogItem && (
              <View style={modalStyles.itemRow}>
                <Text style={modalStyles.itemName} numberOfLines={2}>
                  {catalogItem.name}
                </Text>
                <Text style={modalStyles.itemMeta}>
                  {catalogItem.unit} · {catalogItem.category}
                </Text>
              </View>
            )}

            <Text style={modalStyles.label}>Price (₹) *</Text>
            <TextInput
              style={modalStyles.input}
              placeholder="0.00"
              keyboardType="decimal-pad"
              value={price}
              onChangeText={setPrice}
              autoFocus
            />

            <Text style={modalStyles.label}>Stock quantity *</Text>
            <TextInput
              style={modalStyles.input}
              placeholder="0"
              keyboardType="number-pad"
              value={stockQty}
              onChangeText={setStockQty}
            />

            <View style={modalStyles.actions}>
              <TouchableOpacity
                style={[modalStyles.btn, modalStyles.cancelBtn]}
                onPress={onClose}
                disabled={isSubmitting}
              >
                <Text style={modalStyles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modalStyles.btn, modalStyles.submitBtn, isSubmitting && { opacity: 0.6 }]}
                onPress={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={modalStyles.submitBtnText}>Add to my store</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Catalog row
// ---------------------------------------------------------------------------
interface RowProps {
  item: CatalogItem;
  alreadyAdded: boolean;
  onAdd: () => void;
}

function CatalogRow({ item, alreadyAdded, onAdd }: RowProps) {
  const carryCount = item._count?.storeItems ?? 0;
  return (
    <View style={styles.row}>
      <View style={styles.rowImage}>
        <Text style={styles.rowImageEmoji}>🛒</Text>
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.rowMeta}>
          {item.unit} · {item.category}
        </Text>
        {carryCount > 0 && (
          <Text style={styles.rowHint}>Carried by {carryCount} store{carryCount !== 1 ? 's' : ''}</Text>
        )}
      </View>
      {alreadyAdded ? (
        <View style={styles.addedPill}>
          <Text style={styles.addedPillText}>✓ Added</Text>
        </View>
      ) : (
        <TouchableOpacity style={styles.addBtn} onPress={onAdd} activeOpacity={0.85}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function BrowseCatalogScreen() {
  const queryClient = useQueryClient();
  const storeId = useStorePortalStore((s) => s.storeProfile?.id);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('ALL');
  const debouncedSearch = useDebounced(search, 300);

  const [modalItem, setModalItem] = useState<CatalogItem | null>(null);

  // Inventory needed to render "Added" pill
  const { data: myInventory } = useMyInventory();
  const myCatalogIds = useMemo(
    () => new Set((myInventory ?? []).map((i) => i.catalogItemId)),
    [myInventory]
  );

  // Catalog browse / search
  const { data: catalogItems, isLoading } = useQuery<CatalogItem[]>({
    queryKey: ['catalog', debouncedSearch, category],
    queryFn: async () => {
      if (debouncedSearch.trim()) {
        const res = await api.get('/api/v1/catalog/search/q', {
          params: { q: debouncedSearch.trim() },
        });
        return unwrapList(res.data);
      }
      const res = await api.get<CatalogResponse>('/api/v1/catalog', {
        params: {
          ...(category !== 'ALL' ? { category } : {}),
          page: 1,
          limit: 100,
        },
      });
      return unwrapList(res.data);
    },
    staleTime: 1000 * 30,
  });

  // Filter by category client-side when searching (search ignores category param)
  const visible = useMemo(() => {
    if (!catalogItems) return [];
    if (category === 'ALL' || !debouncedSearch.trim()) return catalogItems;
    return catalogItems.filter((it) => it.category === category);
  }, [catalogItems, category, debouncedSearch]);

  // Add mutation
  const addMutation = useMutation({
    mutationFn: ({
      catalogItemId,
      price,
      stockQty,
    }: {
      catalogItemId: string;
      price: number;
      stockQty: number;
    }) =>
      api
        .post('/api/v1/items', { catalogItemId, price, stockQty, isAvailable: true })
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storeInventory', storeId] });
      setModalItem(null);
    },
    onError: (err: any) => {
      const msg = err?.message ?? 'Failed to add item';
      if (msg.toLowerCase().includes('already')) {
        Alert.alert('Already added', 'This item is already in your store.');
      } else {
        Alert.alert('Error', msg);
      }
    },
  });

  const handleSubmit = (price: number, stockQty: number) => {
    if (!modalItem) return;
    addMutation.mutate({ catalogItemId: modalItem.id, price, stockQty });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Sticky search */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search catalog..."
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      <FlatList
        horizontal
        data={CATEGORY_FILTERS}
        keyExtractor={(i) => i.value}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.filterChip, category === item.value && styles.filterChipActive]}
            onPress={() => setCategory(item.value)}
          >
            <Text
              style={[
                styles.filterChipText,
                category === item.value && styles.filterChipTextActive,
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
          data={visible}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <CatalogRow
              item={item}
              alreadyAdded={myCatalogIds.has(item.id)}
              onAdd={() => setModalItem(item)}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🔎</Text>
              <Text style={styles.emptyText}>
                {debouncedSearch ? 'No catalog items match your search' : 'No items in this category'}
              </Text>
            </View>
          }
        />
      )}

      <AddToStoreModal
        visible={!!modalItem}
        catalogItem={modalItem}
        onClose={() => setModalItem(null)}
        onSubmit={handleSubmit}
        isSubmitting={addMutation.isPending}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
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
  list: { padding: 16, gap: 10, paddingBottom: 32 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { alignItems: 'center', paddingTop: 64 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 15, color: '#374151', fontWeight: '600', textAlign: 'center', paddingHorizontal: 32 },

  row: {
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
  rowImage: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowImageEmoji: { fontSize: 24 },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 },
  rowMeta: { fontSize: 12, color: '#9CA3AF' },
  rowHint: { fontSize: 11, color: '#6B7280', marginTop: 2 },

  addBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  addedPill: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#16A34A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  addedPillText: { color: '#15803D', fontSize: 12, fontWeight: '700' },
});

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  kavWrap: { width: '100%' },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    gap: 4,
  },
  title: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 8 },
  itemRow: {
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  itemName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  itemMeta: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  label: { fontSize: 13, color: '#374151', fontWeight: '600', marginTop: 8, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 15,
    color: '#111827',
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  btn: { flex: 1, height: 48, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  cancelBtn: { backgroundColor: '#F3F4F6' },
  cancelBtnText: { color: '#374151', fontSize: 14, fontWeight: '700' },
  submitBtn: { backgroundColor: '#2563EB' },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
