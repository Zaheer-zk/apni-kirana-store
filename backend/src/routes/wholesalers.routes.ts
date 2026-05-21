// =====================================================================================
// Wholesaler browse routes — used by store owners to find wholesalers/workshops
// and view their stock before placing a RESTOCK order (see orders.routes.ts POST /restock).
//
// A "wholesaler" is just a Store with isWholesaler = true (admin sets the flag).
// =====================================================================================

import { Router, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { sendSuccess, sendError } from '../utils/response';
import { haversineDistance } from '../utils/geo';

const router = Router();

// GET /api/v1/wholesalers?lat=&lng=&q=
// Lists active wholesaler stores. If lat/lng given, results are sorted nearest-first.
router.get('/', authenticate, authorize('STORE_OWNER', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const q = (req.query['q'] as string | undefined)?.trim();
    const lat = parseFloat((req.query['lat'] as string) || '');
    const lng = parseFloat((req.query['lng'] as string) || '');

    const wholesalers = await prisma.store.findMany({
      where: {
        isWholesaler: true,
        status: 'ACTIVE',
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        street: true,
        city: true,
        state: true,
        lat: true,
        lng: true,
        rating: true,
        isOpen: true,
        openTime: true,
        closeTime: true,
        _count: { select: { items: true } },
      },
    });

    const hasLoc = !Number.isNaN(lat) && !Number.isNaN(lng);
    const withDistance = wholesalers.map((w) => ({
      ...w,
      itemCount: w._count.items,
      distanceKm: hasLoc
        ? parseFloat(haversineDistance(lat, lng, w.lat, w.lng).toFixed(2))
        : null,
    }));
    if (hasLoc) {
      withDistance.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    } else {
      withDistance.sort((a, b) => a.name.localeCompare(b.name));
    }

    return sendSuccess(res, withDistance.map(({ _count, ...rest }) => rest));
  } catch (err) {
    console.error('[Wholesalers] list error:', err);
    return sendError(res, 'Failed to fetch wholesalers', 500);
  }
});

// GET /api/v1/wholesalers/:id/items?q=&page=&limit=
// A wholesaler's stock — the items a store owner can add to a restock order.
router.get('/:id/items', authenticate, authorize('STORE_OWNER', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const id = String(req.params['id']);
    const q = (req.query['q'] as string | undefined)?.trim();
    const page = Math.max(1, parseInt((req.query['page'] as string) || '1', 10));
    const limit = Math.min(100, parseInt((req.query['limit'] as string) || '30', 10));
    const skip = (page - 1) * limit;

    const wholesaler = await prisma.store.findFirst({
      where: { id, isWholesaler: true },
      select: { id: true, name: true, status: true },
    });
    if (!wholesaler) return sendError(res, 'Wholesaler not found', 404);

    const where = {
      storeId: id,
      isAvailable: true,
      ...(q ? { catalogItem: { name: { contains: q, mode: 'insensitive' as const } } } : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.storeItem.findMany({
        where,
        include: { catalogItem: true },
        orderBy: { catalogItem: { name: 'asc' } },
        skip,
        take: limit,
      }),
      prisma.storeItem.count({ where }),
    ]);

    return sendSuccess(res, {
      wholesaler,
      items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('[Wholesalers] items error:', err);
    return sendError(res, 'Failed to fetch wholesaler items', 500);
  }
});

export default router;
