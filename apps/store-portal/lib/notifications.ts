import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api } from '@/lib/api';

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

  // Use Expo push token — Expo's relay forwards to FCM/APNs for free, no
  // Firebase service account needed. Tokens look like `ExponentPushToken[xxx]`.
  const tokenObj = await Notifications.getExpoPushTokenAsync();
  const token = tokenObj.data;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('store-default', {
      name: 'store-default',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2563EB',
    });
  }

  try {
    await api.put('/api/v1/notifications/fcm-token', { token });
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
