import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { StoreCategory } from '@aks/shared';

const CATEGORIES: { label: string; value: StoreCategory }[] = [
  { label: 'Grocery', value: 'GROCERY' },
  { label: 'Pharmacy', value: 'PHARMACY' },
  { label: 'Bakery', value: 'BAKERY' },
  { label: 'Dairy', value: 'DAIRY' },
  { label: 'Vegetables & Fruits', value: 'VEGETABLES_FRUITS' },
  { label: 'General Store', value: 'GENERAL' },
];

interface RegisterPayload {
  name: string;
  description: string;
  category: StoreCategory;
  street: string;
  city: string;
  state: string;
  pincode: string;
  openingTime: string;
  closingTime: string;
}

interface RegisterResponse {
  message: string;
  storeId: string;
}

export default function StoreRegisterScreen() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<StoreCategory>('GROCERY');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [openingTime, setOpeningTime] = useState('09:00');
  const [closingTime, setClosingTime] = useState('21:00');
  const [submitted, setSubmitted] = useState(false);

  const registerMutation = useMutation<RegisterResponse, Error, RegisterPayload>({
    mutationFn: (payload) =>
      api.post<RegisterResponse>('/api/v1/stores/register', payload).then((r) => r.data),
    onSuccess: () => setSubmitted(true),
    onError: (err) => Alert.alert('Registration Failed', err.message || 'Please try again'),
  });

  const handleSubmit = () => {
    if (!name.trim()) return Alert.alert('Validation', 'Store name is required');
    if (!street.trim()) return Alert.alert('Validation', 'Street address is required');
    if (!city.trim()) return Alert.alert('Validation', 'City is required');
    if (!state.trim()) return Alert.alert('Validation', 'State is required');
    if (pincode.trim().length !== 6) return Alert.alert('Validation', 'Enter a valid 6-digit pincode');

    registerMutation.mutate({
      name: name.trim(),
      description: description.trim(),
      category,
      street: street.trim(),
      city: city.trim(),
      state: state.trim(),
      pincode: pincode.trim(),
      openingTime,
      closingTime,
    });
  };

  if (submitted) {
    return (
      <View style={styles.pendingContainer}>
        <Text style={styles.pendingIcon}>⏳</Text>
        <Text style={styles.pendingTitle}>Store Registered!</Text>
        <Text style={styles.pendingDesc}>
          Your store application is pending admin approval. You'll be able to start accepting orders
          once approved. This usually takes 24–48 hours.
        </Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/(auth)/login')}>
          <Text style={styles.backButtonText}>Back to Login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backArrow}>
        <Text style={styles.backArrowText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Register Your Store</Text>
      <Text style={styles.subtitle}>Fill in your store details to get started</Text>

      {/* Store Info */}
      <Text style={styles.sectionHeader}>Store Information</Text>

      <Text style={styles.label}>Store Name *</Text>
      <TextInput style={styles.input} placeholder="e.g. Sharma Kirana Store" value={name} onChangeText={setName} />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Brief description of your store..."
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={3}
      />

      <Text style={styles.label}>Category *</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.value}
            style={[styles.categoryChip, category === cat.value && styles.categoryChipSelected]}
            onPress={() => setCategory(cat.value)}
          >
            <Text
              style={[styles.categoryChipText, category === cat.value && styles.categoryChipTextSelected]}
            >
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Address */}
      <Text style={styles.sectionHeader}>Address</Text>

      <Text style={styles.label}>Street Address *</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Shop number, building, street name"
        value={street}
        onChangeText={setStreet}
        multiline
        numberOfLines={2}
      />

      <View style={styles.row}>
        <View style={styles.rowField}>
          <Text style={styles.label}>City *</Text>
          <TextInput style={styles.input} placeholder="City" value={city} onChangeText={setCity} />
        </View>
        <View style={styles.rowField}>
          <Text style={styles.label}>State *</Text>
          <TextInput style={styles.input} placeholder="State" value={state} onChangeText={setState} />
        </View>
      </View>

      <Text style={styles.label}>Pincode *</Text>
      <TextInput
        style={styles.input}
        placeholder="6-digit pincode"
        keyboardType="number-pad"
        maxLength={6}
        value={pincode}
        onChangeText={setPincode}
      />

      {/* Operating Hours */}
      <Text style={styles.sectionHeader}>Operating Hours</Text>

      <View style={styles.row}>
        <View style={styles.rowField}>
          <Text style={styles.label}>Opening Time</Text>
          <TextInput
            style={styles.input}
            placeholder="HH:MM"
            value={openingTime}
            onChangeText={setOpeningTime}
            keyboardType="numbers-and-punctuation"
          />
        </View>
        <View style={styles.rowField}>
          <Text style={styles.label}>Closing Time</Text>
          <TextInput
            style={styles.input}
            placeholder="HH:MM"
            value={closingTime}
            onChangeText={setClosingTime}
            keyboardType="numbers-and-punctuation"
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.submitButton, registerMutation.isPending && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={registerMutation.isPending}
      >
        {registerMutation.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Submit Registration</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  contentContainer: { padding: 24, paddingBottom: 48 },
  backArrow: { marginBottom: 20 },
  backArrowText: { color: '#2563EB', fontSize: 16, fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '700', color: '#111827', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#6B7280', marginBottom: 24 },
  sectionHeader: { fontSize: 15, fontWeight: '700', color: '#2563EB', marginTop: 20, marginBottom: 12 },
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
  textArea: { height: 80, paddingTop: 12, textAlignVertical: 'top' },
  categoryScroll: { marginBottom: 16 },
  categoryChip: {
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: '#F9FAFB',
  },
  categoryChipSelected: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  categoryChipText: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
  categoryChipTextSelected: { color: '#2563EB' },
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
  pendingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#fff',
  },
  pendingIcon: { fontSize: 64, marginBottom: 16 },
  pendingTitle: { fontSize: 24, fontWeight: '700', color: '#111827', marginBottom: 12 },
  pendingDesc: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  backButton: { backgroundColor: '#2563EB', borderRadius: 10, paddingHorizontal: 32, paddingVertical: 14 },
  backButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
