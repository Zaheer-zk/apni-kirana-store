import { VehicleType } from './enums';

// ETA — single source of truth across backend, customer-web, customer-mobile,
// store-web, store-portal and the driver apps. Every surface that shows a
// "delivery in X min" should derive from this module so a tweak to the
// speed model (or vehicle mix) propagates everywhere.
//
// Why driver-vehicle-aware
// ------------------------
// Drivers can run on a motorbike, scooter, car, pedal bicycle or even on
// foot for short hyperlocal hops. A pedestrian carrying a 1kg sugar pack
// is a perfectly valid delivery for a 300m corner store. Same pickup leg
// served by a motorbike vs on-foot differs by ~5×, so a single average is
// a lie. The constants below come from rough city-traffic observations,
// not GPS averages — tune as we get real telemetry.
//
// Why two legs
// ------------
// Total time = driver→store pickup + store prep + store→customer delivery.
// Before a driver is assigned, the pickup leg is unknown, so the estimate
// is delivery-only (with a small slack for matching). After assignment,
// the full estimate kicks in.

/** Average effective speed (km/h) by vehicle type, accounting for city traffic + stops. */
export const VEHICLE_SPEED_KMH: Record<VehicleType, number> = {
  [VehicleType.BIKE]: 25,        // motorbike — fastest in dense traffic
  [VehicleType.SCOOTER]: 22,
  [VehicleType.CAR]: 18,         // slower than bikes in dense Indian cities
  [VehicleType.BICYCLE]: 12,
  [VehicleType.ON_FOOT]: 5,
};

/** When no driver is assigned yet, assume an average scooter for the delivery leg. */
const DEFAULT_VEHICLE: VehicleType = VehicleType.SCOOTER;

/** Default store prep time (minutes) when we don't have a per-store override. */
export const DEFAULT_PREP_MINUTES = 8;

/** Slack added to pre-assignment estimates to absorb matching delay. */
const PRE_ASSIGNMENT_SLACK_MIN = 5;

export interface EtaBreakdown {
  /** Driver → store pickup leg, in minutes (0 if no driver yet). */
  pickupMinutes: number;
  /** Store prep / packing time, in minutes. */
  prepMinutes: number;
  /** Store → customer delivery leg, in minutes. */
  deliveryMinutes: number;
  /** Sum of the three above, rounded to the nearest minute. */
  totalMinutes: number;
}

export interface EtaInput {
  /** Driver's current → store distance (km). Omit / null if no driver yet. */
  pickupKm?: number | null;
  /** Store → customer distance (km). Required for any meaningful estimate. */
  deliveryKm: number;
  /** Driver's vehicle type. Omit / null pre-assignment; defaults to SCOOTER. */
  driverVehicle?: VehicleType | null;
  /** Store prep time override (e.g. RESTAURANT category). */
  prepMinutes?: number;
}

/**
 * Compute a delivery ETA breakdown.
 *
 * Returns the three legs and their sum. All minutes are rounded up so the
 * customer-facing total never reads optimistically.
 *
 * Examples:
 *   estimateOrderEta({ deliveryKm: 2 })
 *     → pre-assignment: pickup=0, prep=8, delivery=ceil(2/22*60)+5≈11 → total ≈ 19
 *   estimateOrderEta({ pickupKm: 1, deliveryKm: 2, driverVehicle: 'BIKE' })
 *     → pickup=ceil(1/25*60)=3, prep=8, delivery=ceil(2/25*60)=5 → total = 16
 *   estimateOrderEta({ pickupKm: 1, deliveryKm: 2, driverVehicle: 'ON_FOOT' })
 *     → pickup=ceil(1/5*60)=12, prep=8, delivery=ceil(2/5*60)=24 → total = 44
 */
export function estimateOrderEta(input: EtaInput): EtaBreakdown {
  const vehicle = input.driverVehicle ?? DEFAULT_VEHICLE;
  const speed = VEHICLE_SPEED_KMH[vehicle] ?? VEHICLE_SPEED_KMH[DEFAULT_VEHICLE];
  const prepMinutes = input.prepMinutes ?? DEFAULT_PREP_MINUTES;

  const pickupKm = input.pickupKm == null ? 0 : Math.max(0, input.pickupKm);
  const deliveryKm = Math.max(0, input.deliveryKm);

  const pickupMinutes = pickupKm > 0 ? Math.ceil((pickupKm / speed) * 60) : 0;
  // Pre-assignment: nobody to pick up yet → add slack to the delivery leg so
  // the customer-facing number isn't unrealistically tight.
  const slack = input.pickupKm == null ? PRE_ASSIGNMENT_SLACK_MIN : 0;
  const deliveryMinutes = Math.ceil((deliveryKm / speed) * 60) + slack;

  const totalMinutes = pickupMinutes + prepMinutes + deliveryMinutes;
  return { pickupMinutes, prepMinutes, deliveryMinutes, totalMinutes };
}

/**
 * Format an ETA window like "20-30 min" — used pre-assignment when we
 * want to communicate uncertainty rather than a false-precise number.
 * Width defaults to 10 minutes; pass a custom width for tighter windows.
 */
export function formatEtaWindow(totalMinutes: number, widthMinutes = 10): string {
  const low = Math.max(5, Math.round(totalMinutes / 5) * 5);
  return `${low}-${low + widthMinutes} min`;
}

/**
 * Format a single ETA as "≈ 25 min" — used post-assignment when the
 * pickup leg is known and the estimate is tighter.
 */
export function formatEtaPoint(totalMinutes: number): string {
  return `≈ ${Math.max(1, Math.round(totalMinutes))} min`;
}
