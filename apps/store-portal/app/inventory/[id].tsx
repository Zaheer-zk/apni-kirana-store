import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useStorePortalStore } from '@/store/store.store';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { Skeleton } from '@/components/Skeleton';
import { colors, fontSize, radius, spacing } from '@/constants/theme';
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
  // Use real header height instead of hardcoded 100 — Android's bar height differs from iOS
  const headerHeight = useHeaderHeight();

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
  const [errors, setErrors] = useState<{ price?: string; stockQty?: string }>({});

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
    const next: { price?: string; stockQty?: string } = {};
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) next.price = 'Enter a valid price';
    const stockNum = parseInt(stockQty, 10);
    if (isNaN(stockNum) || stockNum < 0) next.stockQty = 'Enter a valid stock quantity';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    updateItemMutation.mutate({ price: priceNum, stockQty: stockNum, isAvailable });
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={{ padding: spacing.xl, gap: spacing.md, width: '100%' }}>
          <Skeleton height={88} radius={radius.lg} />
          <Skeleton height={50} radius={radius.md} />
          <Skeleton height={50} radius={radius.md} />
          <Skeleton height={64} radius={radius.lg} />
        </View>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
        <Text style={styles.notFoundText}>Item not found</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: headerHeight + spacing.md }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Catalog identity (read-only) */}
        <Card padding={spacing.lg} style={styles.headerCard}>
          <View style={styles.headerImage}>
            <Ionicons name="cube" size={28} color={colors.primary} />
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.headerName}>{item.name}</Text>
            <Text style={styles.headerMeta}>
              {item.unit} · {item.category}
            </Text>
            <Text style={styles.headerHint}>From master catalog</Text>
          </View>
        </Card>

        <View style={styles.formRow}>
          <View style={{ flex: 1 }}>
            <Input
              label="Price (₹) *"
              placeholder="0.00"
              keyboardType="decimal-pad"
              value={price}
              onChangeText={(v) => {
                setPrice(v);
                if (errors.price) setErrors({ ...errors, price: undefined });
              }}
              error={errors.price}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label="Stock qty *"
              placeholder="0"
              keyboardType="number-pad"
              value={stockQty}
              onChangeText={(v) => {
                setStockQty(v);
                if (errors.stockQty) setErrors({ ...errors, stockQty: undefined });
              }}
              error={errors.stockQty}
            />
          </View>
        </View>

        <Card padding={spacing.lg} style={styles.toggleRow}>
          <View style={{ flex: 1, paddingRight: spacing.md }}>
            <Text style={styles.toggleTitle}>Available for orders</Text>
            <Text style={styles.toggleHint}>
              Customers can {isAvailable ? '' : 'not '}order this item right now
            </Text>
          </View>
          <Switch
            value={isAvailable}
            onValueChange={setIsAvailable}
            trackColor={{ false: colors.gray300, true: colors.primaryLight }}
            thumbColor={isAvailable ? colors.primary : colors.gray400}
          />
        </Card>

        <Button
          title="Save changes"
          icon="save-outline"
          onPress={handleSubmit}
          loading={updateItemMutation.isPending}
          disabled={updateItemMutation.isPending}
          fullWidth
          size="lg"
          style={{ marginTop: spacing.md }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  // paddingTop is set dynamically (header height + spacing); was hardcoded 100 which double-stacks on Android
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.lg },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  notFoundText: { fontSize: fontSize.md, color: colors.textSecondary, marginTop: spacing.md },

  headerCard: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  headerImage: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfo: { flex: 1 },
  headerName: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  headerMeta: { fontSize: fontSize.sm, color: colors.textSecondary },
  headerHint: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 4 },

  formRow: { flexDirection: 'row', gap: spacing.md },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  toggleHint: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
});
