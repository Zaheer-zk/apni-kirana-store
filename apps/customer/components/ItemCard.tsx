import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { ItemCategory, type InventoryItem } from '@aks/shared';
import { useCartStore } from '@/store/cart.store';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';

interface ItemCardProps {
  item: InventoryItem;
  onPress?: () => void;
  variant?: 'horizontal' | 'compact';
  style?: ViewStyle;
}

const CATEGORY_EMOJI: Record<ItemCategory, string> = {
  [ItemCategory.GROCERY]: '🛒',
  [ItemCategory.MEDICINE]: '💊',
  [ItemCategory.HOUSEHOLD]: '🧹',
  [ItemCategory.SNACKS]: '🍿',
  [ItemCategory.BEVERAGES]: '🥤',
  [ItemCategory.OTHER]: '📦',
};

export function ItemCard({ item, onPress, variant = 'horizontal', style }: ItemCardProps) {
  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const updateQty = useCartStore((s) => s.updateQty);

  const cartItem = items.find((i) => i.itemId === item.id);
  const qty = cartItem?.qty ?? 0;

  function handleAdd(e?: { stopPropagation?: () => void }) {
    e?.stopPropagation?.();
    addItem({
      itemId: item.id,
      name: item.name,
      price: item.price,
      unit: item.unit,
      qty: 1,
      imageUrl: item.imageUrl,
    });
  }

  function handleInc(e?: { stopPropagation?: () => void }) {
    e?.stopPropagation?.();
    updateQty(item.id, qty + 1);
  }

  function handleDec(e?: { stopPropagation?: () => void }) {
    e?.stopPropagation?.();
    updateQty(item.id, qty - 1);
  }

  const isCompact = variant === 'compact';

  return (
    <TouchableOpacity
      style={[styles.card, isCompact && styles.cardCompact, style]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.thumb, isCompact && styles.thumbCompact]}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.image} resizeMode="cover" />
        ) : (
          <Text style={styles.emoji}>{CATEGORY_EMOJI[item.category]}</Text>
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.unit} numberOfLines={1}>
          {item.unit}
        </Text>

        <View style={styles.footer}>
          <Text style={styles.price}>₹{item.price.toFixed(0)}</Text>

          {!item.isAvailable ? (
            <View style={styles.oosTag}>
              <Text style={styles.oosText}>Out</Text>
            </View>
          ) : qty === 0 ? (
            <TouchableOpacity
              style={styles.addButton}
              onPress={handleAdd}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={16} color={colors.white} />
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.stepper}>
              <TouchableOpacity
                onPress={handleDec}
                activeOpacity={0.7}
                style={styles.stepperBtn}
                hitSlop={6}
              >
                <Ionicons name="remove" size={16} color={colors.white} />
              </TouchableOpacity>
              <Text style={styles.stepperQty}>{qty}</Text>
              <TouchableOpacity
                onPress={handleInc}
                activeOpacity={0.7}
                style={styles.stepperBtn}
                hitSlop={6}
              >
                <Ionicons name="add" size={16} color={colors.white} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
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
  cardCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
    width: 160,
    gap: spacing.sm,
  },
  thumb: {
    width: 80,
    height: 80,
    borderRadius: radius.md,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbCompact: {
    width: '100%',
    height: 100,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  emoji: {
    fontSize: 36,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 20,
  },
  unit: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  price: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.primary,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    gap: 2,
  },
  addButtonText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  stepperBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperQty: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '700',
    minWidth: 20,
    textAlign: 'center',
  },
  oosTag: {
    backgroundColor: colors.gray100,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  oosText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
});
