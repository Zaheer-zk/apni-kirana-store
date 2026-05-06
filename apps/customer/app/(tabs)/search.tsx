import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '@/components/EmptyState';
import { ItemCard } from '@/components/ItemCard';
import { Skeleton } from '@/components/Skeleton';
import { apiClient } from '@/lib/api';
import { colors, fontSize, radius, spacing } from '@/constants/theme';
import { ItemCategory, ItemCategoryLabels, type InventoryItem, type StoreProfile } from '@aks/shared';

const DEFAULT_LAT = 28.6315;
const DEFAULT_LNG = 77.2167;
const TRENDING = ['Rice', 'Maggi', 'Paracetamol', 'Bread', 'Milk', 'Sugar'];

const CATEGORY_CHIPS: Array<{ label: string; value: ItemCategory | 'ALL' }> = [
  { label: 'All', value: 'ALL' },
  ...Object.values(ItemCategory).map((c) => ({ label: ItemCategoryLabels[c], value: c })),
];

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

async function fetchAllItems(): Promise<InventoryItem[]> {
  const storesRes = await apiClient.get<{ data: StoreProfile[] } | StoreProfile[]>(
    `/api/v1/stores/nearby?lat=${DEFAULT_LAT}&lng=${DEFAULT_LNG}`
  );
  const sPayload = storesRes.data as unknown;
  const stores: StoreProfile[] = Array.isArray(sPayload)
    ? (sPayload as StoreProfile[])
    : ((sPayload as { data?: StoreProfile[] }).data ?? []);

  const allItems = await Promise.all(
    stores.map(async (s) => {
      try {
        const r = await apiClient.get<{ data: InventoryItem[] } | InventoryItem[]>(
          `/api/v1/stores/${s.id}/items`
        );
        const payload = r.data as unknown;
        return Array.isArray(payload)
          ? (payload as InventoryItem[])
          : ((payload as { data?: InventoryItem[] }).data ?? []);
      } catch {
        return [];
      }
    })
  );
  return allItems.flat();
}

export default function SearchScreen() {
  const params = useLocalSearchParams<{ category?: string; storeId?: string }>();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<ItemCategory | 'ALL'>(
    (params.category as ItemCategory) ?? 'ALL'
  );

  useEffect(() => {
    if (params.category) {
      setActiveCategory(params.category as ItemCategory);
    }
  }, [params.category]);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []);

  const debouncedQuery = useDebounced(query.trim(), 400);

  const itemsQuery = useQuery({
    queryKey: ['all-items'],
    queryFn: fetchAllItems,
  });

  const allItems = itemsQuery.data ?? [];

  const filtered = useMemo(() => {
    let result = allItems.filter((i) => i.isAvailable);
    if (activeCategory !== 'ALL') {
      result = result.filter((i) => i.category === activeCategory);
    }
    if (params.storeId) {
      result = result.filter((i) => i.storeId === params.storeId);
    }
    if (debouncedQuery) {
      const q = debouncedQuery.toLowerCase();
      result = result.filter((i) => i.name.toLowerCase().includes(q));
    }
    return result;
  }, [allItems, activeCategory, debouncedQuery, params.storeId]);

  const hasFilters = !!debouncedQuery || activeCategory !== 'ALL' || !!params.storeId;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          activeOpacity={0.7}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/(tabs)/home');
          }}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search items, brands..."
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
          />
          {query.length > 0 ? (
            <TouchableOpacity activeOpacity={0.7} onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {CATEGORY_CHIPS.map((c) => {
          const active = activeCategory === c.value;
          return (
            <TouchableOpacity
              key={c.value}
              activeOpacity={0.7}
              onPress={() => setActiveCategory(c.value)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Results */}
      {!hasFilters ? (
        <ScrollView contentContainerStyle={styles.idleContent}>
          <Text style={styles.idleHeading}>Trending searches</Text>
          <View style={styles.trendingWrap}>
            {TRENDING.map((t) => (
              <TouchableOpacity
                key={t}
                activeOpacity={0.7}
                style={styles.trendingChip}
                onPress={() => setQuery(t)}
              >
                <Ionicons name="trending-up" size={14} color={colors.primary} />
                <Text style={styles.trendingText}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      ) : itemsQuery.isLoading ? (
        <View style={styles.listContent}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ marginBottom: spacing.md }}>
              <Skeleton width="100%" height={104} radius={12} />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          ListHeaderComponent={
            filtered.length > 0 ? (
              <Text style={styles.resultCount}>
                {filtered.length} result{filtered.length === 1 ? '' : 's'}
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <ItemCard item={item} onPress={() => router.push(`/item/${item.id}`)} />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="bag-handle-outline"
              title="No items found"
              subtitle={
                debouncedQuery
                  ? `No items match "${debouncedQuery}". Try a different search.`
                  : 'Try a different category or search term.'
              }
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    minHeight: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },
  chipsRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginRight: spacing.sm,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.white,
  },
  idleContent: {
    padding: spacing.lg,
  },
  idleHeading: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  trendingWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  trendingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
  },
  trendingText: {
    fontSize: fontSize.sm,
    color: colors.primaryDark,
    fontWeight: '600',
  },
  listContent: {
    padding: spacing.lg,
    flexGrow: 1,
  },
  resultCount: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
});
