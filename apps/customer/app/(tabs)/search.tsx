import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { apiClient } from '@/lib/api';
import { colors, fontSize, fontWeight, radius, shadow, spacing } from '@/constants/theme';
import { ItemCategory, ItemCategoryLabels } from '@aks/shared';

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

const CATEGORY_EMOJI: Record<ItemCategory, string> = {
  GROCERY: '🛒',
  MEDICINE: '💊',
  HOUSEHOLD: '🧹',
  SNACKS: '🍿',
  BEVERAGES: '🥤',
  OTHER: '📦',
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

interface CatalogItem {
  id: string;
  name: string;
  category: ItemCategory;
  imageUrl?: string | null;
  defaultUnit?: string;
  description?: string | null;
  _count?: { storeItems: number };
}

function unwrapOne<T>(payload: unknown): T {
  if (payload && typeof payload === 'object') {
    const o = payload as { data?: unknown };
    if (o.data !== undefined) return o.data as T;
  }
  return payload as T;
}

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

async function fetchCatalogSearch(q: string): Promise<CatalogItem[]> {
  const res = await apiClient.get(`/api/v1/catalog/search/q?q=${encodeURIComponent(q)}`);
  return unwrapList<CatalogItem>(res.data, 'items');
}

async function fetchCatalogByCategory(
  category: ItemCategory | 'ALL'
): Promise<CatalogItem[]> {
  const search = new URLSearchParams();
  search.set('limit', '50');
  search.set('page', '1');
  if (category !== 'ALL') search.set('category', category);
  const res = await apiClient.get(`/api/v1/catalog?${search.toString()}`);
  const data = unwrapOne<{ items?: CatalogItem[] } | CatalogItem[]>(res.data);
  if (Array.isArray(data)) return data;
  return data.items ?? [];
}

function CatalogResultRow({ item }: { item: CatalogItem }) {
  const carriedBy = item._count?.storeItems ?? 0;
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      style={styles.resultRow}
      onPress={() => router.push(`/catalog/${item.id}`)}
    >
      <View style={styles.resultThumb}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.resultImage} resizeMode="cover" />
        ) : (
          <Text style={styles.resultEmoji}>{CATEGORY_EMOJI[item.category]}</Text>
        )}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.resultName} numberOfLines={2}>
          {item.name}
        </Text>
        <View style={styles.resultBadge}>
          <Text style={styles.resultBadgeText}>{ItemCategoryLabels[item.category]}</Text>
        </View>
        <Text style={styles.resultSubtitle}>
          Carried by {carriedBy} store{carriedBy === 1 ? '' : 's'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
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
  const isSearching = debouncedQuery.length > 0;

  const searchQuery = useQuery({
    queryKey: ['catalog-search', debouncedQuery],
    queryFn: () => fetchCatalogSearch(debouncedQuery),
    enabled: isSearching,
  });

  const categoryQuery = useQuery({
    queryKey: ['catalog-by-category', activeCategory],
    queryFn: () => fetchCatalogByCategory(activeCategory),
    enabled: !isSearching && activeCategory !== 'ALL',
  });

  // For idle "popular items" preview, fetch a small slice of catalog
  const popularQuery = useQuery({
    queryKey: ['catalog-popular-preview'],
    queryFn: () => fetchCatalogByCategory('ALL'),
    enabled: !isSearching && activeCategory === 'ALL',
  });

  const showResults = isSearching || activeCategory !== 'ALL';

  const results: CatalogItem[] = isSearching
    ? searchQuery.data ?? []
    : categoryQuery.data ?? [];

  const isResultsLoading = isSearching ? searchQuery.isLoading : categoryQuery.isLoading;

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

      {/* Category chips */}
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

          {!popularQuery.isLoading && (popularQuery.data?.length ?? 0) > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Popular items</Text>
                <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/catalog')}>
                  <Text style={styles.clearLink}>Browse all</Text>
                </TouchableOpacity>
              </View>
              <View style={{ gap: spacing.md }}>
                {(popularQuery.data ?? []).slice(0, 4).map((item) => (
                  <CatalogResultRow key={item.id} item={item} />
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      ) : isResultsLoading ? (
        <View style={styles.listContent}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ marginBottom: spacing.md }}>
              <Skeleton width="100%" height={104} radius={radius.lg} />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            results.length > 0 ? (
              <View style={styles.resultHeader}>
                <Text style={styles.resultCount}>
                  {results.length} result{results.length === 1 ? '' : 's'}
                  {debouncedQuery ? ` for "${debouncedQuery}"` : ''}
                </Text>
                {(debouncedQuery || activeCategory !== 'ALL') && (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      setQuery('');
                      setActiveCategory('ALL');
                    }}
                  >
                    <Text style={styles.clearLink}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null
          }
          renderItem={({ item }) => <CatalogResultRow item={item} />}
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
                actionLabel="Clear filters"
                onAction={() => {
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
    fontWeight: fontWeight.semibold,
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
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
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
    fontWeight: fontWeight.semibold,
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
    fontWeight: fontWeight.semibold,
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
    fontWeight: fontWeight.semibold,
    flex: 1,
  },
  clearLink: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },

  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    ...shadow.small,
  },
  resultThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  resultImage: {
    width: '100%',
    height: '100%',
  },
  resultEmoji: {
    fontSize: 28,
  },
  resultName: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  resultBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  resultBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  resultSubtitle: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
});
