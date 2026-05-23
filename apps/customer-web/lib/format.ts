/**
 * Tiny formatting helpers shared across customer-web pages.
 */

/** Format rupees with a `₹` prefix and no decimal places. */
export function rupees(value: number): string {
  if (!isFinite(value)) return '—';
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

/** Human-friendly distance label: <1km uses metres, otherwise km with 1dp. */
export function distance(km?: number | null): string | null {
  if (km == null || !isFinite(km)) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

/** ETA window from a distance estimate. Returns "20-30 min" style string. */
export function etaWindow(km?: number | null): string {
  if (km == null || !isFinite(km)) return '20-30 min';
  // 12 km/h average city scooter speed → minutes = km * 5; +10 min prep.
  const base = Math.max(10, Math.round(km * 5));
  return `${base}-${base + 10} min`;
}
