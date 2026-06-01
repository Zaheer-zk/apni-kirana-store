import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { AuthScaffold, authStyles } from '@/components/AuthScaffold';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { OtpInput } from '@/components/OtpInput';
import { api } from '@/lib/api';
import { persistSession } from '@/lib/session';
import { colors, fontSize, radius, spacing } from '@/constants/theme';
import { VehicleType } from '@aks/shared';
import type { UserProfile } from '@aks/shared';

interface AuthResponse {
  user: UserProfile;
  accessToken: string;
  refreshToken: string;
  hasAddress: boolean;
}

interface VehicleOption {
  label: string;
  value: VehicleType;
  icon: keyof typeof Ionicons.glyphMap;
}

const VEHICLE_OPTIONS: VehicleOption[] = [
  { label: 'Bike', value: VehicleType.BIKE, icon: 'bicycle' },
  { label: 'Scooter', value: VehicleType.SCOOTER, icon: 'bicycle-outline' },
  { label: 'Car', value: VehicleType.CAR, icon: 'car' },
];

type Step = 'form' | 'otp' | 'vehicle' | 'submitted';

export default function RegisterScreen() {
  const [step, setStep] = useState<Step>('form');

  // Account details
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');

  // Driver / vehicle details
  const [vehicleType, setVehicleType] = useState<VehicleType>(VehicleType.BIKE);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [vehicleErrors, setVehicleErrors] = useState<{ vehicle?: string; license?: string }>({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function showError(message: string) {
    setError(message);
    setTimeout(() => setError(null), 5000);
  }

  function errMessage(err: unknown, fallback: string) {
    if (typeof err === 'object' && err && 'response' in err) {
      const e = err as { response?: { data?: { error?: string } } };
      if (e.response?.data?.error) return e.response.data.error;
    }
    return err instanceof Error ? err.message : fallback;
  }

  async function handleRegister() {
    if (name.trim().length < 2) return showError('Enter your full name');
    if (phone.length !== 10) return showError('Enter a valid 10-digit mobile number');
    if (!/^\S+@\S+\.\S+$/.test(email)) return showError('Enter a valid email address');
    if (username.trim().length < 3) return showError('Username must be at least 3 characters');
    if (password.length < 8) return showError('Password must be at least 8 characters');

    setLoading(true);
    setError(null);
    try {
      await api.post('/api/v1/auth/register', {
        name: name.trim(),
        phone,
        email: email.trim(),
        username: username.trim(),
        password,
        role: 'DRIVER',
      });
      setStep('otp');
    } catch (err: unknown) {
      showError(errMessage(err, 'Registration failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    if (otp.length !== 6) return showError('Enter the complete 6-digit OTP');
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ success: boolean; data: AuthResponse; error?: string }>(
        '/api/v1/auth/verify-otp',
        { phone, otp, role: 'DRIVER' },
      );
      const payload = res.data?.data;
      if (!payload?.accessToken) throw new Error(res.data?.error ?? 'Verification failed');
      // Account is verified and we're now logged in. Next: collect the
      // vehicle/licence details that create the driver entity.
      await persistSession(payload.user, payload.accessToken, payload.refreshToken);
      setStep('vehicle');
    } catch (err: unknown) {
      showError(errMessage(err, 'Invalid OTP. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    setError(null);
    try {
      await api.post('/api/v1/auth/send-otp', { phone });
      showError('A new OTP has been sent to your number');
    } catch {
      showError('Could not resend the OTP');
    }
  }

  async function handleSubmitVehicle() {
    const nextErrors: { vehicle?: string; license?: string } = {};
    if (!vehicleNumber.trim()) nextErrors.vehicle = 'Vehicle number is required';
    if (!licenseNumber.trim()) nextErrors.license = 'License number is required';
    setVehicleErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    setError(null);
    try {
      // Authenticated — this also grants the DRIVER role on the backend.
      await api.post('/api/v1/drivers/register', {
        vehicleType,
        vehicleNumber: vehicleNumber.trim().toUpperCase(),
        licenseNumber: licenseNumber.trim().toUpperCase(),
      });
      setStep('submitted');
    } catch (err: unknown) {
      showError(errMessage(err, 'Could not submit your application. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScaffold>
      {step === 'form' ? (
        <>
          <Text style={authStyles.title}>Apply to drive</Text>
          <Text style={authStyles.subtitle}>
            We&apos;ll send a one-time code to verify your mobile number.
          </Text>

          <Input
            label="Full name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Chotu Singh"
            autoCapitalize="words"
            leftIcon="person-outline"
            containerStyle={styles.field}
          />
          <Input
            label="Mobile number"
            value={phone}
            onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, 10))}
            placeholder="10-digit number"
            keyboardType="number-pad"
            leftIcon="call-outline"
            containerStyle={styles.field}
          />
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            leftIcon="mail-outline"
            containerStyle={styles.field}
          />
          <Input
            label="Username"
            value={username}
            onChangeText={(t) => setUsername(t.replace(/\s/g, ''))}
            placeholder="Used to log in"
            autoCapitalize="none"
            leftIcon="at-outline"
            containerStyle={styles.field}
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            secureTextEntry
            leftIcon="lock-closed-outline"
            containerStyle={styles.field}
          />

          <Button
            title="Continue"
            onPress={handleRegister}
            loading={loading}
            fullWidth
            size="lg"
            style={{ marginTop: spacing.lg }}
          />

          <View style={authStyles.footerRow}>
            <Text style={authStyles.footerMuted}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
              <Text style={authStyles.linkText}>Log in</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}

      {step === 'otp' ? (
        <>
          <Text style={authStyles.title}>Verify your number</Text>
          <Text style={authStyles.subtitle}>Enter the 6-digit OTP sent to +91 {phone}</Text>

          <OtpInput value={otp} onChange={setOtp} />

          <Button
            title="Verify & continue"
            onPress={handleVerify}
            loading={loading}
            disabled={otp.length !== 6}
            fullWidth
            size="lg"
            style={{ marginTop: spacing.lg }}
          />

          <TouchableOpacity style={authStyles.link} onPress={handleResendOtp}>
            <Ionicons name="refresh" size={16} color={colors.primary} />
            <Text style={authStyles.linkText}>Resend OTP</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={authStyles.link}
            onPress={() => {
              setStep('form');
              setOtp('');
            }}
          >
            <Ionicons name="arrow-back" size={16} color={colors.primary} />
            <Text style={authStyles.linkText}>Edit details</Text>
          </TouchableOpacity>
        </>
      ) : null}

      {step === 'vehicle' ? (
        <>
          <Text style={authStyles.title}>Tell us about your vehicle</Text>
          <Text style={authStyles.subtitle}>
            We need these details to review your driver application.
          </Text>

          <Text style={styles.sectionLabel}>Vehicle type</Text>
          <View style={styles.vehiclePicker}>
            {VEHICLE_OPTIONS.map((opt) => {
              const selected = vehicleType === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  activeOpacity={0.7}
                  style={[styles.vehicleOption, selected && styles.vehicleOptionSelected]}
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
                      <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.formGap} />
          <Input
            label="Vehicle number"
            placeholder="e.g. MH01AB1234"
            autoCapitalize="characters"
            value={vehicleNumber}
            onChangeText={(t) => {
              setVehicleNumber(t);
              if (vehicleErrors.vehicle) {
                setVehicleErrors((e) => ({ ...e, vehicle: undefined }));
              }
            }}
            leftIcon="card-outline"
            error={vehicleErrors.vehicle}
            containerStyle={styles.field}
          />
          <Input
            label="Driving license number"
            placeholder="e.g. MH0120200012345"
            autoCapitalize="characters"
            value={licenseNumber}
            onChangeText={(t) => {
              setLicenseNumber(t);
              if (vehicleErrors.license) {
                setVehicleErrors((e) => ({ ...e, license: undefined }));
              }
            }}
            leftIcon="document-text-outline"
            error={vehicleErrors.license}
          />

          <Button
            title="Submit application"
            icon="paper-plane"
            iconPosition="right"
            onPress={handleSubmitVehicle}
            loading={loading}
            fullWidth
            size="lg"
            style={{ marginTop: spacing.xl }}
          />

          <View style={authStyles.noticeBox}>
            <Ionicons name="information-circle" size={18} color={colors.info} />
            <Text style={authStyles.noticeText}>
              Your details will be reviewed by our team. We approve most drivers within
              24-48 hours.
            </Text>
          </View>
        </>
      ) : null}

      {step === 'submitted' ? (
        <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
          <Ionicons name="checkmark-circle-outline" size={56} color={colors.primary} />
          <Text style={[authStyles.title, { marginTop: spacing.lg, textAlign: 'center' }]}>
            Application submitted!
          </Text>
          <Text style={[authStyles.subtitle, { textAlign: 'center' }]}>
            Your driver application is under review. Our team will verify your documents and
            approve your account within 24-48 hours.
          </Text>
          <Button
            title="Check application status"
            onPress={() => router.replace('/(auth)/pending')}
            fullWidth
            size="lg"
          />
        </View>
      ) : null}

      {error ? (
        <View style={authStyles.errorBox}>
          <Ionicons name="alert-circle" size={18} color={colors.error} />
          <Text style={authStyles.errorText}>{error}</Text>
        </View>
      ) : null}
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: spacing.lg },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  vehiclePicker: { flexDirection: 'row', gap: spacing.sm },
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
  vehicleCheck: { position: 'absolute', top: 6, right: 6 },
  formGap: { height: spacing.lg },
});
