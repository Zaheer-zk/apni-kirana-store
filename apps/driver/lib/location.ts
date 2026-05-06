import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { api } from './api';

export const LOCATION_TASK_NAME = 'background-location-task';

// ---------------------------------------------------------------------------
// Background task definition (must be called at module-level / top of entry)
// ---------------------------------------------------------------------------
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('[LocationTask] Error:', error.message);
    return;
  }

  if (!data) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  const location = locations[0];
  if (!location) return;

  const { latitude, longitude } = location.coords;
  const orderId = currentOrderId;
  const token = currentToken;

  if (!orderId || !token) return;

  try {
    await api.put(
      `/api/v1/drivers/location`,
      { latitude, longitude, orderId },
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (err) {
    // Best-effort — do not crash the background task
    console.warn('[LocationTask] Failed to update location:', err);
  }
});

// Module-level variables to pass context into the background task
let currentOrderId: string | null = null;
let currentToken: string | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Requests necessary permissions and starts background location tracking.
 * Location updates are sent to the backend via the background task.
 */
export async function startLocationTracking(
  orderId: string,
  token: string
): Promise<void> {
  currentOrderId = orderId;
  currentToken = token;

  const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== 'granted') {
    console.warn('[LocationTracking] Foreground location permission denied');
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
    timeInterval: 10_000,   // every 10 seconds
    distanceInterval: 20,   // or every 20 metres
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

  const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (isRunning) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
}
