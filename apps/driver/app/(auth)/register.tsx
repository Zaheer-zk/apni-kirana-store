import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { EmptyState } from '@/components/EmptyState';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';
import type { VehicleType } from '@aks/shared';

interface VehicleOption {
  label: string;
  value: VehicleType;
  icon: keyof typeof Ionicons.glyphMap;
}

const VEHICLE_OPTIONS: VehicleOption[] = [
  { label: 'Bike', value: 'BIKE', icon: 'bicycle' },
  { label: 'Scooter', value: 'SCOOTER', icon: 'bicycle-outline' },
  { label: 'Car', value: 'CAR', icon: 'car' },
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
  const [errors, setErrors] = useState<{ vehicle?: string; license?: string }>({});

  const registerMutation = useMutation<RegisterResponse, Error, RegisterPayload>({
    mutationFn: (payload) =>
      api
        .post<RegisterResponse>('/api/v1/drivers/register', payload)
        .then((r) => r.data),
    onSuccess: () => setSubmitted(true),
    onError: (err) =>
      Alert.alert('Registration failed', err.message || 'Please try again'),
  });

  const handleSubmit = () => {
    const nextErrors: { vehicle?: string; license?: string } = {};
    if (!vehicleNumber.trim()) nextErrors.vehicle = 'Vehicle number is required';
    if (!licenseNumber.trim()) nextErrors.license = 'License number is required';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    registerMutation.mutate({
      vehicleType,
      vehicleNumber: vehicleNumber.trim().toUpperCase(),
      licenseNumber: licenseNumber.trim().toUpperCase(),
    });
  };

  if (submitted) {
    return (
      // Android: full edges so success state isn't clipped by system bars
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.pendingContainer}>
          <EmptyState
            icon="time-outline"
            title="Application submitted!"
            subtitle={
              "Your driver application is under review. Our admin team will verify your documents and approve your account within 24-48 hours. You'll get a notification once approved."
            }
            actionLabel="Back to Login"
            onAction={() => router.replace('/(auth)/login')}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    // Android: include left/right edges so content respects horizontal insets
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.back()}
            style={styles.backBtn}
            hitSlop={10}
          >
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.backBtn} />
        </View>

        <View style={styles.headerHero}>
          <View style={styles.heroIconWrap}>
            <Ionicons name="bicycle" size={32} color={colors.primary} />
          </View>
          <Text style={styles.title}>Become a driver</Text>
          <Text style={styles.subtitle}>
            Tell us about your vehicle to get started
          </Text>
        </View>

        {/* Vehicle Type Picker */}
        <Text style={styles.sectionLabel}>Vehicle Type</Text>
        <View style={styles.vehiclePicker}>
          {VEHICLE_OPTIONS.map((opt) => {
            const selected = vehicleType === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                activeOpacity={0.7}
                style={[
                  styles.vehicleOption,
                  selected && styles.vehicleOptionSelected,
                ]}
                onPress={() => setVehicleType(opt.value)}
              >
                <Ionicons
                  name={opt.icon}
                  size={28}
                  color={selected ? colors.primary : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.vehicleOptionText,
                    selected && styles.vehicleOptionTextSelected,
                  ]}
                >
                  {opt.label}
                </Text>
                {selected ? (
                  <View style={styles.vehicleCheck}>
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={colors.primary}
                    />
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Form fields */}
        <View style={styles.formGap} />
        <Input
          label="Vehicle number"
          placeholder="e.g. MH01AB1234"
          autoCapitalize="characters"
          value={vehicleNumber}
          onChangeText={(t) => {
            setVehicleNumber(t);
            if (errors.vehicle) setErrors((e) => ({ ...e, vehicle: undefined }));
          }}
          leftIcon="card-outline"
          error={errors.vehicle}
          containerStyle={{ marginBottom: spacing.lg }}
        />

        <Input
          label="Driving license number"
          placeholder="e.g. MH0120200012345"
          autoCapitalize="characters"
          value={licenseNumber}
          onChangeText={(t) => {
            setLicenseNumber(t);
            if (errors.license) setErrors((e) => ({ ...e, license: undefined }));
          }}
          leftIcon="document-text-outline"
          error={errors.license}
        />

        <Button
          title="Submit Application"
          icon="paper-plane"
          iconPosition="right"
          onPress={handleSubmit}
          loading={registerMutation.isPending}
          fullWidth
          size="lg"
          style={{ marginTop: spacing.xxl }}
        />

        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={18} color={colors.info} />
          <Text style={styles.infoText}>
            Your details will be reviewed by our team. We approve most drivers
            within 24-48 hours.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  contentContainer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl + spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  headerHero: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  heroIconWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadow.small,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  vehiclePicker: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  vehicleOption: {
    flex: 1,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    gap: spacing.sm,
    position: 'relative',
  },
  vehicleOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
  },
  vehicleOptionText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  vehicleOptionTextSelected: { color: colors.primary, fontWeight: '700' },
  vehicleCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  formGap: { height: spacing.xl },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.infoLight,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.xl,
  },
  infoText: {
    flex: 1,
    color: colors.infoDark,
    fontSize: fontSize.xs,
    fontWeight: '500',
    lineHeight: 18,
  },
  pendingContainer: {
    flex: 1,
    justifyContent: 'center',
  },
});
