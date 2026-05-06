import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useStorePortalStore } from '@/store/store.store';

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
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Store Profile</Text>
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Store details</Text>

            <Text style={styles.label}>Store name *</Text>
            <TextInput
              style={[styles.input, errors.name && styles.inputError]}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Sharma General Store"
              placeholderTextColor="#9CA3AF"
            />
            {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}

            <Text style={[styles.label, { marginTop: 14 }]}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Tell customers about your store"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Address</Text>

            <Text style={styles.label}>Street</Text>
            <TextInput
              style={styles.input}
              value={street}
              onChangeText={setStreet}
              placeholder="House no., street, area"
              placeholderTextColor="#9CA3AF"
            />

            <Text style={[styles.label, { marginTop: 14 }]}>City</Text>
            <TextInput
              style={styles.input}
              value={city}
              onChangeText={setCity}
              placeholder="City"
              placeholderTextColor="#9CA3AF"
            />

            <Text style={[styles.label, { marginTop: 14 }]}>State</Text>
            <TextInput
              style={styles.input}
              value={stateName}
              onChangeText={setStateName}
              placeholder="State"
              placeholderTextColor="#9CA3AF"
            />

            <Text style={[styles.label, { marginTop: 14 }]}>Pincode</Text>
            <TextInput
              style={[styles.input, errors.pincode && styles.inputError]}
              value={pincode}
              onChangeText={setPincode}
              placeholder="6-digit pincode"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
              maxLength={6}
            />
            {errors.pincode && (
              <Text style={styles.errorText}>{errors.pincode}</Text>
            )}
          </View>

          <TouchableOpacity
            style={[
              styles.saveBtn,
              updateMutation.isPending && styles.saveBtnDisabled,
            ]}
            onPress={onSave}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save changes</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerBtn: { width: 40, alignItems: 'flex-start' },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#fff',
  },
  textArea: { height: 96, paddingTop: 10 },
  inputError: { borderColor: '#DC2626' },
  errorText: { color: '#DC2626', fontSize: 12, marginTop: 4 },
  saveBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
