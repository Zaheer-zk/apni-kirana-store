import React, { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { useStorePortalStore } from '@/store/store.store';
import { colors } from '@/constants/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5,
    },
  },
});

function RootLayoutNav() {
  const { accessToken, setAuth } = useStorePortalStore();

  useEffect(() => {
    async function bootstrap() {
      try {
        const token = await SecureStore.getItemAsync('accessToken');
        const userRaw = await SecureStore.getItemAsync('user');
        const storeProfileRaw = await SecureStore.getItemAsync('storeProfile');

        if (token && userRaw) {
          const user = JSON.parse(userRaw);
          const storeProfile = storeProfileRaw ? JSON.parse(storeProfileRaw) : null;
          setAuth(token, user, storeProfile);
        } else {
          router.replace('/(auth)/login');
        }
      } catch {
        router.replace('/(auth)/login');
      }
    }
    bootstrap();
  }, []);

  useEffect(() => {
    if (accessToken === null) return;
    if (accessToken) {
      router.replace('/(tabs)/dashboard');
    } else {
      router.replace('/(auth)/login');
    }
  }, [accessToken]);

  return (
    <Stack
      screenOptions={{
        // Default: native iOS UIKit-style headers (back button, title) on every screen.
        // Tab/auth groups override with headerShown: false in their own layouts.
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
      <Stack.Screen name="order/[id]" options={{ title: 'Order details' }} />
      <Stack.Screen name="inventory/add" options={{ headerShown: false }} />
      <Stack.Screen name="inventory/browse-catalog" options={{ title: 'Add from catalog' }} />
      <Stack.Screen name="inventory/[id]" options={{ title: 'Edit item' }} />
      <Stack.Screen name="profile/operating-hours" options={{ title: 'Operating hours' }} />
      <Stack.Screen name="profile/edit" options={{ title: 'Edit store profile' }} />
      <Stack.Screen name="profile/notifications" options={{ title: 'Notifications' }} />
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
