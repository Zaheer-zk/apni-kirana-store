import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Skeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { apiClient } from '@/lib/api';
import { colors, fontSize, fontWeight, radius, shadow, spacing } from '@/constants/theme';
import { ItemCategory, ItemCategoryLabels } from '@aks/shared';

const PAGE_LIMIT = 30;

const CATEGORY_EMOJI: Record<ItemCategory, string> = {
  [ItemCategory.GROCERY]: '🛒',
  [ItemCategory.MEDICINE]: '💊',
  [ItemCategory.HOUSEHOLD]: '🧹',
  [ItemCategory.SNACKS]: '🍿',
  [ItemCategory.BEVERAGES]: '🥤',
  [ItemCategory.OTHER]: '📦',
};

const CATEGORY_CHIPS: Array<{ label: string; value: ItemCategory | 'ALL' }> = [
  { label: 'All', value: 'ALL' },
  ...Object.values(ItemCategory).map((c) => ({
    label: ItemCategoryLabels[c],
    value: c,
  })),
];

export interface CatalogItem {
  id: string;
  name: string;
  category: ItemCategory;
  description?: string | null;
  imageUrl?: string | null;
  defaultUnit?: string;
  _count?: { storeItems: number };
}

interface CatalogPage {
  items: CatalogItem[];
  total: number;
  page: number;
  pages: number;
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

async function fetchCatalogPage(params: {
  page: number;
  category?: ItemCategory | 'ALL';
}): Promise<CatalogPage> {
  const search = new URLSearchParams();
  search.set('page', String(params.page));
  search.set('limit', String(PAGE_LIMIT));
  if (params.category && params.category !== 'ALL') {
    search.set('category', params.category);
  }
  const res = await apiClient.get(`/api/v1/catalog?${search.toString()}`);
  const data = unwrapOne<CatalogPage>(res.data);
  return {
    items: data.items ?? [],
    total: data.total ?? 0,
    page: data.page ?? params.page,
    pages: data.pages ?? 1,
  };
}

async function fetchCatalogSearch(q: string): Promise<CatalogItem[]> {
  const res = await apiClient.get(`/api/v1/catalog/search/q?q=${encodeURIComponent(q)}`);
  return unwrapList<CatalogItem>(res.data, 'items');
}

function CatalogTile({ item }: { item: CatalogItem }) {
  const carriedBy = item._count?.storeItems ?? 0;
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      style={styles.tile}
      onPress={() => router.push(`/catalog/${item.id}`)}
    >
      <View style={styles.tileImageWrap}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.tileImage} resizeMode="cover" />
        ) : (
          <Text style={styles.tileEmoji}>{CATEGORY_EMOJI[item.category]}</Text>
        )}
      </View>
      <View style={styles.tileBody}>
        <Text style={styles.tileName} numberOfLines={2}>
          {item.name}
        </Text>
        <View style={styles.tileBadge}>
          <Text style={styles.tileBadgeText}>{ItemCategoryLabels[item.category]}</Text>
        </View>
        <Text style={styles.tileSubtitle}>
          Carried by {carriedBy} store{carriedBy === 1 ? '' : 's'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function TileSkeleton() {
  return (
    <View style={styles.tile}>
      <Skeleton width="100%" height={120} radius={radius.md} />
      <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
        <Skeleton width="80%" height={14} />
        <Skeleton width="50%" height={12} />
        <Skeleton width="60%" height={12} />
      </View>
    </View>
  );
}

export default function CatalogBrowseScreen() {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<ItemCategory | 'ALL'>('ALL');
  const debouncedQuery = useDebounced(query.trim(), 300);

  const isSearching = debouncedQuery.length > 0;

  const browseQuery = useInfiniteQuery({
    queryKey: ['catalog-browse', activeCategory],
    queryFn: ({ pageParam }) =>
      fetchCatalogPage({ page: pageParam as number, category: activeCategory }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    enabled: !isSearching,
  });

  const searchQuery = useQuery({
    queryKey: ['catalog-search', debouncedQuery],
    queryFn: () => fetchCatalogSearch(debouncedQuery),
    enabled: isSearching,
  });

  const items: CatalogItem[] = useMemo(() => {
    if (isSearching) return searchQuery.data ?? [];
    return (browseQuery.data?.pages ?? []).flatMap((p) => p.items);
  }, [isSearching, searchQuery.data, browseQuery.data]);

  const isLoading = isSearching ? searchQuery.isLoading : browseQuery.isLoading;
  const isRefetching = isSearching ? searchQuery.isRefetching : browseQuery.isRefetching;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.headerBlock}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.primary} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search master catalog..."
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 ? (
            <TouchableOpacity activeOpacity={0.7} onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>

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
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {isLoading ? (
        <FlatList
          data={[0, 1, 2, 3, 4, 5]}
          keyExtractor={(n) => String(n)}
          numColumns={2}
          contentContainerStyle={styles.gridContent}
          columnWrapperStyle={styles.row}
          renderItem={() => <TileSkeleton />}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          numColumns={2}
          contentContainerStyle={styles.gridContent}
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => {
                if (isSearching) searchQuery.refetch();
                else browseQuery.refetch();
              }}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          renderItem={({ item }) => <CatalogTile item={item} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (!isSearching && browseQuery.hasNextPage && !browseQuery.isFetchingNextPage) {
              browseQuery.fetchNextPage();
            }
          }}
          ListFooterComponent={
            !isSearching && browseQuery.isFetchingNextPage ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={{ paddingTop: spacing.xxxl }}>
              <EmptyState
                icon="cube-outline"
                title={isSearching ? 'No items match' : 'Catalog is empty'}
                subtitle={
                  isSearching
                    ? `Nothing matches "${debouncedQuery}". Try a different keyword.`
                    : 'Try a different category.'
                }
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

  headerBlock: {
    backgroundColor: colors.card,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    ...shadow.small,
  },
  searchWrap: {
    marginHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.primaryLight,
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
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
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

  gridContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxxl * 3,
  },
  row: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  tile: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    ...shadow.small,
  },
  tileImageWrap: {
    width: '100%',
    height: 120,
    borderRadius: radius.md,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  tileEmoji: {
    fontSize: 44,
  },
  tileBody: {
    paddingHorizontal: 4,
    paddingTop: spacing.sm,
    gap: 4,
  },
  tileName: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
    minHeight: 36,
  },
  tileBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  tileBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  tileSubtitle: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  footerLoader: {
    paddingVertical: spacing.lg,
  },
});
