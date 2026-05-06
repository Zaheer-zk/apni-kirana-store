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
import type { VehicleType } from '@aks/shared';

type VehicleOption = { label: string; value: VehicleType };

const VEHICLE_OPTIONS: VehicleOption[] = [
  { label: '🚲 Bike', value: 'BIKE' },
  { label: '🛵 Scooter', value: 'SCOOTER' },
  { label: '🚗 Car', value: 'CAR' },
];

interface RegisterPayload {
  vehicleType: VehicleType;
  vehicleNumber: string;
  licenseNumber: string;
}

interface RegisterResponse {
  message: string;
  driverId: string;
}

export default function DriverRegisterScreen() {
  const [vehicleType, setVehicleType] = useState<VehicleType>('BIKE');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const registerMutation = useMutation<RegisterResponse, Error, RegisterPayload>({
    mutationFn: (payload) =>
      api.post<RegisterResponse>('/api/v1/drivers/register', payload).then((r) => r.data),
    onSuccess: () => setSubmitted(true),
    onError: (err) => Alert.alert('Registration Failed', err.message || 'Please try again'),
  });

  const handleSubmit = () => {
    if (!vehicleNumber.trim()) {
      Alert.alert('Validation', 'Vehicle number is required');
      return;
    }
    if (!licenseNumber.trim()) {
      Alert.alert('Validation', 'License number is required');
      return;
    }
    registerMutation.mutate({
      vehicleType,
      vehicleNumber: vehicleNumber.trim().toUpperCase(),
      licenseNumber: licenseNumber.trim().toUpperCase(),
    });
  };

  if (submitted) {
    return (
      <View style={styles.pendingContainer}>
        <Text style={styles.pendingIcon}>⏳</Text>
        <Text style={styles.pendingTitle}>Application Submitted!</Text>
        <Text style={styles.pendingDesc}>
          Your driver application is under review. Our admin team will verify your documents and
          approve your account within 24–48 hours. You'll receive a notification once approved.
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

      <Text style={styles.title}>Become a Driver</Text>
      <Text style={styles.subtitle}>Fill in your vehicle details to get started</Text>

      <Text style={styles.sectionLabel}>Vehicle Type</Text>
      <View style={styles.vehiclePicker}>
        {VEHICLE_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[
              styles.vehicleOption,
              vehicleType === opt.value && styles.vehicleOptionSelected,
            ]}
            onPress={() => setVehicleType(opt.value)}
          >
            <Text
              style={[
                styles.vehicleOptionText,
                vehicleType === opt.value && styles.vehicleOptionTextSelected,
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Vehicle Number *</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. MH01AB1234"
        autoCapitalize="characters"
        value={vehicleNumber}
        onChangeText={setVehicleNumber}
      />

      <Text style={styles.label}>Driving License Number *</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. MH0120200012345"
        autoCapitalize="characters"
        value={licenseNumber}
        onChangeText={setLicenseNumber}
      />

      <TouchableOpacity
        style={[styles.submitButton, registerMutation.isPending && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={registerMutation.isPending}
      >
        {registerMutation.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Submit Application</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  contentContainer: { padding: 24, paddingBottom: 48 },
  backArrow: { marginBottom: 20 },
  backArrowText: { color: '#DC2626', fontSize: 16, fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '700', color: '#111827', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#6B7280', marginBottom: 28 },
  sectionLabel: { fontSize: 14, color: '#374151', fontWeight: '600', marginBottom: 10 },
  vehiclePicker: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  vehicleOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  vehicleOptionSelected: { borderColor: '#DC2626', backgroundColor: '#FEF2F2' },
  vehicleOptionText: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
  vehicleOptionTextSelected: { color: '#DC2626' },
  label: { fontSize: 14, color: '#374151', fontWeight: '500', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 52,
    fontSize: 15,
    color: '#111827',
    marginBottom: 20,
  },
  submitButton: {
    backgroundColor: '#DC2626',
    borderRadius: 10,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
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
  pendingDesc: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  backButton: {
    backgroundColor: '#DC2626',
    borderRadius: 10,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  backButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
