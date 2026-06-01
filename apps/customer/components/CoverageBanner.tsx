import { useQuery } from '@tanstack/react-query';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { apiClient } from '@/lib/api';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

// Mirrors the web `CoverageBanner` (apps/customer-web/app/page.tsx:40-132).
// Hits /api/v1/zones/coverage with the customer's saved default-address
// coordinates. If they're inside a configured zone, we render a quiet
// confirmation chip; if not, a loud amber card with the nearest zone +
// a CTA to update their address. Without this, out-of-zone customers
// silently see "no stores nearby" with no explanation.

interface CoverageResponse {
  inZone: boolean;
  zone: { name: string; city: string } | null;
  nearestZone?: {
    name: string;
    city: string;
    centerLat: number;
    centerLng: number;
  } | null;
  distanceKm: number | null;
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

interface CoverageBannerProps {
  lat: number | null | undefined;
  lng: number | null | undefined;
}

export function CoverageBanner({ lat, lng }: CoverageBannerProps) {
  const enabled = typeof lat === 'number' && typeof lng === 'number';

  const coverage = useQuery<CoverageResponse>({
    queryKey: ['coverage', lat, lng],
    queryFn: async () => {
      const res = await apiClient.get('/api/v1/zones/coverage', {
        params: { lat, lng },
      });
      return unwrap<CoverageResponse>(res.data);
    },
    // Coverage is stable per location — don't hammer the endpoint.
    staleTime: 5 * 60_000,
    enabled,
  });

  if (!enabled || coverage.isLoading || coverage.isError) return null;
  const data = coverage.data;
  if (!data) return null;

  // In-zone — quiet confirmation chip so the user knows we got their location.
  if (data.inZone && data.zone) {
    return (
      <View style={styles.chip}>
        <Ionicons name="location" size={14} color={colors.success} />
        <Text style={styles.chipText} numberOfLines={1}>
          Delivering to <Text style={styles.chipBold}>{data.zone.name}</Text>, {data.zone.city}
        </Text>
      </View>
    );
  }

  // Out of every zone — amber call-to-action.
  return (
    <View style={styles.banner}>
      <View style={styles.iconWrap}>
        <Ionicons name="location-outline" size={22} color="#92400E" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>We&apos;re not here yet</Text>
        <Text style={styles.body}>
          Your location is outside our delivery area.
          {data.nearestZone ? (
            <>
              {' '}The closest area we serve is{' '}
              <Text style={styles.bodyBold}>
                {data.nearestZone.name}, {data.nearestZone.city}
              </Text>
              {typeof data.distanceKm === 'number'
                ? ` (~${data.distanceKm.toFixed(1)} km away)`
                : ''}
              .
            </>
          ) : null}
        </Text>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push('/account/addresses')}
          style={styles.cta}
        >
          <Ionicons name="map-outline" size={14} color={colors.white} />
          <Text style={styles.ctaText}>Manage addresses</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.successLight,
    borderColor: '#A7F3D0',
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  chipText: {
    fontSize: fontSize.xs,
    color: '#166534',
    fontWeight: '600',
  },
  chipBold: { fontWeight: '800' },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: '#78350F',
  },
  body: {
    marginTop: 4,
    fontSize: fontSize.sm,
    color: '#92400E',
    lineHeight: 19,
  },
  bodyBold: { fontWeight: '800' },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: spacing.md,
    backgroundColor: '#D97706',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  ctaText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: fontSize.xs,
  },
});
