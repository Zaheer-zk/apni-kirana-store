import { router } from 'expo-router';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ItemCategory } from '@aks/shared';

const CATEGORIES: { category: ItemCategory; label: string; emoji: string; bg: string }[] = [
  { category: ItemCategory.GROCERY, label: 'Grocery', emoji: '🥦', bg: '#DCFCE7' },
  { category: ItemCategory.MEDICINE, label: 'Medicine', emoji: '💊', bg: '#DBEAFE' },
  { category: ItemCategory.HOUSEHOLD, label: 'Household', emoji: '🧹', bg: '#FEF9C3' },
  { category: ItemCategory.SNACKS, label: 'Snacks', emoji: '🍿', bg: '#FFEDD5' },
  { category: ItemCategory.BEVERAGES, label: 'Beverages', emoji: '🥤', bg: '#EDE9FE' },
  { category: ItemCategory.OTHER, label: 'Other', emoji: '📦', bg: '#F3F4F6' },
];

interface CategoryGridProps {
  onSelect?: (category: ItemCategory) => void;
}

export function CategoryGrid({ onSelect }: CategoryGridProps) {
  function handlePress(category: ItemCategory) {
    if (onSelect) {
      onSelect(category);
    } else {
      router.push(`/(tabs)/search?category=${category}`);
    }
  }

  return (
    <View style={styles.grid}>
      {CATEGORIES.map((cat) => (
        <TouchableOpacity
          key={cat.category}
          style={[styles.cell, { backgroundColor: cat.bg }]}
          onPress={() => handlePress(cat.category)}
          activeOpacity={0.75}
        >
          <Text style={styles.emoji}>{cat.emoji}</Text>
          <Text style={styles.label}>{cat.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 8,
  },
  cell: {
    width: '30%',
    flexGrow: 1,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 6,
    minWidth: 96,
  },
  emoji: {
    fontSize: 28,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
});
