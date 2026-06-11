import { Ionicons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { FavoriteEntry } from '@aks/shared';
import { apiClient } from '@/lib/api';
import { fetchFavorites } from '@/lib/favorites';
import { FavoriteHeart } from '@/components/FavoriteHeart';
import { EmptyState } from '@/components/EmptyState';
import { useCartStore } from '@/store/cart.store';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';

const DEFAULT_LAT = 28.6315;
const DEFAULT_LNG = 77.2167;

async function fetchCoords(): Promise<{ lat: number; lng: number }> {
  try {
    const res = await apiClient.get('/api/v1/users/me');
    const body = res.data as { data?: { defaultAddress?: { lat?: number; lng?: number } | null } };
    const addr = body?.data?.defaultAddress;
    if (addr && typeof addr.lat === 'number' && typeof addr.lng === 'number') {
      return { lat: addr.lat, lng: addr.lng };
    }
  } catch {
    // fall through to default
  }
  return { lat: DEFAULT_LAT, lng: DEFAULT_LNG };
}

export default function FavoritesScreen() {
  const coordsQuery = useQuery({ queryKey: ['me', 'coords'], queryFn: fetchCoords });
  const coords = coordsQuery.data;

  const favQuery = useQuery({
    queryKey: ['favorites', 'list', coords?.lat, coords?.lng],
    queryFn: () => fetchFavorites(coords),
    enabled: !!coords,
  });

  const loading = coordsQuery.isLoading || favQuery.isLoading;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ title: 'Favorites', headerShown: true }} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : favQuery.isError ? (
        <View style={styles.center}>
          <EmptyState
            icon="alert-circle-outline"
            title="Couldn't load favorites"
            subtitle="Pull to retry in a moment."
          />
        </View>
      ) : !favQuery.data || favQuery.data.length === 0 ? (
        <View style={styles.center}>
          <EmptyState
            icon="heart-outline"
            title="No favorites yet"
            subtitle="Tap the heart on any product to save it here for quick reordering."
          />
        </View>
      ) : (
        <FlatList
          data={favQuery.data}
          keyExtractor={(f) => f.catalogItemId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <FavoriteRow fav={item} />}
        />
      )}
    </SafeAreaView>
  );
}

function FavoriteRow({ fav }: { fav: FavoriteEntry }) {
  const addItem = useCartStore((s) => s.addItem);
  const offer = fav.bestOffer;
  const outOfStock = !offer || offer.stockQty <= 0;

  function handleAdd() {
    if (!offer) return;
    addItem({
      catalogItemId: fav.catalogItemId,
      itemId: offer.storeItemId,
      name: fav.name,
      price: offer.customerPrice,
      unit: fav.unit,
      qty: 1,
      imageUrl: fav.imageUrl ?? '',
    });
  }

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={() => offer && router.push(`/item/${offer.storeItemId}` as never)}
    >
      <View style={styles.thumb}>
        {fav.imageUrl ? (
          <Image source={{ uri: fav.imageUrl }} style={styles.image} resizeMode="cover" />
        ) : (
          <Text style={styles.emoji}>🛒</Text>
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {fav.name}
        </Text>
        <Text style={styles.unit}>{fav.unit}</Text>
        {offer ? (
          <Text style={styles.store} numberOfLines={1}>
            {offer.store.name}
            {fav.offerCount > 1 ? ` · ${fav.offerCount} stores` : ''}
          </Text>
        ) : (
          <Text style={styles.unavailable}>Not available near you right now</Text>
        )}
      </View>

      <View style={styles.right}>
        <FavoriteHeart catalogItemId={fav.catalogItemId} size={20} />
        {offer ? <Text style={styles.price}>₹{offer.customerPrice.toFixed(0)}</Text> : null}
        <TouchableOpacity
          style={[styles.addBtn, outOfStock && styles.addBtnDisabled]}
          onPress={handleAdd}
          disabled={outOfStock}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={14} color={colors.white} />
          <Text style={styles.addText}>{outOfStock ? 'N/A' : 'Add'}</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  list: { padding: spacing.md, gap: spacing.md },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
    alignItems: 'center',
    ...shadow.small,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  emoji: { fontSize: 28 },
  body: { flex: 1, gap: 2 },
  name: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary, lineHeight: 20 },
  unit: { fontSize: fontSize.xs, color: colors.textSecondary },
  store: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  unavailable: { fontSize: fontSize.xs, color: '#B45309', marginTop: 2 },
  right: { alignItems: 'flex-end', gap: spacing.xs },
  price: { fontSize: fontSize.md, fontWeight: '700', color: colors.primary },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    gap: 2,
  },
  addBtnDisabled: { backgroundColor: colors.gray400 },
  addText: { color: colors.white, fontSize: fontSize.sm, fontWeight: '700' },
});
