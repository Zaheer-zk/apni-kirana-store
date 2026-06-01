import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

// Form for store owners to request a new catalog item. Mirrors store-web's
// /inventory/request-item — POSTs to /api/v1/catalog/requests, admin
// approves/rejects from the admin app.

const CATEGORIES = [
  { value: 'GROCERY', label: 'Grocery' },
  { value: 'MEDICINE', label: 'Medicine' },
  { value: 'HOUSEHOLD', label: 'Household' },
  { value: 'SNACKS', label: 'Snacks' },
  { value: 'BEVERAGES', label: 'Beverages' },
  { value: 'ELECTRONICS', label: 'Electronics' },
  { value: 'OTHER', label: 'Other' },
] as const;
type Category = (typeof CATEGORIES)[number]['value'];

export default function RequestItemScreen() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('GROCERY');
  const [defaultUnit, setDefaultUnit] = useState('pcs');
  const [priceHint, setPriceHint] = useState('');

  const submit = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (trimmed.length < 2) throw new Error('Item name is required');
      const payload: Record<string, unknown> = {
        name: trimmed,
        category,
        defaultUnit: defaultUnit.trim() || 'pcs',
      };
      if (description.trim()) payload.description = description.trim();
      if (priceHint.trim()) {
        const p = Number.parseFloat(priceHint);
        if (!Number.isFinite(p) || p <= 0) throw new Error('Price must be a positive number');
        payload.priceHint = p;
      }
      const res = await api.post('/api/v1/catalog/requests', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogRequestsMine'] });
      Alert.alert('Request submitted', 'Admin will review your request shortly.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    },
    onError: (err: Error) => Alert.alert('Could not submit', err.message),
  });

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <View style={styles.header}>
            <View style={styles.iconWrap}>
              <Ionicons name="list-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Request a new catalog item</Text>
              <Text style={styles.subtitle}>
                Tell admin what to add. Once approved, the item appears in your inventory
                automatically at the suggested price.
              </Text>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Item name *</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Aashirvaad Atta 5kg"
              style={styles.input}
              maxLength={120}
              autoCapitalize="words"
            />
            <Text style={styles.hint}>Brand + size keeps the catalog clean.</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Category *</Text>
            <View style={styles.chipWrap}>
              {CATEGORIES.map((c) => {
                const on = category === c.value;
                return (
                  <TouchableOpacity
                    key={c.value}
                    onPress={() => setCategory(c.value)}
                    style={[styles.chip, on ? styles.chipOn : styles.chipOff]}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, on ? styles.chipTextOn : null]}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Unit *</Text>
            <TextInput
              value={defaultUnit}
              onChangeText={setDefaultUnit}
              placeholder="kg, g, L, ml, pcs"
              style={styles.input}
              maxLength={40}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Description (optional)</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Variant, packaging, MRP, etc."
              style={[styles.input, styles.textarea]}
              maxLength={500}
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Your selling price (₹, optional)</Text>
            <TextInput
              value={priceHint}
              onChangeText={setPriceHint}
              placeholder="e.g. 240"
              style={styles.input}
              keyboardType="decimal-pad"
            />
            <Text style={styles.hint}>
              We&apos;ll pre-fill this on your inventory after approval.
            </Text>
          </View>
        </Card>

        <View style={styles.actions}>
          <Button
            variant="outline"
            title="Cancel"
            onPress={() => router.back()}
            disabled={submit.isPending}
            style={{ flex: 1 }}
          />
          <Button
            variant="primary"
            title="Send request"
            icon="send-outline"
            loading={submit.isPending}
            onPress={() => submit.mutate()}
            style={{ flex: 1 }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  header: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  subtitle: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 16,
  },
  field: { marginTop: spacing.lg, gap: spacing.xs },
  label: { fontSize: fontSize.xs, fontWeight: '700', color: colors.textPrimary },
  hint: { fontSize: fontSize.xs, color: colors.textMuted },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    backgroundColor: colors.white,
  },
  textarea: { minHeight: 88, textAlignVertical: 'top' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipOff: { backgroundColor: colors.white, borderColor: colors.border },
  chipText: { fontSize: fontSize.xs, fontWeight: '600', color: colors.textPrimary },
  chipTextOn: { color: colors.white },
  actions: { flexDirection: 'row', gap: spacing.md },
});
