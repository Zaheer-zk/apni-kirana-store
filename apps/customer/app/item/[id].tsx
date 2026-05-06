import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
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
import { apiClient } from '@/lib/api';
import { useCartStore } from '@/store/cart.store';
import type { CartItem, InventoryItem, StoreProfile } from '@aks/shared';

interface ItemDetailResponse {
  item: InventoryItem;
  store: StoreProfile;
  distanceKm?: number;
}

async function fetchItemDetail(id: string): Promise<ItemDetailResponse> {
  const res = await apiClient.get<{ data: ItemDetailResponse }>(`/api/v1/items/${id}`);
  return res.data.data;
}

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [qty, setQty] = useState(1);
  const { addItem, items: cartItems, updateQty } = useCartStore();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['item', id],
    queryFn: () => fetchItemDetail(id),
    enabled: !!id,
  });

  const existingCartItem = cartItems.find((ci) => ci.itemId === id);

  function handleAddToCart() {
    if (!data) return;
    const { item } = data;
    if (existingCartItem) {
      updateQty(existingCartItem.itemId, existingCartItem.qty + qty);
    } else {
      const cartItem: CartItem = {
        itemId: item.id,
        name: item.name,
        price: item.price,
        unit: item.unit,
        qty,
        imageUrl: item.imageUrl,
      };
      addItem(cartItem);
    }
    router.push('/cart');
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Back button */}
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backIcon}>←</Text>
      </TouchableOpacity>

      {isLoading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#16A34A" />
        </View>
      )}

      {isError && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Failed to load item.</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.errorLink}>Go back</Text>
          </TouchableOpacity>
        </View>
      )}

      {data && (
        <>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Item image */}
            <Image
              source={{ uri: data.item.imageUrl || 'https://via.placeholder.com/400x300' }}
              style={styles.image}
              resizeMode="cover"
            />

            <View style={styles.body}>
              {/* Category tag */}
              <View style={styles.categoryTag}>
                <Text style={styles.categoryTagText}>{data.item.category}</Text>
              </View>

              {/* Name */}
              <Text style={styles.name}>{data.item.name}</Text>

              {/* Price + Unit */}
              <View style={styles.priceRow}>
                <Text style={styles.price}>₹{data.item.price.toFixed(2)}</Text>
                <Text style={styles.unit}>per {data.item.unit}</Text>
              </View>

              {/* Availability */}
              <View style={[styles.stockBadge, !data.item.isAvailable && styles.stockBadgeOOS]}>
                <Text style={[styles.stockText, !data.item.isAvailable && styles.stockTextOOS]}>
                  {data.item.isAvailable
                    ? `In Stock (${data.item.stockQty} left)`
                    : 'Out of Stock'}
                </Text>
              </View>

              {/* Store info */}
              <View style={styles.storeCard}>
                <View style={styles.storeIcon}>
                  <Text style={{ fontSize: 20 }}>🏪</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.storeName}>{data.store.name}</Text>
                  <Text style={styles.storeAddress} numberOfLines={1}>
                    {data.store.address}
                  </Text>
                </View>
                {data.distanceKm !== undefined && (
                  <Text style={styles.distance}>{data.distanceKm.toFixed(1)} km</Text>
                )}
              </View>
            </View>
          </ScrollView>

          {/* Bottom action bar */}
          {data.item.isAvailable && (
            <View style={styles.actionBar}>
              {/* Qty selector */}
              <View style={styles.qtySelector}>
                <TouchableOpacity
                  style={styles.qtyButton}
                  onPress={() => setQty((q) => Math.max(1, q - 1))}
                >
                  <Text style={styles.qtyButtonText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.qtyValue}>{qty}</Text>
                <TouchableOpacity
                  style={styles.qtyButton}
                  onPress={() => setQty((q) => Math.min(data.item.stockQty, q + 1))}
                >
                  <Text style={styles.qtyButtonText}>+</Text>
                </TouchableOpacity>
              </View>

              {/* Add to cart */}
              <TouchableOpacity
                style={styles.addButton}
                onPress={handleAddToCart}
                activeOpacity={0.8}
              >
                <Text style={styles.addButtonText}>
                  {existingCartItem ? 'Update Cart' : 'Add to Cart'} · ₹
                  {(data.item.price * qty).toFixed(2)}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    position: 'absolute',
    top: 56,
    left: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  backIcon: {
    fontSize: 20,
    color: '#111827',
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 16,
    color: '#DC2626',
  },
  errorLink: {
    fontSize: 14,
    color: '#16A34A',
    fontWeight: '600',
  },
  image: {
    width: '100%',
    height: 280,
    backgroundColor: '#F3F4F6',
  },
  body: {
    padding: 20,
    gap: 12,
  },
  categoryTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#DCFCE7',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  categoryTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16A34A',
    textTransform: 'capitalize',
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 30,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  price: {
    fontSize: 28,
    fontWeight: '700',
    color: '#16A34A',
  },
  unit: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  stockBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F0FDF4',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  stockBadgeOOS: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  stockText: {
    fontSize: 12,
    color: '#16A34A',
    fontWeight: '600',
  },
  stockTextOOS: {
    color: '#DC2626',
  },
  storeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    gap: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  storeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF7ED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  storeName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  storeAddress: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  distance: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  actionBar: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  qtySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    overflow: 'hidden',
  },
  qtyButton: {
    width: 40,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyButtonText: {
    fontSize: 22,
    fontWeight: '500',
    color: '#16A34A',
  },
  qtyValue: {
    minWidth: 32,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  addButton: {
    flex: 1,
    backgroundColor: '#16A34A',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
