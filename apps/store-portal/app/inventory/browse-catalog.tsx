import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useStorePortalStore } from '@/store/store.store';
import { useMyInventory } from '@/app/(tabs)/inventory';
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
  const [errors, setErrors] = useState<{ price?: string; stockQty?: string }>({});

  useEffect(() => {
    if (visible) {
      setPrice('');
      setStockQty('');
      setErrors({});
    }
  }, [visible, catalogItem?.id]);

  const handleSubmit = () => {
    const next: { price?: string; stockQty?: string } = {};
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) next.price = 'Enter a valid price';
    const stockNum = parseInt(stockQty, 10);
    if (isNaN(stockNum) || stockNum < 0) next.stockQty = 'Enter a valid stock quantity';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onSubmit(priceNum, stockNum);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={modalStyles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={modalStyles.kavWrap}
        >
          <Pressable onPress={() => {}}>
            <Card padding={spacing.xl} style={modalStyles.sheet}>
              <View style={modalStyles.sheetHeader}>
                <Text style={modalStyles.title}>Add to my store</Text>
                <TouchableOpacity onPress={onClose} activeOpacity={0.7} hitSlop={8}>
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {catalogItem && (
                <View style={modalStyles.itemRow}>
                  <View style={modalStyles.itemThumb}>
                    <Ionicons name="cube" size={22} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={modalStyles.itemName} numberOfLines={2}>
                      {catalogItem.name}
                    </Text>
                    <Text style={modalStyles.itemMeta}>
                      {catalogItem.unit} · {catalogItem.category}
                    </Text>
                  </View>
                </View>
              )}

              <View style={{ gap: spacing.md, marginTop: spacing.md }}>
                <Input
                  label="Price (₹) *"
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  value={price}
                  onChangeText={(v) => {
                    setPrice(v);
                    if (errors.price) setErrors({ ...errors, price: undefined });
                  }}
                  autoFocus
                  error={errors.price}
                />
                <Input
                  label="Stock quantity *"
                  placeholder="0"
                  keyboardType="number-pad"
                  value={stockQty}
                  onChangeText={(v) => {
                    setStockQty(v);
                    if (errors.stockQty) setErrors({ ...errors, stockQty: undefined });
                  }}
                  error={errors.stockQty}
                />
              </View>

              <View style={modalStyles.actions}>
                <Button
                  variant="ghost"
                  title="Cancel"
                  onPress={onClose}
                  disabled={isSubmitting}
                  fullWidth
                  style={modalStyles.actionBtn}
                />
                <Button
                  variant="primary"
                  title="Add to my store"
                  onPress={handleSubmit}
                  loading={isSubmitting}
                  disabled={isSubmitting}
                  fullWidth
                  style={modalStyles.actionBtn}
                />
              </View>
            </Card>
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
    <Card padding={spacing.md}>
      <View style={styles.row}>
        <View style={styles.rowImage}>
          <Ionicons name="cube" size={24} color={colors.primary} />
        </View>
        <View style={styles.rowInfo}>
          <Text style={styles.rowName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.rowMeta}>
            {item.unit} · {item.category}
          </Text>
          {carryCount > 0 ? (
            <Text style={styles.rowHint}>
              Carried by {carryCount} store{carryCount !== 1 ? 's' : ''}
            </Text>
          ) : null}
        </View>
        {alreadyAdded ? (
          <Badge variant="success" text="Added" dot />
        ) : (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onAdd}
            style={styles.addBtn}
          >
            <Ionicons name="add" size={18} color={colors.white} />
            <Text style={styles.addBtnText}>Add</Text>
          </TouchableOpacity>
        )}
      </View>
    </Card>
  );
}

function RowSkeleton() {
  return (
    <Card padding={spacing.md}>
      <View style={styles.row}>
        <Skeleton width={52} height={52} radius={radius.md} />
        <View style={{ flex: 1, gap: 6 }}>
          <Skeleton width="70%" height={14} />
          <Skeleton width="40%" height={12} />
        </View>
      </View>
    </Card>
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
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      {/* Sticky search */}
      <View style={styles.searchWrap}>
        <Input
          placeholder="Search catalog..."
          value={search}
          onChangeText={setSearch}
          leftIcon="search"
          rightIcon={search ? 'close-circle' : undefined}
          onRightIconPress={() => setSearch('')}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>

      <FlatList
        horizontal
        data={CATEGORY_FILTERS}
        keyExtractor={(i) => i.value}
        renderItem={({ item }) => {
          const isActive = category === item.value;
          return (
            <TouchableOpacity
              activeOpacity={0.7}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => setCategory(item.value)}
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
          data={visible}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <CatalogRow
              item={item}
              alreadyAdded={myCatalogIds.has(item.id)}
              onAdd={() => setModalItem(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title={debouncedSearch ? 'No results' : 'No items in this category'}
              subtitle={
                debouncedSearch
                  ? 'Try a different search term.'
                  : 'Try a different category.'
              }
            />
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
  safe: { flex: 1, backgroundColor: colors.background },
  searchWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: 100,
    paddingBottom: spacing.sm,
  },
  filterBar: { maxHeight: 56, flexGrow: 0 },
  filterList: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm },
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
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
    flexGrow: 1,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowImage: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowInfo: { flex: 1 },
  rowName: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  rowMeta: { fontSize: fontSize.xs, color: colors.textMuted },
  rowHint: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },

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
});

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  kavWrap: { width: '100%' },
  sheet: {
    gap: spacing.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: fontSize.lg, fontWeight: '800', color: colors.textPrimary },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.gray100,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  itemThumb: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemName: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  itemMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  actionBtn: { flex: 1 },
});
