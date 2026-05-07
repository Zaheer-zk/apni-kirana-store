import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { apiClient } from './api';

// Expo SDK 53+ removed Android push notification support from Expo Go.
// `import 'expo-notifications'` THROWS at module evaluation time under
// Expo Go, so we never import it statically. We require() it lazily —
// inside each function — only after we've confirmed we're not in Expo Go.
//
// Detection: try every signal Expo has shipped over the years.
//   - executionEnvironment === 'storeClient'  (SDK 50+)
//   - appOwnership === 'expo'                 (SDK 49 and earlier, kept for safety)
const IS_EXPO_GO =
  Constants.executionEnvironment === 'storeClient' ||
  // appOwnership has been deprecated but is still set by Expo Go in some SDKs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Constants as any).appOwnership === 'expo';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadNotifications(): any | null {
  if (IS_EXPO_GO) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications');
  } catch {
    return null;
  }
}

// Configure foreground delivery once at module load — but only if we're
// outside Expo Go and the module loaded cleanly.
const _modAtLoad = loadNotifications();
if (_modAtLoad) {
  _modAtLoad.setNotificationHandler({
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
  const Notifications = loadNotifications();
  if (!Notifications) {
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

export async function getCurrentPushToken(): Promise<string | null> {
  const Notifications = loadNotifications();
  if (!Notifications || !Device.isDevice) return null;
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

export async function unregisterPushNotifications(): Promise<void> {
  const Notifications = loadNotifications();
  if (!Notifications) return;
  const token = await getCurrentPushToken();
  try {
    await apiClient.delete('/api/v1/notifications/fcm-token', {
      params: token ? { token } : undefined,
    });
  } catch {
    // best-effort
  }
}

/**
 * Hook up foreground / background tap response listeners.
 * Returns a cleanup function. No-op in Expo Go.
 */
export function attachNotificationListeners(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onReceive?: (n: any) => void;
  onTap?: (data: Record<string, unknown>) => void;
}): () => void {
  const Notifications = loadNotifications();
  if (!Notifications) return () => {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recv = Notifications.addNotificationReceivedListener((n: any) => {
    opts.onReceive?.(n);
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resp = Notifications.addNotificationResponseReceivedListener((r: any) => {
    const data = r.notification.request.content.data ?? {};
    opts.onTap?.(data);
  });
  return () => {
    recv.remove();
    resp.remove();
  };
}
