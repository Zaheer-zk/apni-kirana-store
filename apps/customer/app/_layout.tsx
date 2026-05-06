import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, Stack, usePathname } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/auth.store';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 1000 * 60 * 5 },
  },
});

function SplashScreen() {
  return (
    <View style={styles.splash}>
      <View style={styles.splashIcon}>
        <Ionicons name="basket" size={48} color={colors.white} />
      </View>
      <Text style={styles.splashTitle}>Apni Kirana Store</Text>
      <Text style={styles.splashSubtitle}>Daily essentials, delivered fast</Text>
      <ActivityIndicator
        color={colors.primary}
        size="small"
        style={{ marginTop: spacing.xxl }}
      />
    </View>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setAuth = useAuthStore((s) => s.setAuth);
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await SecureStore.getItemAsync('accessToken');
        const userRaw = await SecureStore.getItemAsync('user');
        if (cancelled) return;
        if (token && userRaw) {
          try {
            const user = JSON.parse(userRaw);
            setAuth(user, token);
          } catch {
            // corrupt user — fall through to login
          }
        }
      } catch {
        // SecureStore failed — fall through to login
      } finally {
        if (!cancelled) setIsReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [setAuth]);

  if (!isReady) return <SplashScreen />;

  // Redirect based on auth status. The Stack still mounts so routing works.
  const inAuthGroup = pathname?.startsWith('/(auth)') || pathname === '/login';
  if (!accessToken && !inAuthGroup) {
    return <Redirect href="/(auth)/login" />;
  }
  if (accessToken && inAuthGroup) {
    return <Redirect href="/(tabs)/home" />;
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="dark" backgroundColor={colors.background} />
        <AuthGate>
          <Stack
            screenOptions={{
              // Default: native iOS UIKit-style headers (back button, title) on every screen.
              // Tabs/auth/onboarding screens override with headerShown: false in their own layouts.
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
            <Stack.Screen name="onboarding" options={{ headerShown: false }} />
            {/* Detail / modal style routes use the native header */}
            <Stack.Screen name="item/[id]" options={{ title: 'Item details' }} />
            <Stack.Screen name="cart" options={{ title: 'Cart', presentation: 'modal' }} />
            <Stack.Screen name="order/[id]" options={{ title: 'Order tracking' }} />
            <Stack.Screen name="account/profile" options={{ headerShown: false }} />
            <Stack.Screen name="account/addresses" options={{ headerShown: false }} />
            <Stack.Screen name="account/edit-address" options={{ headerShown: false }} />
            <Stack.Screen name="account/notifications" options={{ headerShown: false }} />
            <Stack.Screen name="account/help" options={{ headerShown: false }} />
            <Stack.Screen name="account/about" options={{ headerShown: false }} />
            <Stack.Screen name="+not-found" options={{ title: 'Not found' }} />
          </Stack>
        </AuthGate>
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
