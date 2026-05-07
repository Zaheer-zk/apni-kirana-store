import { Router, Request, Response } from 'express';
import os from 'os';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { sendSuccess } from '../utils/response';
import { getRecentErrors, clearErrors } from '../utils/error-log';
import { prisma } from '../config/prisma';

const router = Router();

// All system endpoints are admin-only.
router.use(authenticate, authorize('ADMIN'));

/**
 * GET /api/v1/system/health
 *
 * Snapshot of process + machine stats and a quick DB ping. Cheap enough for
 * the admin page to poll every few seconds without putting load on the DB.
 */
router.get('/health', async (_req: Request, res: Response) => {
  const mem = process.memoryUsage();
  const total = os.totalmem();
  const free = os.freemem();
  const cpus = os.cpus();
  const load = os.loadavg(); // [1m, 5m, 15m]

  // Time a trivial round-trip to gauge DB latency
  let dbLatencyMs: number | null = null;
  let dbOk = false;
  try {
    const t0 = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - t0;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  sendSuccess(res, {
    process: {
      uptimeSeconds: Math.round(process.uptime()),
      pid: process.pid,
      nodeVersion: process.version,
      memory: {
        rssBytes: mem.rss,
        heapUsedBytes: mem.heapUsed,
        heapTotalBytes: mem.heapTotal,
        externalBytes: mem.external,
      },
    },
    system: {
      platform: process.platform,
      arch: process.arch,
      cpuCount: cpus.length,
      cpuModel: cpus[0]?.model ?? 'unknown',
      loadAvg: { '1m': load[0], '5m': load[1], '15m': load[2] },
      // Load avg is not directly a percentage — divide by core count for a
      // rough utilisation hint. Capped at 1.0 in the UI.
      loadPercent: cpus.length ? load[0] / cpus.length : null,
      memory: {
        totalBytes: total,
        freeBytes: free,
        usedBytes: total - free,
        usedPercent: total ? (total - free) / total : null,
      },
    },
    db: {
      ok: dbOk,
      latencyMs: dbLatencyMs,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/system/errors?limit=50
 *
 * Recent unhandled / 5xx errors from the in-memory ring buffer. Resets on
 * process restart — that's fine for an at-a-glance ops view.
 */
router.get('/errors', (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
  const entries = getRecentErrors(limit);
  sendSuccess(res, { errors: entries, count: entries.length });
});

/**
 * DELETE /api/v1/system/errors
 *
 * Wipe the in-memory error buffer (after the admin has triaged them).
 */
router.delete('/errors', (_req: Request, res: Response) => {
  clearErrors();
  sendSuccess(res, { cleared: true });
});

export default router;
