// Driver payout aggregator. Run weekly (via cron or admin trigger) to roll
// up DELIVERED orders into Payout rows per driver.
//
// Period convention: ISO weeks, Monday → next Monday (UTC). Aggregator can be
// called for any past period; if a Payout for (driverId, periodStart) already
// exists, it's left alone (idempotent — the existing row's totals stay).
//
// We deliberately compute gross = sum(deliveryFee) NOT the gross order total
// — the driver only earns the delivery fee; the item subtotal belongs to the
// store. CLAUDE.md notes "Delivery fee goes to driver earnings".

import { prisma } from '../config/prisma';

/** Start-of-week (Monday, 00:00 UTC) for the supplied date. */
export function weekStart(d: Date = new Date()): Date {
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ... 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift back to Monday
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
  return start;
}

/** Start of the week AFTER the supplied date (exclusive period end). */
export function nextWeekStart(d: Date = new Date()): Date {
  const start = weekStart(d);
  return new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
}

export interface AggregationResult {
  created: number;
  skipped: number;
  drivers: number;
}

/**
 * Aggregate DELIVERED orders into Payout rows for the period [from, to).
 * One Payout per driver who had at least one delivered order in the period.
 * Idempotent: re-running for the same period leaves existing rows alone.
 */
export async function aggregatePayoutsForPeriod(
  from: Date,
  to: Date,
): Promise<AggregationResult> {
  // Group by driverId — sum deliveryFee, count orders.
  const groups = await prisma.order.groupBy({
    by: ['driverId'],
    where: {
      status: 'DELIVERED',
      deliveredAt: { gte: from, lt: to },
      driverId: { not: null },
    },
    _sum: { deliveryFee: true },
    _count: { _all: true },
  });

  let created = 0;
  let skipped = 0;
  for (const g of groups) {
    if (!g.driverId) continue;
    const gross = g._sum.deliveryFee ?? 0;
    if (gross <= 0) {
      skipped++;
      continue;
    }
    try {
      await prisma.payout.create({
        data: {
          driverId: g.driverId,
          periodStart: from,
          periodEnd: to,
          orderCount: g._count._all,
          gross,
          deductions: 0,
          net: gross,
          status: 'PENDING',
        },
      });
      created++;
    } catch (err) {
      // P2002 = unique violation → already aggregated for this period.
      if ((err as { code?: string })?.code === 'P2002') {
        skipped++;
      } else {
        console.error('[Payouts] create error for driver', g.driverId, err);
      }
    }
  }
  return { created, skipped, drivers: groups.length };
}

/** Convenience: aggregate the just-ended ISO week (Mon..Mon). */
export async function aggregateLastWeek(): Promise<AggregationResult> {
  const thisMonday = weekStart(new Date());
  const lastMonday = new Date(thisMonday.getTime() - 7 * 24 * 60 * 60 * 1000);
  return aggregatePayoutsForPeriod(lastMonday, thisMonday);
}
