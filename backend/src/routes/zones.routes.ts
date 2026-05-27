// Public-ish zones endpoint for authenticated users. Drivers read this to
// populate their "Serving zones" multi-select picker; store-web could use
// it for the same purpose later. Admin-only zone CRUD lives in
// admin.routes.ts — this router is read-only.

import { Router, type Request, type Response } from 'express';
import { prisma } from '../config/prisma';
import { authenticate } from '../middleware/auth.middleware';
import { sendSuccess, sendError } from '../utils/response';

const router = Router();

// GET /zones — list every ACTIVE zone. Returns only safe fields (no
// commission/fee data — those are admin-only).
router.get('/', authenticate, async (_req: Request, res: Response) => {
  try {
    const zones = await prisma.zone.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        city: true,
        centerLat: true,
        centerLng: true,
        radiusKm: true,
        isActive: true,
      },
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
    });
    return sendSuccess(res, zones);
  } catch (err) {
    console.error('[Zones] list error:', err);
    return sendError(res, 'Failed to fetch zones', 500);
  }
});

export default router;
