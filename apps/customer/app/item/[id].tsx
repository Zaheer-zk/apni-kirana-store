import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
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
  type InventoryItem,
  type StoreProfile,
} from '@aks/shared';

const CATEGORY_EMOJI: Record<ItemCategory, string> = {
  [ItemCategory.GROCERY]: '🛒',
  [ItemCategory.MEDICINE]: '💊',
  [ItemCategory.HOUSEHOLD]: '🧹',
  [ItemCategory.SNACKS]: '🍿',
  [ItemCategory.BEVERAGES]: '🥤',
  [ItemCategory.OTHER]: '📦',
};

interface ItemDetailResponse {
  item: InventoryItem;
  store: StoreProfile;
  distanceKm?: number;
}

async function fetchItemDetail(id: string): Promise<ItemDetailResponse> {
  // Try the dedicated detail endpoint first; fall back to scanning nearby stores.
  try {
    const res = await apiClient.get<{ data: ItemDetailResponse } | ItemDetailResponse>(
      `/api/v1/items/${id}`
    );
    const payload = res.data as unknown;
    if ((payload as ItemDetailResponse)?.item) return payload as ItemDetailResponse;
    return (payload as { data: ItemDetailResponse }).data;
  } catch {
    // Fallback path
    const storesRes = await apiClient.get<{ data: StoreProfile[] } | StoreProfile[]>(
      `/api/v1/stores/nearby?lat=28.6315&lng=77.2167`
    );
    const sPayload = storesRes.data as unknown;
    const stores: StoreProfile[] = Array.isArray(sPayload)
      ? (sPayload as StoreProfile[])
      : ((sPayload as { data?: StoreProfile[] }).data ?? []);

    for (const store of stores) {
      try {
        const r = await apiClient.get<{ data: InventoryItem[] } | InventoryItem[]>(
          `/api/v1/stores/${store.id}/items`
        );
        const pp = r.data as unknown;
        const list: InventoryItem[] = Array.isArray(pp)
          ? (pp as InventoryItem[])
          : ((pp as { data?: InventoryItem[] }).data ?? []);
        const found = list.find((i) => i.id === id);
        if (found) return { item: found, store };
      } catch {
        // ignore
      }
    }
    throw new Error('Item not found');
  }
}

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [qty, setQty] = useState(1);
  const cartItems = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const updateQty = useCartStore((s) => s.updateQty);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['item', id],
    queryFn: () => fetchItemDetail(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  if (isError || !data) {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyState
          icon="alert-circle-outline"
          title="Item not available"
          subtitle="We couldn't load this item right now."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  const { item, store, distanceKm } = data;
  const inCart = cartItems.find((ci) => ci.itemId === item.id);
  const totalPrice = item.price * qty;

  function handleAdd() {
    if (inCart) {
      updateQty(inCart.itemId, inCart.qty + qty);
    } else {
      addItem({
        itemId: item.id,
        name: item.name,
        price: item.price,
        unit: item.unit,
        qty,
        imageUrl: item.imageUrl,
      });
    }
    router.push('/cart');
  }

  return (
    <View style={styles.safe}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Hero */}
        <View style={styles.hero}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <Text style={styles.heroEmoji}>{CATEGORY_EMOJI[item.category]}</Text>
          )}

          {/* Native iOS header (back button + cart icon) is provided by Stack.Screen below */}
          <Stack.Screen
            options={{
              title: '',
              headerRight: () => (
                <TouchableOpacity
                  hitSlop={12}
                  onPress={() => router.push('/cart')}
                  style={{ paddingHorizontal: 4 }}
                >
                  <Ionicons name="cart-outline" size={24} color={colors.primary} />
                </TouchableOpacity>
              ),
            }}
          />
        </View>

        {/* Body card */}
        <View style={styles.bodyCard}>
          <Badge variant="primary" text={ItemCategoryLabels[item.category]} />
          <Text style={styles.itemName}>{item.name}</Text>

          <View style={styles.storeRow}>
            <View style={styles.storeIconWrap}>
              <Ionicons name="storefront" size={14} color={colors.primary} />
            </View>
            <Text style={styles.storeName} numberOfLines={1}>
              {store.name}
              {typeof distanceKm === 'number' ? ` • ${distanceKm.toFixed(1)} km away` : ''}
            </Text>
          </View>

          <View style={styles.priceRow}>
            <Text style={styles.price}>₹{item.price.toFixed(0)}</Text>
            <Text style={styles.unit}>/ {item.unit}</Text>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.metaText}>20-30 min</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="star" size={16} color={colors.accent} />
              <Text style={styles.metaText}>{store.rating.toFixed(1)}</Text>
            </View>
            <Badge variant={item.isAvailable ? 'success' : 'error'} text={item.isAvailable ? 'In stock' : 'Out of stock'} />
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionLabel}>Quantity</Text>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={styles.stepperBtn}
              activeOpacity={0.7}
              onPress={() => setQty(Math.max(1, qty - 1))}
            >
              <Ionicons name="remove" size={20} color={colors.primary} />
            </TouchableOpacity>
            <Text style={styles.stepperQty}>{qty}</Text>
            <TouchableOpacity
              style={styles.stepperBtn}
              activeOpacity={0.7}
              onPress={() => setQty(qty + 1)}
            >
              <Ionicons name="add" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionLabel}>About this item</Text>
          <Text style={styles.aboutText}>
            {item.name} sourced from {store.name}. Sold by weight/unit and delivered fresh from your
            local kirana store. Quality guaranteed — refunds if you're not satisfied.
          </Text>
        </View>
      </ScrollView>

      {/* Sticky footer */}
      <SafeAreaView edges={['bottom']} style={styles.footerSafe}>
        <View style={styles.footer}>
          <View style={styles.footerLeft}>
            <Text style={styles.footerLabel}>Total</Text>
            <Text style={styles.footerTotal}>₹{totalPrice.toFixed(0)}</Text>
          </View>
          <Button
            title={inCart ? 'Add more to cart' : 'Add to cart'}
            icon="cart"
            onPress={handleAdd}
            size="lg"
            disabled={!item.isAvailable}
            style={{ flex: 1 }}
            fullWidth
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  hero: {
    height: 260,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroEmoji: {
    fontSize: 110,
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  heroActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  circleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.medium,
  },
  bodyCard: {
    marginTop: -24,
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xxl,
  },
  itemName: {
    marginTop: spacing.md,
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
    lineHeight: 32,
  },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  storeIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeName: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  price: {
    fontSize: fontSize.xxxl,
    fontWeight: '800',
    color: colors.primary,
  },
  unit: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  divider: {
    marginVertical: spacing.xl,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: 4,
    gap: spacing.lg,
  },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperQty: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
    minWidth: 32,
    textAlign: 'center',
  },
  aboutText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  footerSafe: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadow.medium,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.lg,
  },
  footerLeft: {
    minWidth: 80,
  },
  footerLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  footerTotal: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.textPrimary,
  },
});
