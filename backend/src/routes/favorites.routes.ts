import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { sendSuccess, sendError } from '../utils/response';
import { haversineDistance, getBoundingBox } from '../utils/geo';
import { filterStoresByCustomerZone } from '../services/zone.service';

const router = Router();

// Favorites / wishlist — a customer saves canonical products (CatalogItem),
// not a specific store's listing. The list endpoint re-resolves the best
// nearby store carrying each favorite at read time, mirroring the catalog
// browse + the catalog-keyed cart. So a favorite stays useful even after the
// store it was added from runs out of stock or closes.

const addSchema = z.object({
  catalogItemId: z.string().min(1),
});

// The store-resolved offer attached to each favorite, shaped to match the
// `StoreSearchHit` the customer apps already render (so the favorites card can
// reuse the same add-to-cart path as search results).
interface BestOffer {
  storeItemId: string;
  price: number;
  adminMargin: number;
  customerPrice: number;
  stockQty: number;
  store: { id: string; name: string; distanceKm: number | null; isOpen: boolean };
}

// ─── GET /api/v1/favorites/ids ────────────────────────────────────────────────
// Lightweight: just the set of favorited catalogItemIds. Item cards + search
// results call this once to render heart state without an N+1 of detail calls.
router.get('/ids', authenticate, async (req: Request, res: Response) => {
  try {
    const rows = await prisma.favorite.findMany({
      where: { userId: req.user!.id },
      select: { catalogItemId: true },
    });
    return sendSuccess(res, { ids: rows.map((r) => r.catalogItemId) });
  } catch (err) {
    console.error('[Favorites] list ids error:', err);
    return sendError(res, 'Failed to fetch favorites', 500);
  }
});

// ─── GET /api/v1/favorites?lat&lng&radius ─────────────────────────────────────
// Full favorites list. Each entry carries the CatalogItem plus a `bestOffer`
// (cheapest in-stock nearby store) when lat/lng are supplied so the customer
// can add straight to cart; `bestOffer` is null when nothing nearby carries it.
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const lat = parseFloat((req.query['lat'] as string) || '');
    const lng = parseFloat((req.query['lng'] as string) || '');
    const radiusKm = parseFloat((req.query['radius'] as string) || '5');

    const favorites = await prisma.favorite.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      include: { catalogItem: true },
    });

    const catalogIds = favorites.map((f) => f.catalogItemId);

    // Resolve the best nearby offer per catalog item in a single query.
    const offersByCatalogId = new Map<string, { offer: BestOffer; count: number }>();

    if (catalogIds.length > 0 && !isNaN(lat) && !isNaN(lng)) {
      const bb = getBoundingBox(lat, lng, radiusKm);
      const candidates = await prisma.store.findMany({
        where: {
          status: 'ACTIVE',
          // Wholesalers are B2B-only — never surface them in customer discovery.
          isWholesaler: false,
          lat: { gte: bb.minLat, lte: bb.maxLat },
          lng: { gte: bb.minLng, lte: bb.maxLng },
          items: {
            some: { catalogItemId: { in: catalogIds }, isAvailable: true, stockQty: { gt: 0 } },
          },
        },
        include: {
          items: {
            where: { catalogItemId: { in: catalogIds }, isAvailable: true, stockQty: { gt: 0 } },
          },
        },
      });

      // Zone gate (skipped when no zones configured — dev / early deploys).
      const anyZones = (await prisma.zone.count({ where: { isActive: true } })) > 0;
      const withDist = candidates.map((s) => ({
        id: s.id,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        isOpen: s.isOpen,
        zoneId: (s as { zoneId?: string | null }).zoneId ?? null,
        items: s.items,
        distanceKm: haversineDistance(lat, lng, s.lat, s.lng),
      }));
      const inRange = withDist.filter((s) => s.distanceKm <= radiusKm);
      const visible = anyZones
        ? await filterStoresByCustomerZone(inRange, lat, lng)
        : inRange;

      for (const store of visible) {
        for (const item of store.items) {
          const customerPrice = item.price + (item.adminMargin ?? 0);
          const existing = offersByCatalogId.get(item.catalogItemId);
          const candidateOffer: BestOffer = {
            storeItemId: item.id,
            price: item.price,
            adminMargin: item.adminMargin ?? 0,
            customerPrice,
            stockQty: item.stockQty,
            store: {
              id: store.id,
              name: store.name,
              distanceKm: store.distanceKm,
              isOpen: store.isOpen,
            },
          };
          if (!existing) {
            offersByCatalogId.set(item.catalogItemId, { offer: candidateOffer, count: 1 });
          } else {
            existing.count += 1;
            // Cheapest wins; tie-break on proximity.
            const better =
              candidateOffer.customerPrice < existing.offer.customerPrice ||
              (candidateOffer.customerPrice === existing.offer.customerPrice &&
                (candidateOffer.store.distanceKm ?? Infinity) <
                  (existing.offer.store.distanceKm ?? Infinity));
            if (better) existing.offer = candidateOffer;
          }
        }
      }
    }

    const items = favorites.map((f) => {
      const resolved = offersByCatalogId.get(f.catalogItemId);
      return {
        catalogItemId: f.catalogItemId,
        favoritedAt: f.createdAt,
        name: f.catalogItem.name,
        description: f.catalogItem.description,
        imageUrl: f.catalogItem.imageUrl,
        unit: f.catalogItem.defaultUnit,
        category: f.catalogItem.category,
        offerCount: resolved?.count ?? 0,
        bestOffer: resolved?.offer ?? null,
      };
    });

    return sendSuccess(res, { items });
  } catch (err) {
    console.error('[Favorites] list error:', err);
    return sendError(res, 'Failed to fetch favorites', 500);
  }
});

// ─── POST /api/v1/favorites ───────────────────────────────────────────────────
// Add a product to favorites. Idempotent — re-adding an existing favorite is a
// no-op success (the @@unique([userId, catalogItemId]) makes upsert clean).
router.post('/', authenticate, validate(addSchema), async (req: Request, res: Response) => {
  try {
    const { catalogItemId } = req.body as z.infer<typeof addSchema>;

    const exists = await prisma.catalogItem.findUnique({ where: { id: catalogItemId } });
    if (!exists) return sendError(res, 'Product not found', 404);

    const favorite = await prisma.favorite.upsert({
      where: { userId_catalogItemId: { userId: req.user!.id, catalogItemId } },
      create: { userId: req.user!.id, catalogItemId },
      update: {},
    });

    return sendSuccess(res, { favorite, favorited: true }, 'Added to favorites');
  } catch (err) {
    console.error('[Favorites] add error:', err);
    return sendError(res, 'Failed to add favorite', 500);
  }
});

// ─── DELETE /api/v1/favorites/:catalogItemId ──────────────────────────────────
// Remove a product from favorites. Idempotent — removing one that isn't there
// still returns success so the heart toggle can't get stuck.
router.delete('/:catalogItemId', authenticate, async (req: Request, res: Response) => {
  try {
    const catalogItemId = String(req.params['catalogItemId']);
    await prisma.favorite.deleteMany({
      where: { userId: req.user!.id, catalogItemId },
    });
    return sendSuccess(res, { favorited: false }, 'Removed from favorites');
  } catch (err) {
    console.error('[Favorites] remove error:', err);
    return sendError(res, 'Failed to remove favorite', 500);
  }
});

export default router;
