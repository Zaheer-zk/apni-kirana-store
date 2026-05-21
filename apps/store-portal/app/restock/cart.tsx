import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api } from '@/lib/api';
import {
  useRestockCart,
  restockCartList,
  restockCartSubtotal,
} from '@/store/restock-cart.store';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

type PaymentMethod = 'CASH_ON_DELIVERY' | 'ONLINE';

export default function RestockCartScreen() {
  const queryClient = useQueryClient();
  const wholesalerId = useRestockCart((s) => s.wholesalerId);
  const wholesalerName = useRestockCart((s) => s.wholesalerName);
  const cartItems = useRestockCart((s) => s.items);
  const setQty = useRestockCart((s) => s.setQty);
  const clear = useRestockCart((s) => s.clear);

  const [payment, setPayment] = useState<PaymentMethod>('CASH_ON_DELIVERY');

  const items = useMemo(() => restockCartList(cartItems), [cartItems]);
  const subtotal = useMemo(() => restockCartSubtotal(cartItems), [cartItems]);

  const placeOrder = useMutation({
    mutationFn: async () => {
      const res = await api.post('/api/v1/orders/restock', {
        wholesalerId,
        items: items.map((i) => ({ storeItemId: i.storeItemId, qty: i.qty })),
        paymentMethod: payment,
      });
      return res.data?.data;
    },
    onSuccess: (order: { total?: number } | undefined) => {
      clear();
      queryClient.invalidateQueries({ queryKey: ['restock-orders'] });
      Alert.alert(
        'Restock order placed',
        `Your order with ${wholesalerName ?? 'the wholesaler'} has been sent${
          order?.total != null ? ` — total ₹${order.total.toFixed(2)}` : ''
        }. You'll be notified when it's accepted.`,
        [{ text: 'View orders', onPress: () => router.replace('/restock/orders') }],
      );
    },
    onError: (err: Error) => {
      Alert.alert('Could not place order', err.message);
    },
  });

  if (items.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="cart-outline"
            title="Your restock cart is empty"
            subtitle="Add items from a wholesaler to place a restock order."
          />
          <Button
            variant="primary"
            title="Browse wholesalers"
            onPress={() => router.replace('/(tabs)/restock')}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {wholesalerName ? (
          <View style={styles.wsRow}>
            <Ionicons name="business" size={16} color={colors.primary} />
            <Text style={styles.wsName}>{wholesalerName}</Text>
          </View>
        ) : null}

        <Card padding={spacing.md}>
          {items.map((item, idx) => (
            <View
              key={item.storeItemId}
              style={[styles.itemRow, idx > 0 && styles.itemRowBorder]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.itemMeta}>
                  ₹{item.price.toFixed(2)} / {item.unit}
                </Text>
              </View>
              <View style={styles.stepper}>
                <TouchableOpacity
                  style={styles.stepBtn}
                  activeOpacity={0.7}
                  onPress={() => setQty(item, item.qty - 1)}
                >
                  <Ionicons name="remove" size={16} color={colors.primary} />
                </TouchableOpacity>
                <Text style={styles.stepQty}>{item.qty}</Text>
                <TouchableOpacity
                  style={styles.stepBtn}
                  activeOpacity={0.7}
                  disabled={item.qty >= item.stockQty}
                  onPress={() => setQty(item, item.qty + 1)}
                >
                  <Ionicons
                    name="add"
                    size={16}
                    color={item.qty >= item.stockQty ? colors.textMuted : colors.primary}
                  />
                </TouchableOpacity>
              </View>
              <Text style={styles.itemLine}>₹{(item.price * item.qty).toFixed(2)}</Text>
            </View>
          ))}
        </Card>

        <Text style={styles.sectionLabel}>Payment</Text>
        <View style={styles.payRow}>
          {(['CASH_ON_DELIVERY', 'ONLINE'] as PaymentMethod[]).map((m) => {
            const active = payment === m;
            return (
              <TouchableOpacity
                key={m}
                activeOpacity={0.8}
                style={[styles.payOption, active && styles.payOptionActive]}
                onPress={() => setPayment(m)}
              >
                <Ionicons
                  name={m === 'CASH_ON_DELIVERY' ? 'cash-outline' : 'card-outline'}
                  size={18}
                  color={active ? colors.primary : colors.textMuted}
                />
                <Text style={[styles.payText, active && styles.payTextActive]}>
                  {m === 'CASH_ON_DELIVERY' ? 'Pay on delivery' : 'Online'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Card padding={spacing.md} style={{ marginTop: spacing.md }}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>₹{subtotal.toFixed(2)}</Text>
          </View>
          <Text style={styles.feeNote}>
            A delivery fee is added at checkout based on distance to your store.
          </Text>
        </Card>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          variant="primary"
          title={`Place restock order · ₹${subtotal.toFixed(2)}+`}
          fullWidth
          loading={placeOrder.isPending}
          disabled={placeOrder.isPending}
          onPress={() => placeOrder.mutate()}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  emptyWrap: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },

  wsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.md },
  wsName: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },

  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  itemRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  itemName: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  itemMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  itemLine: { fontSize: fontSize.sm, fontWeight: '800', color: colors.textPrimary, minWidth: 64, textAlign: 'right' },

  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    paddingHorizontal: 2,
  },
  stepBtn: { padding: 6 },
  stepQty: { fontSize: fontSize.sm, fontWeight: '800', color: colors.textPrimary, minWidth: 18, textAlign: 'center' },

  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  payRow: { flexDirection: 'row', gap: spacing.md },
  payOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  payOptionActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  payText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textMuted },
  payTextActive: { color: colors.primary },

  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: fontSize.md, color: colors.textSecondary, fontWeight: '600' },
  summaryValue: { fontSize: fontSize.md, fontWeight: '800', color: colors.textPrimary },
  feeNote: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.sm },

  footer: {
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
});
