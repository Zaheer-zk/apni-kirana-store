import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { apiClient } from '@/lib/api';
import { useCartStore } from '@/store/cart.store';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';
import {
  ItemCategory,
  ItemCategoryLabels,
  StoreStatus,
  type Address,
} from '@aks/shared';

const DEFAULT_LAT = 28.6315;
const DEFAULT_LNG = 77.2167;
const DEFAULT_RADIUS_KM = 10;

const CATEGORY_EMOJI: Record<ItemCategory, string> = {
  [ItemCategory.GROCERY]: '🛒',
  [ItemCategory.MEDICINE]: '💊',
  [ItemCategory.HOUSEHOLD]: '🧹',
  [ItemCategory.SNACKS]: '🍿',
  [ItemCategory.BEVERAGES]: '🥤',
  [ItemCategory.OTHER]: '📦',
};

interface CatalogItemDetail {
  id: string;
  name: string;
  category: ItemCategory;
  description?: string | null;
  imageUrl?: string | null;
  defaultUnit: string;
}

interface StoreWithItem {
  id: string;
  name: string;
  status?: StoreStatus;
  category?: ItemCategory;
  rating?: number;
  distanceKm?: number;
  storeItem: {
    id: string;
    price: number;
    stockQty: number;
  };
}

interface CatalogDetailResponse {
  item: CatalogItemDetail;
  stores: StoreWithItem[];
}

interface MeResponse {
  id: string;
  defaultAddress: Address | null;
}

function unwrapOne<T>(payload: unknown): T {
  if (payload && typeof payload === 'object') {
    const o = payload as { data?: unknown };
    if (o.data !== undefined) return o.data as T;
  }
  return payload as T;
}

async function fetchMe(): Promise<MeResponse | null> {
  try {
    const res = await apiClient.get('/api/v1/users/me');
    return unwrapOne<MeResponse>(res.data);
  } catch {
    return null;
  }
}

async function fetchCatalogDetail(
  id: string,
  lat: number,
  lng: number
): Promise<CatalogDetailResponse> {
  const search = new URLSearchParams();
  search.set('lat', String(lat));
  search.set('lng', String(lng));
  search.set('radius', String(DEFAULT_RADIUS_KM));
  const res = await apiClient.get(`/api/v1/catalog/${id}?${search.toString()}`);
  const data = unwrapOne<CatalogDetailResponse>(res.data);
  return {
    item: data.item,
    stores: data.stores ?? [],
  };
}

export default function CatalogDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const addItem = useCartStore((s) => s.addItem);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);

  const meQuery = useQuery({ queryKey: ['me'], queryFn: fetchMe });
  const lat = meQuery.data?.defaultAddress?.lat ?? DEFAULT_LAT;
  const lng = meQuery.data?.defaultAddress?.lng ?? DEFAULT_LNG;

  const detailQuery = useQuery({
    queryKey: ['catalog-detail', id, lat, lng],
    queryFn: () => fetchCatalogDetail(id!, lat, lng),
    enabled: !!id,
  });

  const data = detailQuery.data;
  const stores = useMemo(() => {
    const list = data?.stores ?? [];
    // Sort by closest, then cheapest as tiebreaker
    return [...list].sort((a, b) => {
      const da = a.distanceKm ?? Number.POSITIVE_INFINITY;
      const db = b.distanceKm ?? Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      return a.storeItem.price - b.storeItem.price;
    });
  }, [data]);

  // Auto-select the first store when data loads
  useEffect(() => {
    if (stores.length > 0 && !selectedStoreId) {
      setSelectedStoreId(stores[0].id);
    }
  }, [stores, selectedStoreId]);

  // Set screen title to item name once we have it
  useEffect(() => {
    if (data?.item?.name) {
      navigation.setOptions({ title: data.item.name });
    }
  }, [data?.item?.name, navigation]);

  if (detailQuery.isLoading) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  if (detailQuery.isError || !data) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <EmptyState
          icon="alert-circle-outline"
          title="Item not found"
          subtitle="This catalog item could not be loaded."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  const item = data.item;
  const selected = stores.find((s) => s.id === selectedStoreId) ?? stores[0];

  function handleAddToCart() {
    if (!selected || !item) return;
    addItem({
      itemId: selected.storeItem.id, // storeItemId
      name: item.name,
      price: selected.storeItem.price,
      unit: item.defaultUnit,
      qty,
      imageUrl: item.imageUrl ?? '',
    });
    router.push('/cart');
  }

  return (
    <View style={styles.safe}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Hero */}
        <View style={styles.hero}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <Text style={styles.heroEmoji}>{CATEGORY_EMOJI[item.category]}</Text>
          )}
        </View>

        {/* Name + meta */}
        <View style={styles.headSection}>
          <Text style={styles.name}>{item.name}</Text>
          <View style={styles.headRow}>
            <Badge variant="primary" text={ItemCategoryLabels[item.category]} />
            <Text style={styles.unitText}>per {item.defaultUnit}</Text>
          </View>
          {item.description ? (
            <Text style={styles.description}>{item.description}</Text>
          ) : null}
        </View>

        {/* Stores */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Available at {stores.length} store{stores.length === 1 ? '' : 's'} nearby
          </Text>

          {stores.length === 0 ? (
            <View style={styles.emptyMini}>
              <Text style={styles.emptyMiniText}>
                No nearby store currently sells this item.
              </Text>
            </View>
          ) : (
            <View style={{ gap: spacing.md }}>
              {stores.map((s) => {
                const isSelected = selected?.id === s.id;
                const isOpen = s.status ? s.status === StoreStatus.OPEN : true;
                return (
                  <TouchableOpacity
                    key={s.id}
                    activeOpacity={0.8}
                    style={[styles.storeRow, isSelected && styles.storeRowSelected]}
                    onPress={() => setSelectedStoreId(s.id)}
                  >
                    <View style={styles.storeAvatar}>
                      <Ionicons name="storefront" size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={styles.storeNameRow}>
                        <Text style={styles.storeName} numberOfLines={1}>
                          {s.name}
                        </Text>
                        <Badge
                          variant={isOpen ? 'success' : 'error'}
                          text={isOpen ? 'Open' : 'Closed'}
                        />
                      </View>
                      <View style={styles.storeMeta}>
                        {typeof s.distanceKm === 'number' ? (
                          <View style={styles.metaItem}>
                            <Ionicons name="location-outline" size={12} color={colors.textSecondary} />
                            <Text style={styles.metaText}>
                              {s.distanceKm.toFixed(1)} km
                            </Text>
                          </View>
                        ) : null}
                        {typeof s.rating === 'number' ? (
                          <View style={styles.metaItem}>
                            <Ionicons name="star" size={12} color={colors.accent} />
                            <Text style={styles.metaText}>{s.rating.toFixed(1)}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <View style={styles.priceCol}>
                      <Text style={styles.priceValue}>₹{s.storeItem.price.toFixed(0)}</Text>
                      <Text style={styles.priceUnit}>per {item.defaultUnit}</Text>
                    </View>
                    <View style={[styles.radio, isSelected && styles.radioSelected]}>
                      {isSelected ? <View style={styles.radioDot} /> : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Quantity */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quantity</Text>
          <View style={styles.qtyWrap}>
            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.qtyBtn}
              onPress={() => setQty((q) => Math.max(1, q - 1))}
            >
              <Ionicons name="remove" size={20} color={colors.white} />
            </TouchableOpacity>
            <Text style={styles.qtyValue}>{qty}</Text>
            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.qtyBtn}
              onPress={() => setQty((q) => q + 1)}
            >
              <Ionicons name="add" size={20} color={colors.white} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 140 }} />
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.footerSafe}>
        <View style={styles.footer}>
          <Button
            title={
              selected
                ? `Add to cart from ${selected.name}`
                : 'Pick a store to continue'
            }
            onPress={handleAddToCart}
            size="lg"
            fullWidth
            disabled={!selected}
            icon="cart-outline"
            iconPosition="left"
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingTop: 100,
    paddingBottom: spacing.xxxl,
  },
  hero: {
    marginHorizontal: spacing.lg,
    height: 200,
    borderRadius: radius.lg,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroEmoji: {
    fontSize: 96,
  },
  headSection: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  name: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  unitText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  description: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginTop: spacing.xs,
  },

  section: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: spacing.md,
    ...shadow.small,
  },
  storeRowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  storeAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    gap: spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  metaText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  priceCol: {
    alignItems: 'flex-end',
  },
  priceValue: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.primary,
  },
  priceUnit: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },

  qtyWrap: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  qtyBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValue: {
    minWidth: 36,
    color: colors.white,
    fontSize: fontSize.lg,
    fontWeight: '800',
    textAlign: 'center',
  },

  emptyMini: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyMiniText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },

  footerSafe: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadow.medium,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
