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
import { colors, fontSize, fontWeight, radius, shadow, spacing } from '@/constants/theme';
import {
  ItemCategory,
  ItemCategoryLabels,
  type InventoryItem,
  type StoreProfile,
} from '@aks/shared';

const DEFAULT_LAT = 28.6315;
const DEFAULT_LNG = 77.2167;

const TRENDING = [
  { label: 'Rice', icon: '🍚' },
  { label: 'Maggi', icon: '🍜' },
  { label: 'Paracetamol', icon: '💊' },
  { label: 'Bread', icon: '🍞' },
  { label: 'Milk', icon: '🥛' },
  { label: 'Sugar', icon: '🍬' },
  { label: 'Tea', icon: '☕' },
  { label: 'Soap', icon: '🧼' },
];

const CATEGORY_ICONS: Record<ItemCategory, keyof typeof Ionicons.glyphMap> = {
  GROCERY: 'basket-outline',
  MEDICINE: 'medkit-outline',
  HOUSEHOLD: 'home-outline',
  SNACKS: 'fast-food-outline',
  BEVERAGES: 'cafe-outline',
  OTHER: 'pricetag-outline',
};

const CATEGORY_CHIPS: Array<{
  label: string;
  value: ItemCategory | 'ALL';
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { label: 'All', value: 'ALL', icon: 'apps-outline' },
  ...Object.values(ItemCategory).map((c) => ({
    label: ItemCategoryLabels[c],
    value: c,
    icon: CATEGORY_ICONS[c],
  })),
];

function unwrapList<T>(payload: unknown, listKey?: string): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    if (Array.isArray(o.data)) return o.data as T[];
    if (o.data && typeof o.data === 'object') {
      const inner = o.data as Record<string, unknown>;
      if (listKey && Array.isArray(inner[listKey])) return inner[listKey] as T[];
      if (Array.isArray(inner.items)) return inner.items as T[];
    }
    if (listKey && Array.isArray(o[listKey])) return o[listKey] as T[];
    if (Array.isArray(o.items)) return o.items as T[];
  }
  return [];
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

async function fetchAllItems(): Promise<InventoryItem[]> {
  const storesRes = await apiClient.get(
    `/api/v1/stores/nearby?lat=${DEFAULT_LAT}&lng=${DEFAULT_LNG}`
  );
  const stores = unwrapList<StoreProfile>(storesRes.data, 'stores');

  const allItems = await Promise.all(
    stores.map(async (s) => {
      try {
        const r = await apiClient.get(`/api/v1/stores/${s.id}/items`);
        return unwrapList<InventoryItem>(r.data, 'items');
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
    if (params.category) setActiveCategory(params.category as ItemCategory);
  }, [params.category]);

  const debouncedQuery = useDebounced(query.trim(), 300);

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

  const showResults =
    !!debouncedQuery || activeCategory !== 'ALL' || !!params.storeId;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Sticky search header */}
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
          <Ionicons name="search" size={20} color={colors.primary} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search rice, medicine, snacks..."
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity activeOpacity={0.7} onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Category chips with icons */}
      <View style={styles.chipsBg}>
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
                activeOpacity={0.8}
                onPress={() => setActiveCategory(c.value)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Ionicons
                  name={c.icon}
                  size={14}
                  color={active ? colors.white : colors.textSecondary}
                />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Body */}
      {!showResults ? (
        // Idle state — trending + browse-all hint
        <ScrollView contentContainerStyle={styles.idleContent} showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Trending searches</Text>
            <View style={styles.trendingWrap}>
              {TRENDING.map((t) => (
                <TouchableOpacity
                  key={t.label}
                  activeOpacity={0.7}
                  style={styles.trendingChip}
                  onPress={() => setQuery(t.label)}
                >
                  <Text style={styles.trendingIcon}>{t.icon}</Text>
                  <Text style={styles.trendingText}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Browse by category</Text>
            <View style={styles.catGrid}>
              {Object.values(ItemCategory).map((c) => (
                <TouchableOpacity
                  key={c}
                  activeOpacity={0.8}
                  style={styles.catTile}
                  onPress={() => setActiveCategory(c)}
                >
                  <View style={styles.catIconBox}>
                    <Ionicons name={CATEGORY_ICONS[c]} size={26} color={colors.primary} />
                  </View>
                  <Text style={styles.catLabel}>{ItemCategoryLabels[c]}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {!itemsQuery.isLoading && allItems.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Popular items</Text>
              <View style={{ gap: spacing.md }}>
                {allItems
                  .filter((i) => i.isAvailable)
                  .slice(0, 4)
                  .map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      onPress={() => router.push(`/item/${item.id}`)}
                    />
                  ))}
              </View>
            </View>
          )}
        </ScrollView>
      ) : itemsQuery.isLoading ? (
        <View style={styles.listContent}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ marginBottom: spacing.md }}>
              <Skeleton width="100%" height={104} radius={radius.lg} />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            filtered.length > 0 ? (
              <View style={styles.resultHeader}>
                <Text style={styles.resultCount}>
                  {filtered.length} result{filtered.length === 1 ? '' : 's'}
                  {debouncedQuery ? ` for "${debouncedQuery}"` : ''}
                </Text>
                {(debouncedQuery || activeCategory !== 'ALL' || params.storeId) && (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      setQuery('');
                      setActiveCategory('ALL');
                      router.setParams({ storeId: undefined as never, category: undefined as never });
                    }}
                  >
                    <Text style={styles.clearLink}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <ItemCard item={item} onPress={() => router.push(`/item/${item.id}`)} />
          )}
          ListEmptyComponent={
            <View style={{ paddingTop: spacing.xxl }}>
              <EmptyState
                icon="search-outline"
                title="No items found"
                subtitle={
                  debouncedQuery
                    ? `Nothing matches "${debouncedQuery}". Try a different keyword.`
                    : 'No items in this category right now.'
                }
                ctaLabel="Clear filters"
                onCta={() => {
                  setQuery('');
                  setActiveCategory('ALL');
                }}
              />
            </View>
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
    gap: spacing.xs,
    ...shadow.small,
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
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.primaryLight,
    gap: spacing.sm,
    minHeight: 46,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },

  chipsBg: {
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  chipsRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginRight: spacing.xs,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold as '600',
  },
  chipTextActive: {
    color: colors.white,
  },

  // Idle state
  idleContent: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold as '700',
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
  trendingIcon: { fontSize: 16 },
  trendingText: {
    fontSize: fontSize.sm,
    color: colors.primaryDark,
    fontWeight: fontWeight.semibold as '600',
  },

  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  catTile: {
    width: '30%',
    alignItems: 'center',
    paddingVertical: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catIconBox: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  catLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },

  // Results
  listContent: {
    padding: spacing.lg,
    flexGrow: 1,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  resultCount: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold as '600',
    flex: 1,
  },
  clearLink: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: fontWeight.semibold as '600',
  },
});
