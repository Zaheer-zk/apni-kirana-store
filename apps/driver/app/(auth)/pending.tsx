import React from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { useDriverStore } from '@/store/driver.store';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';

export default function PendingApprovalScreen() {
  const { driverProfile, clearAuth } = useDriverStore();

  const handleLogout = () => {
    Alert.alert('Sign out', 'Sign out and return to login?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await SecureStore.deleteItemAsync('accessToken');
          await SecureStore.deleteItemAsync('user');
          await SecureStore.deleteItemAsync('driverProfile');
          clearAuth();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroIconWrap}>
          <Ionicons name="time-outline" size={48} color={colors.warning} />
        </View>

        <Text style={styles.title}>Application under review</Text>
        <Text style={styles.subtitle}>
          Thanks for signing up! Our team is verifying your details. You'll be
          notified the moment your account is approved.
        </Text>

        <Card style={styles.timelineCard}>
          <Text style={styles.timelineTitle}>What happens next?</Text>

          <View style={styles.timelineRow}>
            <View style={[styles.timelineDot, styles.timelineDotDone]}>
              <Ionicons name="checkmark" size={14} color={colors.white} />
            </View>
            <View style={styles.timelineCol}>
              <Text style={styles.timelineLabel}>Application received</Text>
              <Text style={styles.timelineText}>
                We have your vehicle and license details
              </Text>
            </View>
          </View>

          <View style={styles.timelineRow}>
            <View style={[styles.timelineDot, styles.timelineDotActive]}>
              <View style={styles.timelineDotInner} />
            </View>
            <View style={styles.timelineCol}>
              <Text style={[styles.timelineLabel, { color: colors.warning }]}>
                Verification in progress
              </Text>
              <Text style={styles.timelineText}>
                Most drivers are approved within 24-48 hours
              </Text>
            </View>
          </View>

          <View style={styles.timelineRow}>
            <View style={[styles.timelineDot, styles.timelineDotPending]}>
              <Ionicons name="bicycle" size={12} color={colors.textMuted} />
            </View>
            <View style={styles.timelineCol}>
              <Text style={[styles.timelineLabel, { color: colors.textMuted }]}>
                Start delivering
              </Text>
              <Text style={styles.timelineText}>
                Go online from the dashboard once approved
              </Text>
            </View>
          </View>
        </Card>

        {driverProfile?.vehicleNumber ? (
          <Card style={styles.detailsCard}>
            <Text style={styles.detailsTitle}>Submitted details</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Vehicle</Text>
              <Text style={styles.detailValue}>
                {driverProfile.vehicleType} · {driverProfile.vehicleNumber}
              </Text>
            </View>
            {driverProfile.licenseNumber ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>License</Text>
                <Text style={styles.detailValue}>{driverProfile.licenseNumber}</Text>
              </View>
            ) : null}
          </Card>
        ) : null}

        <Button
          variant="outline"
          size="lg"
          icon="log-out-outline"
          title="Sign out"
          fullWidth
          onPress={handleLogout}
          style={{ marginTop: spacing.xl }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    alignItems: 'center',
  },
  heroIconWrap: {
    width: 96,
    height: 96,
    borderRadius: radius.full,
    backgroundColor: colors.warningLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xxxl,
    marginBottom: spacing.xl,
    ...shadow.small,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 21,
    paddingHorizontal: spacing.md,
  },

  timelineCard: {
    alignSelf: 'stretch',
    marginTop: spacing.xxl,
    gap: spacing.md,
  },
  timelineTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  timelineDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  timelineDotDone: { backgroundColor: colors.accent },
  timelineDotActive: {
    backgroundColor: colors.warningLight,
    borderWidth: 2,
    borderColor: colors.warning,
  },
  timelineDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.warning,
  },
  timelineDotPending: { backgroundColor: colors.gray100 },
  timelineCol: { flex: 1 },
  timelineLabel: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  timelineText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 17,
  },

  detailsCard: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
  },
  detailsTitle: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  detailLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  detailValue: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
});
