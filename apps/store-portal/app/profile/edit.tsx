import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useStorePortalStore } from '@/store/store.store';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { colors, fontSize, spacing } from '@/constants/theme';

export default function EditStoreProfileScreen() {
  const { storeProfile, setStoreProfile } = useStorePortalStore();

  const addr = (storeProfile as any)?.address;
  const initialAddress =
    typeof addr === 'object' && addr !== null
      ? addr
      : { street: '', city: '', state: '', pincode: '' };

  const [name, setName] = useState<string>(storeProfile?.name ?? '');
  const [description, setDescription] = useState<string>(
    (storeProfile as any)?.description ?? ''
  );
  const [street, setStreet] = useState<string>(initialAddress.street ?? '');
  const [city, setCity] = useState<string>(initialAddress.city ?? '');
  const [stateName, setStateName] = useState<string>(initialAddress.state ?? '');
  const [pincode, setPincode] = useState<string>(initialAddress.pincode ?? '');

  const [errors, setErrors] = useState<{
    name?: string;
    pincode?: string;
  }>({});

  const validate = (): boolean => {
    const next: { name?: string; pincode?: string } = {};
    if (!name.trim()) next.name = 'Store name is required';
    if (pincode && !/^\d{6}$/.test(pincode))
      next.pincode = 'Pincode must be 6 digits';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      const id = storeProfile?.id;
      if (!id) throw new Error('Store id missing');
      const body: Record<string, any> = {
        name: name.trim(),
        description: description.trim(),
        street: street.trim(),
        city: city.trim(),
        state: stateName.trim(),
        pincode: pincode.trim(),
      };
      const res = await api.put(`/api/v1/stores/${id}`, body);
      return res.data;
    },
    onSuccess: (data) => {
      const next = {
        ...(storeProfile as any),
        ...(data ?? {}),
        name: name.trim(),
        description: description.trim(),
        address: {
          ...(typeof (storeProfile as any)?.address === 'object'
            ? (storeProfile as any).address
            : {}),
          street: street.trim(),
          city: city.trim(),
          state: stateName.trim(),
          pincode: pincode.trim(),
        },
      };
      setStoreProfile(next);
      Alert.alert('Saved', 'Store profile updated');
      router.back();
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const onSave = () => {
    if (!validate()) return;
    updateMutation.mutate();
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Store details</Text>
        <View style={styles.formGroup}>
          <Input
            label="Store name *"
            value={name}
            onChangeText={(v) => {
              setName(v);
              if (errors.name) setErrors({ ...errors, name: undefined });
            }}
            placeholder="e.g. Sharma General Store"
            error={errors.name}
            leftIcon="storefront-outline"
          />
          <Input
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Tell customers about your store"
            multiline
            numberOfLines={4}
          />
        </View>

        <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Address</Text>
        <View style={styles.formGroup}>
          <Input
            label="Street"
            value={street}
            onChangeText={setStreet}
            placeholder="House no., street, area"
            leftIcon="home-outline"
          />
          <Input
            label="City"
            value={city}
            onChangeText={setCity}
            placeholder="City"
          />
          <Input
            label="State"
            value={stateName}
            onChangeText={setStateName}
            placeholder="State"
          />
          <Input
            label="Pincode"
            value={pincode}
            onChangeText={(v) => {
              setPincode(v);
              if (errors.pincode) setErrors({ ...errors, pincode: undefined });
            }}
            placeholder="6-digit pincode"
            keyboardType="number-pad"
            maxLength={6}
            error={errors.pincode}
            leftIcon="map-outline"
          />
        </View>

        <Button
          title="Save changes"
          icon="save-outline"
          onPress={onSave}
          loading={updateMutation.isPending}
          disabled={updateMutation.isPending}
          fullWidth
          size="lg"
          style={{ marginTop: spacing.lg }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 100, paddingBottom: spacing.xxxl },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.md,
  },
  formGroup: {
    gap: spacing.lg,
  },
});
