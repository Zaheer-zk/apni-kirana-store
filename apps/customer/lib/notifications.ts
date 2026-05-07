import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { apiClient } from './api';

// Configure how notifications appear when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Requests permission and registers the FCM/Expo token with the backend.
 * Returns the token (or null if permission denied or running on simulator).
 */
export async function registerForPushNotifications(): Promise<string | null> {
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
 * Hook up foreground / background tap response listeners.
 * Returns a cleanup function.
 */
export function attachNotificationListeners(opts: {
  onReceive?: (n: Notifications.Notification) => void;
  onTap?: (data: Record<string, unknown>) => void;
}): () => void {
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
