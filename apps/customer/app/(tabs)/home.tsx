import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
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
import { Skeleton } from '@/components/Skeleton';
import { Badge } from '@/components/Badge';
import { apiClient } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { useCartStore } from '@/store/cart.store';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';
import { ItemCategoryLabels, type Address, type InventoryItem, type StoreProfile } from '@aks/shared';

const DEFAULT_LAT = 28.6315;
const DEFAULT_LNG = 77.2167;

interface MeResponse {
  id: string;
  name?: string | null;
  phone: string;
  defaultAddress: Address | null;
}

async function fetchMe(): Promise<MeResponse | null> {
  try {
    const res = await apiClient.get('/api/v1/users/me');
    const data = res.data;
    if (data && typeof data === 'object') {
      const o = data as { data?: unknown };
      if (o.data && typeof o.data === 'object') return o.data as MeResponse;
      return data as MeResponse;
    }
    return null;
  } catch {
    return null;
  }
}

// Backend wraps every response as { success, data, message } and may further
// nest paginated lists under { items: [...], total, page }.
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

async function fetchNearbyStores(): Promise<StoreProfile[]> {
  const res = await apiClient.get(
    `/api/v1/stores/nearby?lat=${DEFAULT_LAT}&lng=${DEFAULT_LNG}`
  );
  return unwrapList<StoreProfile>(res.data, 'stores');
}

async function fetchPopularItems(stores: StoreProfile[]): Promise<InventoryItem[]> {
  if (!stores.length) return [];
  const itemsByStore = await Promise.all(
    stores.map(async (s) => {
      try {
        const r = await apiClient.get(`/api/v1/stores/${s.id}/items`);
        return unwrapList<InventoryItem>(r.data, 'items');
      } catch {
        return [];
      }
    })
  );
  return itemsByStore.flat().filter((i) => i.isAvailable).slice(0, 8);
}

function greetingFor(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function StoreCard({ store }: { store: StoreProfile }) {
  return (
    <TouchableOpacity
      style={styles.storeCard}
      activeOpacity={0.7}
      onPress={() => router.push({ pathname: '/(tabs)/search', params: { storeId: store.id } })}
    >
      <View style={styles.storeAvatar}>
        <Ionicons name="storefront" size={24} color={colors.primary} />
      </View>
      <View style={styles.storeBody}>
        <View style={styles.storeRow}>
          <Text style={styles.storeName} numberOfLines={1}>
            {store.name}
          </Text>
          <Badge variant="success" text="Open" />
        </View>
        <View style={styles.storeMeta}>
          <Badge variant="primary" text={ItemCategoryLabels[store.category]} />
          <View style={styles.metaItem}>
            <Ionicons name="star" size={12} color={colors.accent} />
            <Text style={styles.metaText}>{store.rating.toFixed(1)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={12} color={colors.textSecondary} />
            <Text style={styles.metaText}>20-30 min</Text>
          </View>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

function StoreSkeleton() {
  return (
    <View style={styles.storeCard}>
      <Skeleton width={48} height={48} radius={24} />
      <View style={{ flex: 1, gap: spacing.sm }}>
        <Skeleton width="60%" height={16} />
        <Skeleton width="80%" height={12} />
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);
  const cartCount = useCartStore((s) => s.items.reduce((sum, i) => sum + i.qty, 0));

  const meQuery = useQuery({ queryKey: ['me'], queryFn: fetchMe });
  const defaultAddress = meQuery.data?.defaultAddress ?? null;

  const storesQuery = useQuery({
    queryKey: ['nearby-stores'],
    queryFn: fetchNearbyStores,
  });

  const itemsQuery = useQuery({
    queryKey: ['popular-items', storesQuery.data?.map((s) => s.id) ?? []],
    queryFn: () => fetchPopularItems(storesQuery.data ?? []),
    enabled: !!storesQuery.data?.length,
  });

  const stores = storesQuery.data ?? [];
  const items = itemsQuery.data ?? [];
  const isLoading = storesQuery.isLoading;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Sticky header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.locationPill}
          activeOpacity={0.7}
          onPress={() => {
            if (defaultAddress) {
              router.push('/account/addresses');
            } else {
              router.push('/onboarding/map-picker');
            }
          }}
        >
          <Ionicons name="location" size={16} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.locationLabel}>
              {defaultAddress ? 'Deliver to' : 'Delivery'}
            </Text>
            <Text style={styles.locationValue} numberOfLines={1}>
              {defaultAddress
                ? `${defaultAddress.street.slice(0, 20)}${defaultAddress.street.length > 20 ? '…' : ''}, ${defaultAddress.city}`
                : 'Set delivery location'}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconButton}
          activeOpacity={0.7}
          onPress={() => router.push('/cart')}
        >
          <Ionicons name="cart-outline" size={22} color={colors.textPrimary} />
          {cartCount > 0 ? (
            <View style={styles.iconBadge}>
              <Text style={styles.iconBadgeText}>{cartCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>

        <TouchableOpacity style={styles.iconButton} activeOpacity={0.7}>
          <Ionicons name="notifications-outline" size={22} color={colors.textPrimary} />
          <View style={[styles.iconDot, { backgroundColor: colors.error }]} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={storesQuery.isRefetching || itemsQuery.isRefetching}
            onRefresh={() => {
              storesQuery.refetch();
              itemsQuery.refetch();
            }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Greeting */}
        <View style={styles.greetingBlock}>
          <Text style={styles.greetingText}>{greetingFor()},</Text>
          <Text style={styles.greetingName}>{user?.name ?? 'Customer'} 👋</Text>
        </View>

        {/* Search bar */}
        <TouchableOpacity
          style={styles.searchBar}
          activeOpacity={0.7}
          onPress={() => router.push('/(tabs)/search')}
        >
          <Ionicons name="search" size={20} color={colors.textSecondary} />
          <Text style={styles.searchPlaceholder}>Search for items, stores...</Text>
        </TouchableOpacity>

        {/* Hero banner */}
        <View style={styles.heroBanner}>
          <View style={styles.heroIcon}>
            <Ionicons name="bicycle" size={32} color={colors.white} />
          </View>
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>Get groceries delivered{'\n'}in 30 mins!</Text>
            <Text style={styles.heroSubtitle}>From your nearby kirana stores</Text>
          </View>
        </View>

        {/* Categories */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Shop by Category</Text>
          <CategoryGrid />
        </View>

        {/* Popular near you */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Popular near you</Text>
            <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/(tabs)/search')}>
              <Text style={styles.linkText}>View all</Text>
            </TouchableOpacity>
          </View>
          {itemsQuery.isLoading ? (
            <View style={styles.popularRow}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={[styles.popularSkeleton]}>
                  <Skeleton width="100%" height={100} radius={12} />
                  <Skeleton width="80%" height={14} />
                  <Skeleton width="40%" height={14} />
                </View>
              ))}
            </View>
          ) : items.length === 0 ? (
            <View style={styles.emptyMini}>
              <Text style={styles.emptyMiniText}>No items available right now.</Text>
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              renderItem={({ item }) => (
                <ItemCard
                  item={item}
                  variant="compact"
                  onPress={() => router.push(`/item/${item.id}`)}
                />
              )}
            />
          )}
        </View>

        {/* Stores near you */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Stores near you</Text>
          {isLoading ? (
            <View style={{ gap: spacing.md }}>
              <StoreSkeleton />
              <StoreSkeleton />
              <StoreSkeleton />
            </View>
          ) : stores.length === 0 ? (
            <View style={styles.emptyMini}>
              <Text style={styles.emptyMiniText}>No stores nearby. Try again later.</Text>
            </View>
          ) : (
            <View style={{ gap: spacing.md }}>
              {stores.map((store) => (
                <StoreCard key={store.id} store={store} />
              ))}
            </View>
          )}
        </View>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  locationPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    ...shadow.small,
  },
  locationLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '600',
  },
  locationValue: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.small,
  },
  iconBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  iconBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '800',
  },
  iconDot: {
    position: 'absolute',
    top: 10,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.card,
  },
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },
  greetingBlock: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  greetingText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  greetingName: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 2,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  heroBanner: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    ...shadow.medium,
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: {
    flex: 1,
  },
  heroTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.white,
    lineHeight: 24,
  },
  heroSubtitle: {
    marginTop: 4,
    fontSize: fontSize.xs,
    color: colors.primaryLight,
  },
  section: {
    marginTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  linkText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: spacing.md,
  },
  popularRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  popularSkeleton: {
    width: 140,
    gap: spacing.sm,
  },
  horizontalList: {
    gap: spacing.md,
    paddingRight: spacing.lg,
  },
  storeCard: {
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
  storeAvatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeBody: {
    flex: 1,
    gap: 6,
  },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  storeName: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  storeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  emptyMini: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyMiniText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
});
