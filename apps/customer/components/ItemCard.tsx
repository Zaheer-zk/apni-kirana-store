import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import type { InventoryItem } from '@aks/shared';

interface ItemCardProps {
  item: InventoryItem;
  onPress?: () => void;
  onAddToCart?: () => void;
  style?: ViewStyle;
}

export function ItemCard({ item, onPress, onAddToCart, style }: ItemCardProps) {
  return (
    <TouchableOpacity
      style={[styles.card, style]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Image */}
      <Image
        source={{ uri: item.imageUrl || 'https://via.placeholder.com/160x100' }}
        style={styles.image}
        resizeMode="cover"
      />

      {/* Body */}
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.unit}>{item.unit}</Text>

        <View style={styles.footer}>
          <Text style={styles.price}>₹{item.price.toFixed(2)}</Text>
          {item.isAvailable ? (
            <TouchableOpacity
              style={styles.addButton}
              onPress={(e) => {
                e.stopPropagation();
                onAddToCart?.();
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.addButtonText}>+ Add</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.oosTag}>
              <Text style={styles.oosText}>Out of stock</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  image: {
    width: '100%',
    height: 110,
    backgroundColor: '#F9FAFB',
  },
  body: {
    padding: 10,
    gap: 3,
  },
  name: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    lineHeight: 18,
  },
  unit: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  price: {
    fontSize: 14,
    fontWeight: '700',
    color: '#16A34A',
  },
  addButton: {
    backgroundColor: '#16A34A',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  oosTag: {
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  oosText: {
    fontSize: 10,
    color: '#9CA3AF',
    fontWeight: '500',
  },
});
