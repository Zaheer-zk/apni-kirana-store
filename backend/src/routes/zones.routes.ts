// Public-ish zones endpoint for authenticated users. Drivers read this to
// populate their "Serving zones" multi-select picker; store-web could use
// it for the same purpose later. Admin-only zone CRUD lives in
// admin.routes.ts — this router is read-only.

import { Router, type Request, type Response } from 'express';
import { prisma } from '../config/prisma';
import { authenticate } from '../middleware/auth.middleware';
import { sendSuccess, sendError } from '../utils/response';
import { haversineDistance } from '../utils/geo';

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

// GET /zones/coverage?lat=X&lng=Y — does the given location fall inside ANY
// active zone, and if not, which zone is closest? Drives the customer-web
// "we don't serve your area yet" UX without leaking commission/fee data.
//
// Response shape:
//   { inZone: true,  zone: {...}, distanceKm: 0 }
//   { inZone: false, zone: null,  nearestZone: {...}, distanceKm: 3.4 }
// Auth-optional on purpose: anonymous visitors should also be able to ask
// "do you deliver here?" before signing up.
router.get('/coverage', async (req: Request, res: Response) => {
  try {
    const lat = Number(req.query['lat']);
    const lng = Number(req.query['lng']);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return sendError(res, 'lat and lng query params are required', 400);
    }

    const zones = await prisma.zone.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        city: true,
        centerLat: true,
        centerLng: true,
        radiusKm: true,
      },
    });

    if (zones.length === 0) {
      return sendSuccess(res, {
        inZone: false,
        zone: null,
        nearestZone: null,
        distanceKm: null,
      });
    }

    let nearest = zones[0];
    let nearestDist = haversineDistance(lat, lng, nearest.centerLat, nearest.centerLng);
    let containing: typeof nearest | null = null;

    for (const z of zones) {
      const d = haversineDistance(lat, lng, z.centerLat, z.centerLng);
      if (d <= z.radiusKm) {
        // Inside this zone — return the closest containing zone (in case of overlapping zones).
        if (!containing || d < nearestDist) {
          containing = z;
          nearestDist = d;
        }
      }
      if (d < nearestDist) {
        nearest = z;
        nearestDist = d;
      }
    }

    if (containing) {
      return sendSuccess(res, {
        inZone: true,
        zone: containing,
        distanceKm: Number(nearestDist.toFixed(2)),
      });
    }

    // Recompute the nearest distance (the loop above may have shrunk it
    // while comparing against an unrelated zone; re-derive for clarity).
    const trueNearestDist = haversineDistance(lat, lng, nearest.centerLat, nearest.centerLng);
    return sendSuccess(res, {
      inZone: false,
      zone: null,
      nearestZone: nearest,
      distanceKm: Number(trueNearestDist.toFixed(2)),
    });
  } catch (err) {
    console.error('[Zones] coverage error:', err);
    return sendError(res, 'Failed to check zone coverage', 500);
  }
});

export default router;
