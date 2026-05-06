import React, { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { useStorePortalStore } from '@/store/store.store';

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
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="order/[id]" options={{ headerShown: true, title: 'Order Detail', headerBackTitle: 'Back' }} />
      <Stack.Screen name="inventory/add" options={{ headerShown: false }} />
      <Stack.Screen
        name="inventory/browse-catalog"
        options={{ headerShown: true, title: 'Add from Catalog', headerBackTitle: 'Back' }}
      />
      <Stack.Screen name="inventory/[id]" options={{ headerShown: true, title: 'Edit Item', headerBackTitle: 'Back' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <RootLayoutNav />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
