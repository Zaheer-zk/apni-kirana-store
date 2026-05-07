import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { apiClient } from './api';

// Expo SDK 53 removed push notification support from Expo Go. Running in
// Expo Go is fine for the rest of the app, but any call into expo-notifications'
// push API throws. We detect the host app early so callers can short-circuit.
const IS_EXPO_GO = Constants.executionEnvironment === 'storeClient';

if (!IS_EXPO_GO) {
  // Configure how notifications appear when app is foregrounded.
  // Skipped in Expo Go because the underlying native module isn't loaded.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Requests permission and registers the FCM/Expo token with the backend.
 * Returns the token (or null if Expo Go / simulator / permission denied).
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (IS_EXPO_GO) {
    console.log(
      '[Notifications] Push disabled in Expo Go (SDK 53+). Build a dev client ' +
        'with `eas build --profile development` for real push testing.',
    );
    return null;
  }
  if (!Device.isDevice) {
    console.log('[Notifications] Skipping: must use physical device');
    return null;
  }
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.log('[Notifications] Permission denied');
    return null;
  }

  // Use Expo push token — Expo's relay forwards to FCM/APNs for free.
  // Requires an EAS projectId (free, run `npx eas init` once per app to bind one).
  // Without it we skip gracefully so the rest of the app still works.
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants.easConfig as { projectId?: string } | undefined)?.projectId;
  if (!projectId) {
    console.warn(
      '[Notifications] No EAS projectId — push disabled. Run `npx eas init` ' +
        'inside apps/customer to enable real pushes.',
    );
    return null;
  }
  let token: string;
  try {
    const tokenObj = await Notifications.getExpoPushTokenAsync({ projectId });
    token = tokenObj.data;
  } catch (err) {
    console.warn('[Notifications] Failed to fetch Expo push token:', err);
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#16A34A',
    });
  }

  try {
    await apiClient.put('/api/v1/notifications/fcm-token', { token });
    console.log('[Notifications] Token registered with backend');
  } catch (err) {
    console.warn('[Notifications] Failed to register token with backend:', err);
  }

  return token;
}

/**
 * Read the current device's Expo push token without re-prompting the user.
 * Returns null on simulator / no projectId / no permission.
 */
export async function getCurrentPushToken(): Promise<string | null> {
  if (IS_EXPO_GO || !Device.isDevice) return null;
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants.easConfig as { projectId?: string } | undefined)?.projectId;
  if (!projectId) return null;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch {
    return null;
  }
}

/**
 * Best-effort: tell the backend to remove this device's token. Called on
 * logout so the previous user's notifications stop arriving here.
 */
export async function unregisterPushNotifications(): Promise<void> {
  if (IS_EXPO_GO) return;
  const token = await getCurrentPushToken();
  try {
    await apiClient.delete('/api/v1/notifications/fcm-token', {
      params: token ? { token } : undefined,
    });
  } catch {
    // best-effort — never block logout
  }
}

/**
 * Hook up foreground / background tap response listeners.
 * Returns a cleanup function. No-op in Expo Go.
 */
export function attachNotificationListeners(opts: {
  onReceive?: (n: Notifications.Notification) => void;
  onTap?: (data: Record<string, unknown>) => void;
}): () => void {
  if (IS_EXPO_GO) return () => {};
  const recv = Notifications.addNotificationReceivedListener((n) => {
    opts.onReceive?.(n);
  });
  const resp = Notifications.addNotificationResponseReceivedListener((r) => {
    const data = r.notification.request.content.data ?? {};
    opts.onTap?.(data);
  });
  return () => {
    recv.remove();
    resp.remove();
  };
}
