import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ItemCard } from '@/components/ItemCard';
import { apiClient } from '@/lib/api';
import { useCartStore } from '@/store/cart.store';
import type { CartItem, InventoryItem } from '@aks/shared';
import { ItemCategory } from '@aks/shared';

const CATEGORY_OPTIONS: { label: string; emoji: string; value: ItemCategory | 'ALL' }[] = [
  { label: 'All', emoji: '🛍️', value: 'ALL' },
  { label: 'Grocery', emoji: '🥦', value: ItemCategory.GROCERY },
  { label: 'Medicine', emoji: '💊', value: ItemCategory.MEDICINE },
  { label: 'Household', emoji: '🧹', value: ItemCategory.HOUSEHOLD },
  { label: 'Snacks', emoji: '🍿', value: ItemCategory.SNACKS },
  { label: 'Beverages', emoji: '🥤', value: ItemCategory.BEVERAGES },
  { label: 'Other', emoji: '📦', value: ItemCategory.OTHER },
];

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  const ref = useCallback(
    (v: string) => {
      const timer = setTimeout(() => setDebounced(v), delay);
      return () => clearTimeout(timer);
    },
    [delay]
  );

  // Simpler pattern: keep the effect outside hook is not possible here,
  // so we use a stateful version with a ref pattern via useState
  return { debounced, ref };
}

async function searchItems(query: string, category: ItemCategory | 'ALL'): Promise<InventoryItem[]> {
  if (!query && category === 'ALL') return [];
  const params: Record<string, string> = {};
  if (query) params.q = query;
  if (category !== 'ALL') params.category = category;
  const res = await apiClient.get<{ data: InventoryItem[] }>('/api/v1/items/search', { params });
  return res.data.data ?? [];
}

function SkeletonCard() {
  return (
    <View style={styles.skeleton}>
      <View style={styles.skeletonImage} />
      <View style={{ flex: 1, gap: 8, padding: 10 }}>
        <View style={styles.skeletonLine} />
        <View style={[styles.skeletonLine, { width: '60%' }]} />
        <View style={[styles.skeletonLine, { width: '40%' }]} />
      </View>
    </View>
  );
}

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ItemCategory | 'ALL'>('ALL');
  const { addItem } = useCartStore();

  // Debounce via useEffect equivalent using setTimeout in onChange
  function handleQueryChange(text: string) {
    setQuery(text);
    const timer = setTimeout(() => setDebouncedQuery(text), 400);
    return () => clearTimeout(timer);
  }

  const { data: results, isLoading, isFetching } = useQuery({
    queryKey: ['search', debouncedQuery, selectedCategory],
    queryFn: () => searchItems(debouncedQuery, selectedCategory),
    enabled: debouncedQuery.length > 0 || selectedCategory !== 'ALL',
  });

  function handleAddToCart(item: InventoryItem) {
    const cartItem: CartItem = {
      itemId: item.id,
      name: item.name,
      price: item.price,
      unit: item.unit,
      qty: 1,
      imageUrl: item.imageUrl,
    };
    addItem(cartItem);
  }

  const showSkeleton = isLoading || isFetching;
  const showEmpty =
    !showSkeleton &&
    results !== undefined &&
    results.length === 0 &&
    (debouncedQuery.length > 0 || selectedCategory !== 'ALL');
  const showResults = !showSkeleton && results && results.length > 0;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search items…"
          placeholderTextColor="#9CA3AF"
          value={query}
          onChangeText={handleQueryChange}
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              setQuery('');
              setDebouncedQuery('');
            }}
          >
            <Text style={styles.clearIcon}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Category filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {CATEGORY_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[
              styles.chip,
              selectedCategory === opt.value && styles.chipActive,
            ]}
            onPress={() => setSelectedCategory(opt.value)}
          >
            <Text style={styles.chipEmoji}>{opt.emoji}</Text>
            <Text
              style={[
                styles.chipLabel,
                selectedCategory === opt.value && styles.chipLabelActive,
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Results */}
      {showSkeleton && (
        <View style={styles.skeletonList}>
          {[1, 2, 3, 4].map((k) => (
            <SkeletonCard key={k} />
          ))}
        </View>
      )}

      {showEmpty && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🔎</Text>
          <Text style={styles.emptyTitle}>No results found</Text>
          <Text style={styles.emptySubtitle}>Try a different search or category.</Text>
        </View>
      )}

      {!debouncedQuery && selectedCategory === 'ALL' && !showSkeleton && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🛍️</Text>
          <Text style={styles.emptyTitle}>Search for anything</Text>
          <Text style={styles.emptySubtitle}>Find groceries, medicines, snacks and more.</Text>
        </View>
      )}

      {showResults && (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.resultsList}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          renderItem={({ item }) => (
            <ItemCard
              item={item}
              onAddToCart={() => handleAddToCart(item)}
              onPress={() => router.push(`/item/${item.id}`)}
              style={styles.resultCard}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 10,
  },
  searchIcon: {
    fontSize: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
  },
  clearIcon: {
    fontSize: 14,
    color: '#9CA3AF',
    padding: 4,
  },
  chips: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 6,
  },
  chipActive: {
    backgroundColor: '#16A34A',
    borderColor: '#16A34A',
  },
  chipEmoji: {
    fontSize: 14,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
  },
  chipLabelActive: {
    color: '#FFFFFF',
  },
  resultsList: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  columnWrapper: {
    gap: 12,
    marginBottom: 12,
  },
  resultCard: {
    flex: 1,
  },
  skeletonList: {
    padding: 16,
    gap: 12,
  },
  skeleton: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  skeletonImage: {
    width: 80,
    height: 80,
    backgroundColor: '#F3F4F6',
  },
  skeletonLine: {
    height: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    width: '80%',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 80,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
