import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

interface LocationCoords {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

interface UseLocationResult {
  coords: LocationCoords | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useLocation(): UseLocationResult {
  const [coords, setCoords] = useState<LocationCoords | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchLocation() {
    setLoading(true);
    setError(null);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== Location.PermissionStatus.GRANTED) {
        setError('Location permission denied. Please enable it in Settings.');
        setLoading(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setCoords({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to get location. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLocation();
  }, []);

  return { coords, loading, error, refresh: fetchLocation };
}
