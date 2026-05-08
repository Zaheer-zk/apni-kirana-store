import { PlatformSetting } from '@prisma/client';
import { prisma } from '../config/prisma';

/**
 * Platform settings service.
 *
 * Reads from a singleton PlatformSetting row (id="default"). Hot paths
 * (order creation, store/driver matching) call getSettings() on every
 * request, so the value is cached in-process for SETTINGS_TTL_MS — long
 * enough to amortise DB hits, short enough that an admin PUT propagates
 * to all readers within seconds without restart.
 *
 * If you mutate settings outside this module (don't), call invalidate().
 */

const SETTINGS_TTL_MS = 5_000;

let cache: { value: PlatformSetting; at: number } | null = null;

async function loadFromDb(): Promise<PlatformSetting> {
  // upsert keeps this idempotent — if the migration row was somehow lost
  // (or this is a brand-new env without the seed), we self-heal.
  return prisma.platformSetting.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default' },
  });
}

export async function getSettings(): Promise<PlatformSetting> {
  if (cache && Date.now() - cache.at < SETTINGS_TTL_MS) return cache.value;
  const value = await loadFromDb();
  cache = { value, at: Date.now() };
  return value;
}

export type SettingsPatch = Partial<
  Pick<
    PlatformSetting,
    | 'baseDeliveryFee'
    | 'perKmFee'
    | 'commissionPercent'
    | 'deliveryRadiusKm'
    | 'storeAcceptTimeoutMinutes'
    | 'driverAcceptTimeoutSeconds'
    | 'storeMatchingMode'
    | 'driverMatchingMode'
  >
>;

export async function updateSettings(patch: SettingsPatch): Promise<PlatformSetting> {
  const value = await prisma.platformSetting.update({
    where: { id: 'default' },
    data: patch,
  });
  cache = { value, at: Date.now() };
  return value;
}

export function invalidate(): void {
  cache = null;
}
