import { useMutation, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiClient } from '@/lib/api';
import { useCartStore } from '@/store/cart.store';
import type { Address, CartItem, Order } from '@aks/shared';
import { PaymentMethod } from '@aks/shared';

const DELIVERY_FEE = 30;

async function fetchAddresses(): Promise<Address[]> {
  const res = await apiClient.get<{ data: Address[] }>('/api/v1/addresses');
  return res.data.data ?? [];
}

async function placeOrder(payload: {
  items: CartItem[];
  deliveryAddressId: string;
  paymentMethod: PaymentMethod;
  promoCode?: string;
}): Promise<Order> {
  const res = await apiClient.post<{ data: Order }>('/api/v1/orders', payload);
  return res.data.data;
}

function CartItemRow({ item }: { item: CartItem }) {
  const { updateQty, removeItem } = useCartStore();
  return (
    <View style={styles.cartRow}>
      <View style={styles.cartRowLeft}>
        <Text style={styles.cartItemName}>{item.name}</Text>
        <Text style={styles.cartItemMeta}>
          ₹{item.price.toFixed(2)} / {item.unit}
        </Text>
      </View>
      <View style={styles.qtySelector}>
        <TouchableOpacity
          style={styles.qtyBtn}
          onPress={() => {
            if (item.qty === 1) {
              removeItem(item.itemId);
            } else {
              updateQty(item.itemId, item.qty - 1);
            }
          }}
        >
          <Text style={styles.qtyBtnText}>{item.qty === 1 ? '🗑' : '−'}</Text>
        </TouchableOpacity>
        <Text style={styles.qtyValue}>{item.qty}</Text>
        <TouchableOpacity
          style={styles.qtyBtn}
          onPress={() => updateQty(item.itemId, item.qty + 1)}
        >
          <Text style={styles.qtyBtnText}>+</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.cartRowTotal}>₹{(item.price * item.qty).toFixed(2)}</Text>
    </View>
  );
}

export default function CartScreen() {
  const { items, clearCart, total } = useCartStore();
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH_ON_DELIVERY);
  const [promoCode, setPromoCode] = useState('');

  const { data: addresses, isLoading: addressLoading } = useQuery({
    queryKey: ['addresses'],
    queryFn: fetchAddresses,
  });

  const mutation = useMutation({
    mutationFn: placeOrder,
    onSuccess: (order) => {
      clearCart();
      router.replace(`/order/${order.id}`);
    },
    onError: () => {
      Alert.alert('Error', 'Failed to place order. Please try again.');
    },
  });

  const subtotal = total();
  const grandTotal = subtotal + DELIVERY_FEE;

  function handlePlaceOrder() {
    if (items.length === 0) {
      Alert.alert('Cart Empty', 'Add some items before placing an order.');
      return;
    }
    if (!selectedAddressId) {
      Alert.alert('Address Required', 'Please select a delivery address.');
      return;
    }
    mutation.mutate({
      items,
      deliveryAddressId: selectedAddressId,
      paymentMethod,
      promoCode: promoCode.trim() || undefined,
    });
  }

  if (items.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🛒</Text>
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptySubtitle}>Add items from stores to get started.</Text>
          <TouchableOpacity
            style={styles.shopButton}
            onPress={() => router.push('/(tabs)/home')}
          >
            <Text style={styles.shopButtonText}>Browse Items</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton2} onPress={() => router.back()}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cart ({items.length})</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items</Text>
          {items.map((item) => (
            <CartItemRow key={item.itemId} item={item} />
          ))}
        </View>

        {/* Delivery Address */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery Address</Text>
          {addressLoading ? (
            <ActivityIndicator color="#16A34A" style={{ marginVertical: 12 }} />
          ) : addresses && addresses.length > 0 ? (
            addresses.map((addr) => (
              <TouchableOpacity
                key={addr.id}
                style={[
                  styles.addressOption,
                  selectedAddressId === addr.id && styles.addressOptionSelected,
                ]}
                onPress={() => setSelectedAddressId(addr.id)}
              >
                <View style={styles.radioOuter}>
                  {selectedAddressId === addr.id && <View style={styles.radioInner} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.addrLabel}>{addr.label}</Text>
                  <Text style={styles.addrStreet} numberOfLines={2}>
                    {addr.street}, {addr.city} — {addr.pincode}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={styles.noAddressText}>No saved addresses. Add one in your profile.</Text>
          )}
        </View>

        {/* Payment Method */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Method</Text>
          {(
            [
              { value: PaymentMethod.CASH_ON_DELIVERY, label: 'Cash on Delivery', emoji: '💵' },
              { value: PaymentMethod.ONLINE, label: 'Online Payment', emoji: '💳' },
            ] as const
          ).map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.addressOption,
                paymentMethod === opt.value && styles.addressOptionSelected,
              ]}
              onPress={() => setPaymentMethod(opt.value)}
            >
              <View style={styles.radioOuter}>
                {paymentMethod === opt.value && <View style={styles.radioInner} />}
              </View>
              <Text style={styles.payMethodEmoji}>{opt.emoji}</Text>
              <Text style={styles.addrLabel}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Promo code */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Promo Code</Text>
          <View style={styles.promoRow}>
            <TextInput
              style={styles.promoInput}
              placeholder="Enter promo code"
              placeholderTextColor="#9CA3AF"
              value={promoCode}
              onChangeText={setPromoCode}
              autoCapitalize="characters"
            />
            <TouchableOpacity style={styles.applyButton}>
              <Text style={styles.applyText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Order Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>₹{subtotal.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Delivery Fee</Text>
            <Text style={styles.summaryValue}>₹{DELIVERY_FEE.toFixed(2)}</Text>
          </View>
          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>₹{grandTotal.toFixed(2)}</Text>
          </View>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Place Order button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.placeOrderButton, mutation.isPending && styles.placeOrderButtonDisabled]}
          onPress={handlePlaceOrder}
          disabled={mutation.isPending}
          activeOpacity={0.85}
        >
          {mutation.isPending ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.placeOrderText}>Place Order</Text>
              <Text style={styles.placeOrderTotal}>₹{grandTotal.toFixed(2)}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    position: 'absolute',
    top: 100,
    left: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButton2: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    fontSize: 20,
    color: '#111827',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  scroll: {
    padding: 16,
    gap: 12,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  cartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  cartRowLeft: {
    flex: 1,
    gap: 2,
  },
  cartItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  cartItemMeta: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  qtySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    overflow: 'hidden',
  },
  qtyBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyBtnText: {
    fontSize: 16,
    color: '#16A34A',
  },
  qtyValue: {
    minWidth: 24,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  cartRowTotal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#16A34A',
    minWidth: 64,
    textAlign: 'right',
  },
  addressOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  addressOptionSelected: {
    borderColor: '#16A34A',
    backgroundColor: '#F0FDF4',
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#16A34A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#16A34A',
  },
  addrLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  addrStreet: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  noAddressText: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 8,
  },
  payMethodEmoji: {
    fontSize: 18,
  },
  promoRow: {
    flexDirection: 'row',
    gap: 10,
  },
  promoInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  applyButton: {
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#16A34A',
    justifyContent: 'center',
  },
  applyText: {
    color: '#16A34A',
    fontWeight: '600',
    fontSize: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  summaryValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
  },
  totalRow: {
    paddingTop: 10,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#16A34A',
  },
  footer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  placeOrderButton: {
    backgroundColor: '#16A34A',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  placeOrderButtonDisabled: {
    backgroundColor: '#86EFAC',
    justifyContent: 'center',
  },
  placeOrderText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  placeOrderTotal: {
    color: '#DCFCE7',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 60,
  },
  emptyEmoji: {
    fontSize: 56,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  shopButton: {
    marginTop: 16,
    backgroundColor: '#16A34A',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 10,
  },
  shopButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
});
