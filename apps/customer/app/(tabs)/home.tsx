import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CategoryGrid } from '@/components/CategoryGrid';
import { ItemCard } from '@/components/ItemCard';
import { apiClient } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { useCartStore } from '@/store/cart.store';
import { useLocation } from '@/hooks/useLocation';
import type { CartItem, InventoryItem } from '@aks/shared';

async function fetchPopularItems(): Promise<InventoryItem[]> {
  const res = await apiClient.get<{ data: InventoryItem[] }>('/api/v1/items/popular');
  return res.data.data ?? [];
}

export default function HomeScreen() {
  const { user } = useAuthStore();
  const { addItem } = useCartStore();
  const { coords, loading: locationLoading } = useLocation();

  const {
    data: popularItems,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['popularItems'],
    queryFn: fetchPopularItems,
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

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#16A34A"
            colors={['#16A34A']}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>{greeting()},</Text>
            <Text style={styles.userName}>{user?.name ?? 'there'} 👋</Text>
          </View>
          <TouchableOpacity style={styles.cartButton} onPress={() => router.push('/cart')}>
            <Text style={styles.cartEmoji}>🛒</Text>
          </TouchableOpacity>
        </View>

        {/* Location bar */}
        <TouchableOpacity style={styles.locationBar} activeOpacity={0.7}>
          <Text style={styles.locationPin}>📍</Text>
          <Text style={styles.locationText} numberOfLines={1}>
            {locationLoading
              ? 'Detecting location…'
              : coords
              ? `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`
              : 'Tap to set location'}
          </Text>
          <Text style={styles.locationChevron}>›</Text>
        </TouchableOpacity>

        {/* Search shortcut */}
        <TouchableOpacity style={styles.searchBar} onPress={() => router.push('/(tabs)/search')}>
          <Text style={styles.searchIcon}>🔍</Text>
          <Text style={styles.searchPlaceholder}>Search items, stores…</Text>
        </TouchableOpacity>

        {/* Categories */}
        <Text style={styles.sectionTitle}>Shop by Category</Text>
        <CategoryGrid />

        {/* Popular Items */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Popular Items</Text>
        </View>

        {isLoading ? (
          <ActivityIndicator style={{ marginVertical: 24 }} color="#16A34A" />
        ) : (
          <FlatList
            data={popularItems ?? []}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalList}
            renderItem={({ item }) => (
              <ItemCard
                item={item}
                onAddToCart={() => handleAddToCart(item)}
                onPress={() => router.push(`/item/${item.id}`)}
                style={styles.popularCard}
              />
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No popular items found.</Text>
            }
          />
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerLeft: {
    gap: 2,
  },
  greeting: {
    fontSize: 14,
    color: '#6B7280',
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  cartButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0FDF4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartEmoji: {
    fontSize: 22,
  },
  locationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginVertical: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 6,
  },
  locationPin: {
    fontSize: 16,
  },
  locationText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  locationChevron: {
    fontSize: 20,
    color: '#9CA3AF',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 10,
  },
  searchIcon: {
    fontSize: 16,
  },
  searchPlaceholder: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionHeader: {
    marginTop: 24,
  },
  horizontalList: {
    paddingHorizontal: 20,
    gap: 12,
  },
  popularCard: {
    width: 160,
  },
  emptyText: {
    paddingHorizontal: 20,
    color: '#9CA3AF',
    fontSize: 14,
  },
});
