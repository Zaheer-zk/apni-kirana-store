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

import { estimateOrderEta, formatEtaWindow } from '@aks/shared';

/**
 * Pre-assignment ETA window from a delivery distance. Returns
 * "20-30 min" style string. Driver vehicle is unknown at discovery
 * time, so the shared estimator falls back to SCOOTER + 5min slack
 * (see shared/src/eta.ts).
 *
 * Post-assignment (order detail screen) should use the order's own
 * `etaMinutes` field — that's computed against the real driver's
 * vehicle and current location.
 */
export function etaWindow(km?: number | null): string {
  if (km == null || !isFinite(km)) return '20-30 min';
  const eta = estimateOrderEta({ deliveryKm: km });
  return formatEtaWindow(eta.totalMinutes);
}
