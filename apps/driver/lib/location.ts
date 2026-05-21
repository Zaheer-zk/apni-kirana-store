import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { api } from './api';

export const LOCATION_TASK_NAME = 'background-location-task';

// `expo-task-manager`'s native module is NOT bundled in Expo Go (SDK 53+).
// Importing it is fine, but calling `defineTask` / background location APIs
// throws at runtime under Expo Go and crashes the app on startup. So we
// lazy-load it and no-op background tracking when running in Expo Go.
// Real background GPS needs a dev build (`eas build --profile development`).
const IS_EXPO_GO =
  Constants.executionEnvironment === 'storeClient' ||
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Constants as any).appOwnership === 'expo';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadTaskManager(): any | null {
  if (IS_EXPO_GO) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-task-manager');
  } catch {
    return null;
  }
}

// Module-level context passed into the background task.
let currentOrderId: string | null = null;
let currentToken: string | null = null;

// Define the background task only outside Expo Go (where the native module exists).
const _taskManager = loadTaskManager();
if (_taskManager) {
  _taskManager.defineTask(
    LOCATION_TASK_NAME,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ data, error }: { data: any; error: { message: string } | null }) => {
      if (error) {
        console.error('[LocationTask] Error:', error.message);
        return;
      }
      if (!data) return;

      const { locations } = data as { locations: Location.LocationObject[] };
      const location = locations[0];
      if (!location) return;

      const { latitude, longitude } = location.coords;
      if (!currentOrderId || !currentToken) return;

      try {
        await api.put(
          `/api/v1/drivers/location`,
          { latitude, longitude, orderId: currentOrderId },
          { headers: { Authorization: `Bearer ${currentToken}` } },
        );
      } catch (err) {
        // Best-effort — do not crash the background task
        console.warn('[LocationTask] Failed to update location:', err);
      }
    },
  );
}

/**
 * Requests permissions and starts background location tracking.
 * In Expo Go this is a no-op (background GPS needs a dev build).
 */
export async function startLocationTracking(orderId: string, token: string): Promise<void> {
  currentOrderId = orderId;
  currentToken = token;

  const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== 'granted') {
    console.warn('[LocationTracking] Foreground location permission denied');
    return;
  }

  if (IS_EXPO_GO || !_taskManager) {
    console.log(
      '[LocationTracking] Background GPS is unavailable in Expo Go — build a dev ' +
        'client (`eas build --profile development`) for real background tracking.',
    );
    return;
  }

  const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
  if (bgStatus !== 'granted') {
    console.warn('[LocationTracking] Background location permission denied — foreground only');
  }

  const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (alreadyRunning) return;

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.High,
    timeInterval: 10_000, // every 10 seconds
    distanceInterval: 20, // or every 20 metres
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'AKS Driver — Delivery in Progress',
      notificationBody: 'Location is being tracked for your active delivery.',
      notificationColor: '#DC2626',
    },
  });
}

/**
 * Stops background location tracking and clears stored context.
 */
export async function stopLocationTracking(): Promise<void> {
  currentOrderId = null;
  currentToken = null;

  if (IS_EXPO_GO || !_taskManager) return;

  const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (isRunning) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
}
