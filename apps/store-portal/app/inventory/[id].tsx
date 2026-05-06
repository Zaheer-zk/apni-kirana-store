import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useStorePortalStore } from '@/store/store.store';
import type { StoreInventoryItem } from '@/app/(tabs)/inventory';

// ---------------------------------------------------------------------------
// Tolerant unwrap
// ---------------------------------------------------------------------------
function unwrapItem(body: any): StoreInventoryItem | null {
  if (!body) return null;
  if (body.id && body.catalogItemId !== undefined) return body as StoreInventoryItem;
  if (body.data?.id) return body.data as StoreInventoryItem;
  return null;
}

export default function EditItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const storeId = useStorePortalStore((s) => s.storeProfile?.id);

  const { data: item, isLoading } = useQuery<StoreInventoryItem | null>({
    queryKey: ['inventoryItem', id],
    enabled: !!id,
    queryFn: async () => {
      const res = await api.get(`/api/v1/items/${id}`);
      return unwrapItem(res.data);
    },
  });

  const [price, setPrice] = useState('');
  const [stockQty, setStockQty] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);

  // Pre-fill form when item loads
  useEffect(() => {
    if (item) {
      setPrice(String(item.price));
      setStockQty(String(item.stockQty));
      setIsAvailable(item.isAvailable);
    }
  }, [item]);

  const updateItemMutation = useMutation({
    mutationFn: (payload: { price: number; stockQty: number; isAvailable: boolean }) =>
      api.put(`/api/v1/items/${id}`, payload).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storeInventory', storeId] });
      queryClient.invalidateQueries({ queryKey: ['inventoryItem', id] });
      router.back();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const handleSubmit = () => {
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      return Alert.alert('Validation', 'Enter a valid price');
    }
    const stockNum = parseInt(stockQty, 10);
    if (isNaN(stockNum) || stockNum < 0) {
      return Alert.alert('Validation', 'Enter a valid stock quantity');
    }
    updateItemMutation.mutate({ price: priceNum, stockQty: stockNum, isAvailable });
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.notFoundText}>Item not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Catalog identity (read-only) */}
      <View style={styles.headerCard}>
        <View style={styles.headerImage}>
          <Text style={styles.headerImageEmoji}>🛒</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{item.name}</Text>
          <Text style={styles.headerMeta}>
            {item.unit} · {item.category}
          </Text>
          <Text style={styles.headerHint}>From master catalog</Text>
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.rowField}>
          <Text style={styles.label}>Price (₹) *</Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            keyboardType="decimal-pad"
            value={price}
            onChangeText={setPrice}
          />
        </View>
        <View style={styles.rowField}>
          <Text style={styles.label}>Stock qty *</Text>
          <TextInput
            style={styles.input}
            placeholder="0"
            keyboardType="number-pad"
            value={stockQty}
            onChangeText={setStockQty}
          />
        </View>
      </View>

      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Available for orders</Text>
          <Text style={styles.toggleHint}>
            Customers can {isAvailable ? '' : 'not '}order this item right now
          </Text>
        </View>
        <Switch
          value={isAvailable}
          onValueChange={setIsAvailable}
          trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
          thumbColor={isAvailable ? '#2563EB' : '#9CA3AF'}
        />
      </View>

      <TouchableOpacity
        style={[styles.submitButton, updateItemMutation.isPending && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={updateItemMutation.isPending}
      >
        {updateItemMutation.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Save Changes</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingBottom: 48 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  notFoundText: { fontSize: 15, color: '#6B7280' },

  headerCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  headerImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerImageEmoji: { fontSize: 30 },
  headerInfo: { flex: 1, justifyContent: 'center' },
  headerName: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 2 },
  headerMeta: { fontSize: 13, color: '#6B7280' },
  headerHint: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },

  label: { fontSize: 14, color: '#374151', fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 50,
    fontSize: 15,
    color: '#111827',
  },
  row: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  rowField: { flex: 1 },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 24,
  },
  toggleHint: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },

  submitButton: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
