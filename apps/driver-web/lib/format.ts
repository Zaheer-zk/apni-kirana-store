/**
 * Tiny formatting helpers shared across driver-web pages. Same shape as
 * `apps/customer-web/lib/format.ts` so behaviour matches.
 */

/** Format rupees with a `₹` prefix and no decimal places. */
export function rupees(value?: number | null): string {
  if (value == null || !isFinite(value)) return '—';
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

/** Same as `rupees` but keeps 2 decimal places (used in earnings totals). */
export function rupeesPrecise(value?: number | null): string {
  if (value == null || !isFinite(value)) return '—';
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Friendly relative-or-absolute date string. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Builds a "directions to lat,lng" Google Maps URL — the web equivalent of
 * `Linking.openURL(google.navigation:q=…)` in the Expo app.
 */
export function mapsDirectionsUrl(lat?: number | null, lng?: number | null): string | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
