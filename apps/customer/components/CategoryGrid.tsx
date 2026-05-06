import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ItemCategory } from '@aks/shared';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

interface CategoryDef {
  category: ItemCategory;
  label: string;
  emoji: string;
  bg: string;
}

const CATEGORIES: CategoryDef[] = [
  { category: ItemCategory.GROCERY, label: 'Grocery', emoji: '🛒', bg: '#DCFCE7' },
  { category: ItemCategory.MEDICINE, label: 'Medicine', emoji: '💊', bg: '#FEE2E2' },
  { category: ItemCategory.HOUSEHOLD, label: 'Household', emoji: '🧹', bg: '#DBEAFE' },
  { category: ItemCategory.SNACKS, label: 'Snacks', emoji: '🍿', bg: '#FEF3C7' },
  { category: ItemCategory.BEVERAGES, label: 'Beverages', emoji: '🥤', bg: '#E0E7FF' },
  { category: ItemCategory.OTHER, label: 'Other', emoji: '📦', bg: '#F3F4F6' },
];

interface CategoryGridProps {
  onSelect?: (category: ItemCategory) => void;
}

export function CategoryGrid({ onSelect }: CategoryGridProps) {
  function handlePress(category: ItemCategory) {
    if (onSelect) {
      onSelect(category);
      return;
    }
    router.push({ pathname: '/(tabs)/search', params: { category } });
  }

  return (
    <View style={styles.grid}>
      {CATEGORIES.map((item) => (
        <TouchableOpacity
          key={item.category}
          style={styles.tile}
          activeOpacity={0.7}
          onPress={() => handlePress(item.category)}
        >
          <View style={[styles.iconCircle, { backgroundColor: item.bg }]}>
            <Text style={styles.emoji}>{item.emoji}</Text>
          </View>
          <Text style={styles.label} numberOfLines={1}>
            {item.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
  },
  tile: {
    width: '33.333%',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emoji: {
    fontSize: 28,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },
});
