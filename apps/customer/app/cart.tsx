import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Header } from '@/components/Header';
import { apiClient } from '@/lib/api';
import { useCartStore } from '@/store/cart.store';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';
import { BASE_DELIVERY_FEE, PaymentMethod, type Address, type CartItem, type Order } from '@aks/shared';

async function fetchAddresses(): Promise<Address[]> {
  try {
    const res = await apiClient.get<{ data: Address[] } | Address[]>('/api/v1/addresses');
    const payload = res.data as unknown;
    if (Array.isArray(payload)) return payload as Address[];
    return ((payload as { data?: Address[] }).data ?? []) as Address[];
  } catch {
    return [];
  }
}

async function placeOrderRequest(payload: {
  items: Array<{ itemId: string; qty: number }>;
  deliveryAddressId: string;
  paymentMethod: PaymentMethod;
  promoCode?: string;
}): Promise<Order> {
  const res = await apiClient.post<{ data: Order } | Order>('/api/v1/orders', payload);
  const data = res.data as unknown;
  return ((data as { data?: Order }).data ?? data) as Order;
}

function CartItemRow({ item }: { item: CartItem }) {
  const updateQty = useCartStore((s) => s.updateQty);
  const removeItem = useCartStore((s) => s.removeItem);

  return (
    <View style={styles.cartRow}>
      <View style={styles.thumb}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.thumbImage} resizeMode="cover" />
        ) : (
          <Ionicons name="cube-outline" size={24} color={colors.textSecondary} />
        )}
      </View>

      <View style={styles.cartBody}>
        <Text style={styles.itemName} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.itemUnit}>{item.unit}</Text>
        <Text style={styles.itemPrice}>₹{(item.price * item.qty).toFixed(0)}</Text>
      </View>

      <View style={styles.qtyRow}>
        <TouchableOpacity
          style={styles.qtyBtn}
          activeOpacity={0.7}
          onPress={() => {
            if (item.qty === 1) removeItem(item.itemId);
            else updateQty(item.itemId, item.qty - 1);
          }}
        >
          <Ionicons
            name={item.qty === 1 ? 'trash-outline' : 'remove'}
            size={16}
            color={colors.white}
          />
        </TouchableOpacity>
        <Text style={styles.qtyText}>{item.qty}</Text>
        <TouchableOpacity
          style={styles.qtyBtn}
          activeOpacity={0.7}
          onPress={() => updateQty(item.itemId, item.qty + 1)}
        >
          <Ionicons name="add" size={16} color={colors.white} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function CartScreen() {
  const items = useCartStore((s) => s.items);
  const total = useCartStore((s) => s.total);
  const clearCart = useCartStore((s) => s.clearCart);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH_ON_DELIVERY);
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);

  const subtotal = useMemo(() => total(), [items, total]);
  const deliveryFee = items.length === 0 ? 0 : BASE_DELIVERY_FEE;
  const discount = appliedPromo ? Math.min(50, subtotal * 0.1) : 0;
  const grandTotal = Math.max(0, subtotal + deliveryFee - discount);

  const addressesQuery = useQuery({ queryKey: ['addresses'], queryFn: fetchAddresses });
  const defaultAddress =
    addressesQuery.data?.find((a) => a.isDefault) ?? addressesQuery.data?.[0];

  const orderMutation = useMutation({
    mutationFn: placeOrderRequest,
    onSuccess: (order) => {
      clearCart();
      router.replace(`/order/${order.id}`);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to place order';
      Alert.alert('Order failed', message);
    },
  });

  function handleApplyPromo() {
    if (!promoCode.trim()) return;
    setAppliedPromo(promoCode.trim().toUpperCase());
  }

  function handlePlaceOrder() {
    if (items.length === 0) return;
    if (!defaultAddress) {
      Alert.alert('Address required', 'Please add a delivery address before placing an order.');
      return;
    }
    orderMutation.mutate({
      items: items.map((i) => ({ itemId: i.itemId, qty: i.qty })),
      deliveryAddressId: defaultAddress.id,
      paymentMethod,
      promoCode: appliedPromo ?? undefined,
    });
  }

  if (items.length === 0) {
    return (
      <View style={styles.safe}>
        <EmptyState
          emoji="🛒"
          title="Your cart is empty"
          subtitle="Add items from your favourite stores to start shopping."
          actionLabel="Browse stores"
          onAction={() => router.replace('/(tabs)/home')}
        />
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items</Text>
          <View style={styles.cardGroup}>
            {items.map((item, idx) => (
              <View key={item.itemId}>
                <CartItemRow item={item} />
                {idx < items.length - 1 ? <View style={styles.itemDivider} /> : null}
              </View>
            ))}
          </View>
        </View>

        {/* Address */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Delivery Address</Text>
            <TouchableOpacity activeOpacity={0.7}>
              <Ionicons name="pencil" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>
          <View style={styles.cardGroup}>
            <View style={styles.addressRow}>
              <View style={styles.addressIcon}>
                <Ionicons name="location" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                {defaultAddress ? (
                  <>
                    <View style={styles.addressTitleRow}>
                      <Text style={styles.addressLabel}>{defaultAddress.label}</Text>
                      {defaultAddress.isDefault ? (
                        <Badge variant="success" text="Default" />
                      ) : null}
                    </View>
                    <Text style={styles.addressText}>
                      {defaultAddress.street}, {defaultAddress.city} — {defaultAddress.pincode}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.addressText}>
                    No saved address. Tap to add a delivery address.
                  </Text>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* Payment */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Method</Text>
          <View style={styles.cardGroup}>
            <PaymentRow
              icon="cash-outline"
              label="Cash on Delivery"
              hint="Pay when your order arrives"
              selected={paymentMethod === PaymentMethod.CASH_ON_DELIVERY}
              onPress={() => setPaymentMethod(PaymentMethod.CASH_ON_DELIVERY)}
            />
            <View style={styles.itemDivider} />
            <PaymentRow
              icon="card-outline"
              label="Pay Online"
              hint="UPI, cards & wallets"
              selected={paymentMethod === PaymentMethod.ONLINE}
              onPress={() => setPaymentMethod(PaymentMethod.ONLINE)}
            />
          </View>
        </View>

        {/* Promo */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Promo Code</Text>
          <View style={[styles.cardGroup, styles.promoCard]}>
            <Ionicons name="pricetag-outline" size={18} color={colors.primary} />
            <TextInput
              style={styles.promoInput}
              placeholder="Enter promo code"
              placeholderTextColor={colors.textMuted}
              value={promoCode}
              onChangeText={setPromoCode}
              autoCapitalize="characters"
            />
            <TouchableOpacity
              style={styles.promoBtn}
              activeOpacity={0.7}
              onPress={handleApplyPromo}
            >
              <Text style={styles.promoBtnText}>{appliedPromo ? 'Applied' : 'Apply'}</Text>
            </TouchableOpacity>
          </View>
          {appliedPromo ? (
            <View style={styles.promoApplied}>
              <Ionicons name="checkmark-circle" size={14} color={colors.success} />
              <Text style={styles.promoAppliedText}>"{appliedPromo}" applied — ₹{discount.toFixed(0)} off</Text>
            </View>
          ) : null}
        </View>

        {/* Bill */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bill Summary</Text>
          <View style={[styles.cardGroup, { padding: spacing.lg }]}>
            <BillRow label="Subtotal" value={subtotal} />
            <BillRow label="Delivery fee" value={deliveryFee} />
            {discount > 0 ? <BillRow label="Discount" value={-discount} highlight /> : null}
            <View style={styles.itemDivider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>₹{grandTotal.toFixed(0)}</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.footerSafe}>
        <View style={styles.footer}>
          <Button
            title={`Place Order  •  ₹${grandTotal.toFixed(0)}`}
            onPress={handlePlaceOrder}
            loading={orderMutation.isPending}
            size="lg"
            fullWidth
            icon="arrow-forward"
            iconPosition="right"
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

function BillRow({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <View style={styles.billRow}>
      <Text style={styles.billLabel}>{label}</Text>
      <Text style={[styles.billValue, highlight && { color: colors.success }]}>
        {value < 0 ? '- ' : ''}₹{Math.abs(value).toFixed(0)}
      </Text>
    </View>
  );
}

function PaymentRow({
  icon,
  label,
  hint,
  selected,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.paymentRow} activeOpacity={0.7} onPress={onPress}>
      <View style={[styles.payIcon, selected && { backgroundColor: colors.primaryLight }]}>
        <Ionicons name={icon} size={20} color={selected ? colors.primary : colors.textSecondary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.payLabel}>{label}</Text>
        <Text style={styles.payHint}>{hint}</Text>
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  cardGroup: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  cartBody: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  itemUnit: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  itemPrice: {
    marginTop: 4,
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.primary,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  qtyBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '800',
    minWidth: 22,
    textAlign: 'center',
  },
  itemDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.lg,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
  },
  addressIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 4,
  },
  addressLabel: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  addressText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  payIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payLabel: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  payHint: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
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
  promoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  promoInput: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },
  promoBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
  },
  promoBtnText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  promoApplied: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    marginLeft: spacing.xs,
  },
  promoAppliedText: {
    fontSize: fontSize.xs,
    color: colors.success,
    fontWeight: '700',
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  billLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  billValue: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  totalLabel: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  totalValue: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.primary,
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
