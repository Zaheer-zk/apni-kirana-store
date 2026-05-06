import React, { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { useDriverStore } from '@/store/driver.store';
import { LOCATION_TASK_NAME } from '@/lib/location';
import * as TaskManager from 'expo-task-manager';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5,
    },
  },
});

function RootLayoutNav() {
  const { accessToken, setAuth, activeOrderId } = useDriverStore();

  useEffect(() => {
    async function bootstrap() {
      try {
        const token = await SecureStore.getItemAsync('accessToken');
        const userRaw = await SecureStore.getItemAsync('user');
        const driverProfileRaw = await SecureStore.getItemAsync('driverProfile');

        if (token && userRaw) {
          const user = JSON.parse(userRaw);
          const driverProfile = driverProfileRaw ? JSON.parse(driverProfileRaw) : null;
          setAuth(token, user, driverProfile);
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
    // Background location task registration is handled in lib/location.ts
    // We only need to register the task definition here via TaskManager
    return () => {
      TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME).then((registered) => {
        if (registered) {
          // Task cleanup handled by stopLocationTracking
        }
      });
    };
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
