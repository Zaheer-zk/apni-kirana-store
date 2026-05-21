import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api } from '@/lib/api';
import { useRestockCart, restockCartList } from '@/store/restock-cart.store';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

type PaymentMethod = 'CASH_ON_DELIVERY' | 'ONLINE';

export default function RestockCartScreen() {
  const queryClient = useQueryClient();
  const cartItems = useRestockCart((s) => s.items);
  const setQty = useRestockCart((s) => s.setQty);
  const clear = useRestockCart((s) => s.clear);

  const [payment, setPayment] = useState<PaymentMethod>('CASH_ON_DELIVERY');
  const items = useMemo(() => restockCartList(cartItems), [cartItems]);

  const placeOrder = useMutation({
    mutationFn: async () => {
      const res = await api.post('/api/v1/orders/restock', {
        items: items.map((i) => ({ catalogItemId: i.catalogItemId, qty: i.qty })),
        paymentMethod: payment,
      });
      return res.data?.data;
    },
    onSuccess: (order: { total?: number } | undefined) => {
      clear();
      queryClient.invalidateQueries({ queryKey: ['restock-orders'] });
      Alert.alert(
        'Restock order placed',
        `We're matching your order with the best wholesaler${
          order?.total != null ? ` — estimated total ₹${order.total.toFixed(2)}` : ''
        }. You'll be notified once a wholesaler accepts.`,
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
            subtitle="Add items from the Restock tab to place an order."
          />
          <Button
            variant="primary"
            title="Browse items"
            onPress={() => router.replace('/(tabs)/restock')}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card padding={spacing.md}>
          {items.map((item, idx) => (
            <View
              key={item.catalogItemId}
              style={[styles.itemRow, idx > 0 && styles.itemRowBorder]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.itemMeta}>
                  {item.unit ? `${item.unit} · ` : ''}
                  {item.category}
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
                  onPress={() => setQty(item, item.qty + 1)}
                >
                  <Ionicons name="add" size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
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

        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
          <Text style={styles.noteText}>
            We&apos;ll match your order to the best in-range wholesaler. The final price and
            delivery fee are confirmed once a wholesaler accepts.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          variant="primary"
          title={`Place restock order · ${items.length} item${items.length === 1 ? '' : 's'}`}
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

  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  itemRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  itemName: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  itemMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },

  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    paddingHorizontal: 2,
  },
  stepBtn: { padding: 6 },
  stepQty: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.textPrimary,
    minWidth: 18,
    textAlign: 'center',
  },

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

  note: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.gray100,
  },
  noteText: { flex: 1, fontSize: fontSize.xs, color: colors.textSecondary, lineHeight: 18 },

  footer: {
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
});
