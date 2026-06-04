import React, { useEffect, useState } from 'react';
import { Redirect, Stack, router, usePathname } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { Ionicons } from '@expo/vector-icons';
import { useDriverStore } from '@/store/driver.store';
import { ErrorBoundary } from '@/components/ErrorBoundary';
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
      <Text style={styles.splashTitle}>Quick Easy Mart Driver</Text>
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
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const token = await SecureStore.getItemAsync(STORAGE_KEYS.accessToken);
        const userRaw = await SecureStore.getItemAsync(STORAGE_KEYS.user);
        const driverProfileRaw = await SecureStore.getItemAsync(
          STORAGE_KEYS.driverProfile,
        );

        if (cancelled) return;

        if (token && userRaw) {
          try {
            const user = JSON.parse(userRaw);
            const driverProfile = driverProfileRaw ? JSON.parse(driverProfileRaw) : null;
            setAuth(token, user, driverProfile);
          } catch {
            // corrupt session — fall through to login
          }
        }
      } catch {
        // SecureStore failed — fall through to login
      } finally {
        if (!cancelled) setIsReady(true);
      }
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [setAuth]);

  // Register for push notifications and attach tap listener once authenticated.
  useEffect(() => {
    if (!accessToken) return;
    registerForPushNotifications();
    const detach = attachNotificationListeners({
      onTap: (data) => {
        if (data?.event === 'CHAT_MESSAGE' && typeof data?.orderId === 'string') {
          router.push(`/chat/${data.orderId}`);
          return;
        }
        // Driver mobile has no /order/[id] route — the active order
        // surfaces on the dashboard tab via the Zustand-backed
        // `activeOrderId`. Pushing to a non-existent route used to
        // hand the driver a blank screen on every offer notification
        // tap (B-2 in the 2026-06-04 audit). Flip the active order
        // and bounce to the dashboard instead.
        if (typeof data?.orderId === 'string') {
          useDriverStore.getState().setActiveOrder(data.orderId);
          router.push('/(tabs)/dashboard');
        }
      },
    });
    return detach;
  }, [accessToken]);

  // expo-router strips route groups from the pathname, so (auth) screens show
  // up as plain "/login", "/register", etc.
  const path = pathname ?? '';
  // Screens an unauthenticated user is allowed to reach.
  const inAuthGroup = ['/login', '/register', '/forgot-password'].includes(path);
  // change-password and pending are in the (auth) group but are reached AFTER
  // login (forced password change / awaiting approval) — an authenticated user
  // must be allowed to stay on them rather than be bounced to the dashboard.
  const isPostLoginAuthScreen = path === '/change-password' || path === '/pending';

  // The Stack must stay mounted even during bootstrap — otherwise a <Redirect>
  // fires before any navigator exists ("route (auth) not handled"). So the
  // Stack + redirect/splash render as siblings, never one instead of the other.
  return (
    <>
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
      <Stack.Screen name="profile/zones" options={{ title: 'Serving Zones' }} />
      <Stack.Screen name="profile/help" options={{ title: 'Help & Support' }} />
      <Stack.Screen name="profile/support" options={{ title: 'Help & Support' }} />
      <Stack.Screen name="notifications/index" options={{ title: 'Notifications' }} />
      <Stack.Screen name="chat/[orderId]" options={{ title: 'Chat' }} />
      <Stack.Screen name="+not-found" options={{ title: 'Not found' }} />
    </Stack>
    {isReady && !accessToken && !inAuthGroup && !isPostLoginAuthScreen ? (
      <Redirect href="/(auth)/login" />
    ) : null}
    {isReady && accessToken && inAuthGroup ? (
      <Redirect href="/(tabs)/dashboard" />
    ) : null}
    {!isReady && <SplashScreen />}
    </>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="dark" backgroundColor={colors.background} />
        <ErrorBoundary>
          <RootLayoutNav />
        </ErrorBoundary>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xxl,
    zIndex: 10,
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
