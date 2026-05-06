import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Animated,
  PanResponder,
  Image,
  Dimensions,
} from 'react-native';
import type { InventoryItemType } from '@aks/shared';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = 80;
const ACTION_WIDTH = 140; // total width of action buttons revealed on swipe

interface Props {
  item: InventoryItemType;
  onToggleAvailability: (available: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function InventoryItem({ item, onToggleAvailability, onEdit, onDelete }: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const lastOffset = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        return Math.abs(gestureState.dx) > 8 && Math.abs(gestureState.dy) < 12;
      },
      onPanResponderGrant: () => {
        translateX.setOffset(lastOffset.current);
        translateX.setValue(0);
      },
      onPanResponderMove: (_evt, gestureState) => {
        // Only allow left swipe (negative dx)
        const newValue = Math.min(0, gestureState.dx);
        translateX.setValue(newValue);
      },
      onPanResponderRelease: (_evt, gestureState) => {
        translateX.flattenOffset();
        if (gestureState.dx < -SWIPE_THRESHOLD) {
          // Open actions
          Animated.spring(translateX, {
            toValue: -ACTION_WIDTH,
            useNativeDriver: true,
            friction: 8,
          }).start();
          lastOffset.current = -ACTION_WIDTH;
        } else {
          // Close actions
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            friction: 8,
          }).start();
          lastOffset.current = 0;
        }
      },
    })
  ).current;

  const closeSwipe = () => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      friction: 8,
    }).start();
    lastOffset.current = 0;
  };

  return (
    <View style={styles.container}>
      {/* Background action buttons */}
      <View style={styles.actionsBackground}>
        <TouchableOpacity
          style={styles.editAction}
          onPress={() => {
            closeSwipe();
            onEdit();
          }}
        >
          <Text style={styles.editActionIcon}>✏️</Text>
          <Text style={styles.editActionText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteAction}
          onPress={() => {
            closeSwipe();
            onDelete();
          }}
        >
          <Text style={styles.deleteActionIcon}>🗑️</Text>
          <Text style={styles.deleteActionText}>Delete</Text>
        </TouchableOpacity>
      </View>

      {/* Foreground card */}
      <Animated.View
        style={[styles.card, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        {/* Item Image */}
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.itemImage} />
        ) : (
          <View style={styles.itemImagePlaceholder}>
            <Text style={styles.itemImagePlaceholderText}>🛒</Text>
          </View>
        )}

        {/* Item Info */}
        <View style={styles.itemInfo}>
          <Text style={styles.itemName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.itemMeta}>
            {item.unit} · {item.category}
          </Text>
          <View style={styles.itemPriceRow}>
            <Text style={styles.itemPrice}>₹{item.price.toFixed(2)}</Text>
            <Text style={styles.itemStock}>
              Stock: <Text style={[styles.itemStockValue, item.stockQty === 0 && styles.outOfStock]}>
                {item.stockQty}
              </Text>
            </Text>
          </View>
        </View>

        {/* Availability Toggle */}
        <View style={styles.toggleContainer}>
          <Switch
            value={item.available}
            onValueChange={onToggleAvailability}
            trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
            thumbColor={item.available ? '#2563EB' : '#9CA3AF'}
          />
          <Text style={[styles.availabilityText, item.available ? styles.availableText : styles.unavailableText]}>
            {item.available ? 'On' : 'Off'}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'relative', borderRadius: 12, overflow: 'hidden' },
  actionsBackground: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: ACTION_WIDTH,
    flexDirection: 'row',
  },
  editAction: {
    flex: 1,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  editActionIcon: { fontSize: 18 },
  editActionText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  deleteAction: {
    flex: 1,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  deleteActionIcon: { fontSize: 18 },
  deleteActionText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  itemImage: { width: 60, height: 60, borderRadius: 10 },
  itemImagePlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemImagePlaceholderText: { fontSize: 28 },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 },
  itemMeta: { fontSize: 12, color: '#9CA3AF', marginBottom: 4 },
  itemPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemPrice: { fontSize: 15, fontWeight: '800', color: '#111827' },
  itemStock: { fontSize: 12, color: '#9CA3AF' },
  itemStockValue: { color: '#6B7280', fontWeight: '700' },
  outOfStock: { color: '#DC2626' },
  toggleContainer: { alignItems: 'center', gap: 4 },
  availabilityText: { fontSize: 10, fontWeight: '700' },
  availableText: { color: '#2563EB' },
  unavailableText: { color: '#9CA3AF' },
});
