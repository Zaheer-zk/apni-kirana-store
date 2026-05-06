import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { api } from '@/lib/api';
import type { ItemCategory } from '@aks/shared';

const CATEGORIES: { label: string; value: ItemCategory }[] = [
  { label: 'Grocery', value: 'GROCERY' },
  { label: 'Dairy', value: 'DAIRY' },
  { label: 'Beverages', value: 'BEVERAGES' },
  { label: 'Snacks', value: 'SNACKS' },
  { label: 'Personal Care', value: 'PERSONAL_CARE' },
  { label: 'Household', value: 'HOUSEHOLD' },
];

const UNITS = ['kg', 'g', 'L', 'ml', 'piece', 'pack', 'dozen', 'box', 'bottle'];

interface AddItemPayload {
  name: string;
  description: string;
  category: ItemCategory;
  price: number;
  unit: string;
  stockQty: number;
  imageUrl?: string;
}

export default function AddItemScreen() {
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ItemCategory>('GROCERY');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('piece');
  const [stockQty, setStockQty] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);

  const addItemMutation = useMutation({
    mutationFn: async (payload: AddItemPayload) => {
      // Upload image first if selected
      let imageUrl: string | undefined;
      if (imageUri) {
        const formData = new FormData();
        const filename = imageUri.split('/').pop() ?? 'image.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : 'image/jpeg';
        formData.append('image', { uri: imageUri, name: filename, type } as any);
        const uploadRes = await api.post<{ url: string }>('/api/v1/upload/image', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        imageUrl = uploadRes.data.url;
      }
      return api.post('/api/v1/items', { ...payload, imageUrl }).then((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      router.back();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow photo library access to upload images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const handleSubmit = () => {
    if (!name.trim()) return Alert.alert('Validation', 'Item name is required');
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) return Alert.alert('Validation', 'Enter a valid price');
    const stockNum = parseInt(stockQty, 10);
    if (isNaN(stockNum) || stockNum < 0) return Alert.alert('Validation', 'Enter a valid stock quantity');

    addItemMutation.mutate({
      name: name.trim(),
      description: description.trim(),
      category,
      price: priceNum,
      unit,
      stockQty: stockNum,
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Image Picker */}
      <TouchableOpacity style={styles.imagePicker} onPress={pickImage} activeOpacity={0.8}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.imagePreview} />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.imagePlaceholderIcon}>📷</Text>
            <Text style={styles.imagePlaceholderText}>Add Product Image</Text>
          </View>
        )}
      </TouchableOpacity>

      <Text style={styles.label}>Item Name *</Text>
      <TextInput style={styles.input} placeholder="e.g. Tata Salt 1kg" value={name} onChangeText={setName} />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Optional description..."
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={2}
      />

      <Text style={styles.label}>Category *</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.value}
            style={[styles.chip, category === cat.value && styles.chipActive]}
            onPress={() => setCategory(cat.value)}
          >
            <Text style={[styles.chipText, category === cat.value && styles.chipTextActive]}>
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.row}>
        <View style={styles.rowField}>
          <Text style={styles.label}>Price (₹) *</Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            keyboardType="decimal-pad"
            value={price}
            onChangeText={setPrice}
          />
        </View>
        <View style={styles.rowField}>
          <Text style={styles.label}>Stock Qty *</Text>
          <TextInput
            style={styles.input}
            placeholder="0"
            keyboardType="number-pad"
            value={stockQty}
            onChangeText={setStockQty}
          />
        </View>
      </View>

      <Text style={styles.label}>Unit *</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
        {UNITS.map((u) => (
          <TouchableOpacity
            key={u}
            style={[styles.chip, unit === u && styles.chipActive]}
            onPress={() => setUnit(u)}
          >
            <Text style={[styles.chipText, unit === u && styles.chipTextActive]}>{u}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity
        style={[styles.submitButton, addItemMutation.isPending && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={addItemMutation.isPending}
      >
        {addItemMutation.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Add Item</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingBottom: 48 },
  imagePicker: {
    alignSelf: 'center',
    marginBottom: 24,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
  },
  imagePreview: { width: 140, height: 140 },
  imagePlaceholder: {
    width: 140,
    height: 140,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  imagePlaceholderIcon: { fontSize: 36 },
  imagePlaceholderText: { fontSize: 12, color: '#9CA3AF', textAlign: 'center' },
  label: { fontSize: 14, color: '#374151', fontWeight: '500', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 50,
    fontSize: 15,
    color: '#111827',
    marginBottom: 16,
  },
  textArea: { height: 70, paddingTop: 12, textAlignVertical: 'top' },
  categoryScroll: { marginBottom: 16 },
  chip: {
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: '#F9FAFB',
  },
  chipActive: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  chipText: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
  chipTextActive: { color: '#2563EB' },
  row: { flexDirection: 'row', gap: 12 },
  rowField: { flex: 1 },
  submitButton: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
