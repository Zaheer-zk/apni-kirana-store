import React, { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as TaskManager from 'expo-task-manager';
import { useDriverStore } from '@/store/driver.store';
import { LOCATION_TASK_NAME } from '@/lib/location';
import {
  attachNotificationListeners,
  registerForPushNotifications,
} from '@/lib/notifications';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5,
    },
  },
});

function SplashScreen() {
  return (
    <View style={styles.splash}>
      <View style={styles.splashIcon}>
        <Ionicons name="bicycle" size={48} color={colors.white} />
      </View>
      <Text style={styles.splashTitle}>AKS Driver</Text>
      <Text style={styles.splashSubtitle}>Deliver smart, earn more</Text>
      <ActivityIndicator
        color={colors.primary}
        size="small"
        style={{ marginTop: spacing.xxl }}
      />
    </View>
  );
}

function RootLayoutNav() {
  const { accessToken, setAuth } = useDriverStore();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const token = await SecureStore.getItemAsync('accessToken');
        const userRaw = await SecureStore.getItemAsync('user');
        const driverProfileRaw = await SecureStore.getItemAsync('driverProfile');

        if (cancelled) return;

        if (token && userRaw) {
          const user = JSON.parse(userRaw);
          const driverProfile = driverProfileRaw ? JSON.parse(driverProfileRaw) : null;
          setAuth(token, user, driverProfile);
        } else {
          router.replace('/(auth)/login');
        }
      } catch {
        router.replace('/(auth)/login');
      } finally {
        if (!cancelled) setIsReady(true);
      }
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [setAuth]);

  useEffect(() => {
    // Background location task registration is handled in lib/location.ts
    return () => {
      TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME).then(() => {
        // Cleanup handled by stopLocationTracking
      });
    };
  }, []);

  useEffect(() => {
    if (!isReady) return;
    if (accessToken === null) return;
    if (accessToken) {
      router.replace('/(tabs)/dashboard');
    } else {
      router.replace('/(auth)/login');
    }
  }, [accessToken, isReady]);

  // Register for push notifications and attach tap listener once authenticated.
  useEffect(() => {
    if (!accessToken) return;
    registerForPushNotifications();
    const detach = attachNotificationListeners({
      onTap: (data) => {
        if (typeof data?.orderId === 'string') {
          router.push(`/order/${data.orderId}`);
        }
      },
    });
    return detach;
  }, [accessToken]);

  if (!isReady) return <SplashScreen />;

  return (
    <Stack
      screenOptions={{
        // Default: native iOS UIKit-style headers (back button, title) on every screen.
        // Tabs / auth screens override with headerShown: false in their own layouts.
        headerShown: true,
        headerLargeTitle: false,
        headerTransparent: true,
        headerBlurEffect: 'systemChromeMaterial',
        headerStyle: { backgroundColor: 'transparent' },
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.textPrimary },
        headerBackTitle: 'Back',
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
        animation: 'default',
      }}
    >
      {/* Top-level groups own their own headers/tabs */}
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {/* Detail / modal style routes use the native header */}
      <Stack.Screen name="profile/ratings" options={{ title: 'My Ratings' }} />
      <Stack.Screen name="profile/help" options={{ title: 'Help & Support' }} />
      <Stack.Screen name="notifications/index" options={{ title: 'Notifications' }} />
      <Stack.Screen name="+not-found" options={{ title: 'Not found' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="dark" backgroundColor={colors.background} />
        <RootLayoutNav />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xxl,
  },
  splashIcon: {
    width: 96,
    height: 96,
    borderRadius: radius.xl,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  splashTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  splashSubtitle: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
});
