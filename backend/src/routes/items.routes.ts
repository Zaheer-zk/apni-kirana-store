// Store-items: store owners select catalog items into their inventory and set price/stock.
// Catalog item CRUD lives in catalog.routes.ts (admin-only).
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import Fuse from 'fuse.js';
import { prisma } from '../config/prisma';
import { authenticate, authorize, requireApproved } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { sendSuccess, sendError } from '../utils/response';
import { getBoundingBox, haversineDistance } from '../utils/geo';
import {
  rankCandidates,
  deriveNormalizers,
  scoreCandidate,
} from '../services/ranking.service';
import { getSettings } from '../services/settings.service';
import { filterStoresByCustomerZone } from '../services/zone.service';

const router = Router();

// ─── Public search: returns store-items (price/stock) joined to catalog ───────
//
// Two call shapes are supported:
//
//   Legacy keyword search (still consumed by the mobile customer app):
//     GET /api/v1/items/search?q=tomato[&category=GROCERY]
//   Returns a flat array, fuzzy-ranked by Fuse.js, no location filtering.
//
//   Location-aware ranking (used by customer-web):
//     GET /api/v1/items/search?q=&lat=28.6&lng=77.2&radius=5&sort=recommended
//   Returns { items, total, radiusKm }, ranked via services/ranking.service.
//   `sort` is one of `recommended` (composite score, default), `cheapest`
//   (ascending price), or `nearest` (ascending distance).
//
// The endpoint decides which mode you wanted by whether `lat`+`lng` are
// present. If location is missing we fall back to the legacy behaviour so
// the Expo app keeps working.

router.get('/search', async (req: Request, res: Response) => {
  try {
    const q = ((req.query['q'] as string) || '').trim();
    const category = req.query['category'] as string | undefined;
    const latStr = req.query['lat'] as string | undefined;
    const lngStr = req.query['lng'] as string | undefined;
    const radiusStr = req.query['radius'] as string | undefined;
    const sort = (req.query['sort'] as string | undefined) ?? 'recommended';
    const limitStr = req.query['limit'] as string | undefined;
    const limit = Math.min(Math.max(parseInt(limitStr ?? '50', 10) || 50, 1), 100);

    const lat = latStr ? Number(latStr) : NaN;
    const lng = lngStr ? Number(lngStr) : NaN;
    const hasLocation = isFinite(lat) && isFinite(lng);

    if (hasLocation) {
      return await searchWithLocation(res, {
        q,
        category,
        lat,
        lng,
        radiusKm: radiusStr ? Math.max(0.5, Math.min(50, Number(radiusStr) || 5)) : undefined,
        sort: sort === 'cheapest' || sort === 'nearest' ? sort : 'recommended',
        limit,
      });
    }

    // ── Legacy mode (no location): fuzzy keyword search across all active stores.
    const baseWhere: Record<string, unknown> = {
      isAvailable: true,
      stockQty: { gt: 0 },
      store: { status: 'ACTIVE', isWholesaler: false },
    };
    if (category) baseWhere['catalogItem'] = { category, isActive: true };

    let candidates = await prisma.storeItem.findMany({
      where: baseWhere,
      include: {
        catalogItem: true,
        store: { select: { id: true, name: true, lat: true, lng: true, isOpen: true } },
      },
      take: 500,
    });

    if (q) {
      const fuse = new Fuse(candidates, {
        keys: [
          { name: 'catalogItem.name', weight: 0.7 },
          { name: 'catalogItem.description', weight: 0.3 },
        ],
        threshold: 0.4,
        ignoreLocation: true,
        minMatchCharLength: 2,
        includeScore: true,
      });
      candidates = fuse
        .search(q)
        .slice(0, 100)
        .map((r) => r.item);
    } else {
      candidates = candidates
        .slice(0, 100)
        .sort((a, b) => a.catalogItem.name.localeCompare(b.catalogItem.name));
    }

    return sendSuccess(res, candidates);
  } catch (err) {
    console.error('[Items] search error:', err);
    return sendError(res, 'Failed to search items', 500);
  }
});

interface LocationSearchOpts {
  q: string;
  category?: string;
  lat: number;
  lng: number;
  radiusKm?: number;
  sort: 'recommended' | 'cheapest' | 'nearest';
  limit: number;
}

/**
 * Location-aware item search. Filters to in-stock items at ACTIVE+OPEN
 * non-wholesaler stores within `radiusKm` of (lat,lng), then ranks via
 * services/ranking.service so the formula stays in sync with the matching
 * engine.
 */
async function searchWithLocation(
  res: Response,
  opts: LocationSearchOpts,
): Promise<Response> {
  const settings = await getSettings().catch(() => ({ deliveryRadiusKm: 5 } as { deliveryRadiusKm: number }));
  const defaultRadius = settings?.deliveryRadiusKm ?? 5;
  const radiusKm = opts.radiusKm ?? defaultRadius;

  // Bounding-box prefilter is cheap; haversine refinement happens in JS so
  // we don't lean on PostGIS (the deployment is plain Postgres).
  const box = getBoundingBox(opts.lat, opts.lng, radiusKm);

  const where: Record<string, unknown> = {
    isAvailable: true,
    stockQty: { gt: 0 },
    store: {
      status: 'ACTIVE',
      isOpen: true,
      isWholesaler: false,
      lat: { gte: box.minLat, lte: box.maxLat },
      lng: { gte: box.minLng, lte: box.maxLng },
    },
  };

  if (opts.category) {
    where['catalogItem'] = { category: opts.category, isActive: true };
  }
  if (opts.q) {
    // Case-insensitive substring match; the index lives on CatalogItem.name.
    where['catalogItem'] = {
      ...((where['catalogItem'] as object) ?? {}),
      name: { contains: opts.q, mode: 'insensitive' },
      isActive: true,
    };
  }

  const raw = await prisma.storeItem.findMany({
    where,
    include: {
      catalogItem: true,
      store: {
        select: {
          id: true,
          name: true,
          lat: true,
          lng: true,
          // zoneId enables the indexed zone-match path in
          // filterStoresByCustomerZone (preferred over haversine).
          zoneId: true,
          isOpen: true,
          rating: true,
          isPreferred: true,
        },
      },
    },
    take: 500,
  });

  // Compute haversine distance + drop anything outside the precise circle.
  const enrichedAll = raw
    .map((row) => ({
      row,
      distanceKm: haversineDistance(opts.lat, opts.lng, row.store.lat, row.store.lng),
    }))
    .filter((r) => r.distanceKm <= radiusKm);

  // Zone-restrict: customer only sees items at stores in the same zone(s)
  // as their location. Falls back to the haversine-only list if no zones
  // are configured (dev / early deployments).
  const zonedStores = await filterStoresByCustomerZone(
    enrichedAll.map((e) => ({
      lat: e.row.store.lat,
      lng: e.row.store.lng,
      zoneId: e.row.store.zoneId,
      _e: e,
    })),
    opts.lat,
    opts.lng,
  );
  const anyZones = (await prisma.zone.count({ where: { isActive: true } })) > 0;
  const enriched = anyZones
    ? zonedStores.map((s) => (s as { _e: typeof enrichedAll[number] })._e)
    : enrichedAll;

  // Score with the shared ranking service so this endpoint and the matching
  // engine never disagree on what "best" means.
  const candidates = enriched.map((e) => ({
    price: e.row.price,
    distanceKm: e.distanceKm,
    rating: e.row.store.rating ?? 0,
    isPreferred: e.row.store.isPreferred ?? false,
  }));
  const norms = deriveNormalizers(candidates, radiusKm);

  const scored = enriched.map((e) => ({
    ...e,
    score: scoreCandidate(
      {
        price: e.row.price,
        distanceKm: e.distanceKm,
        rating: e.row.store.rating ?? 0,
        isPreferred: e.row.store.isPreferred ?? false,
      },
      norms,
    ),
  }));

  if (opts.sort === 'cheapest') {
    scored.sort((a, b) => a.row.price - b.row.price);
  } else if (opts.sort === 'nearest') {
    scored.sort((a, b) => a.distanceKm - b.distanceKm);
  } else {
    scored.sort((a, b) => b.score - a.score);
  }

  // ── Catalog-first deduplication ──────────────────────────────────────
  // Multiple stores can carry the same CatalogItem (e.g. "Aloo Bhujia
  // 200g" stocked by T-and-J at ₹40 and Divine Gems at ₹50). The legacy
  // shape returned one row per StoreItem so the customer saw the same
  // product duplicated. That conflicts with the catalog-first browsing
  // model — the customer shouldn't have to pick a store; they just add
  // the item and the matching engine decides at order time.
  //
  // We now keep ONLY the best-scoring StoreItem per catalogItemId, and
  // attach summary stats so the UI can render a "from ₹X · N stores"
  // hint or open a per-store comparison sheet on tap. `bestOffer`
  // duplicates the legacy flat fields for back-compat with older clients
  // that haven't been updated yet.
  const byCatalogId = new Map<string, typeof scored>();
  for (const s of scored) {
    const arr = byCatalogId.get(s.row.catalogItemId) ?? [];
    arr.push(s);
    byCatalogId.set(s.row.catalogItemId, arr);
  }

  const deduped: Array<{
    best: (typeof scored)[number];
    offers: typeof scored;
  }> = [];
  for (const [, offers] of byCatalogId) {
    deduped.push({ best: offers[0]!, offers });
  }
  // Re-apply the active sort across the deduplicated list — picking
  // first-by-catalog above could put cheaper-elsewhere items below
  // more-expensive-here items otherwise.
  if (opts.sort === 'cheapest') {
    deduped.sort((a, b) => a.best.row.price - b.best.row.price);
  } else if (opts.sort === 'nearest') {
    deduped.sort((a, b) => a.best.distanceKm - b.best.distanceKm);
  } else {
    deduped.sort((a, b) => b.best.score - a.best.score);
  }

  const items = deduped.slice(0, opts.limit).map(({ best: s, offers }) => {
    const adminMargin = (s.row as unknown as { adminMargin?: number }).adminMargin ?? 0;
    const customerPrice = s.row.price + adminMargin;
    // Cross-store stats — surfaced as "from ₹X · 3 stores" on the card,
    // and as an in-app comparison sheet when the customer taps the
    // product. The list is small (capped at the search radius) so we
    // don't paginate it here.
    const allCustomerPrices = offers.map((o) => {
      const am = (o.row as unknown as { adminMargin?: number }).adminMargin ?? 0;
      return o.row.price + am;
    });
    const minCustomerPrice = Math.min(...allCustomerPrices);
    const maxCustomerPrice = Math.max(...allCustomerPrices);
    return {
      // ── Legacy flat fields (kept for back-compat with pre-dedup clients) ──
      storeItemId: s.row.id,
      catalogItemId: s.row.catalogItemId,
      name: s.row.catalogItem.name,
      description: s.row.catalogItem.description,
      imageUrl: s.row.catalogItem.imageUrl,
      unit: s.row.catalogItem.defaultUnit,
      category: s.row.catalogItem.category,
      price: s.row.price,
      adminMargin,
      customerPrice,
      stockQty: s.row.stockQty,
      rating: s.row.store.rating ?? 0,
      score: Number(s.score.toFixed(4)),
      store: {
        id: s.row.store.id,
        name: s.row.store.name,
        isOpen: s.row.store.isOpen,
        distanceKm: Number(s.distanceKm.toFixed(2)),
      },
      // ── New catalog-first fields ─────────────────────────────────────
      /** Number of in-zone stores that carry this catalog item. */
      offerCount: offers.length,
      /** Min customer-facing price across all offers (rupees). */
      minCustomerPrice,
      /** Max customer-facing price across all offers (rupees). */
      maxCustomerPrice,
    };
  });

  return sendSuccess(res, { items, total: items.length, radiusKm });
}

// Silence unused-warning when the file is type-checked with isolatedModules:
void rankCandidates;

// ─── Item detail — fetch a single store-item with store + catalog joined ────
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const idParam = req.params['id'];
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    if (!id) return sendError(res, 'Item id required', 400);

    const storeItem = await prisma.storeItem.findUnique({
      where: { id },
      include: {
        catalogItem: true,
        store: {
          select: {
            id: true,
            name: true,
            lat: true,
            lng: true,
            // zoneId so the per-store zone gate below uses the
            // indexed match path.
            zoneId: true,
            isOpen: true,
            rating: true,
            status: true,
          },
        },
      },
    });
    if (!storeItem) return sendError(res, 'Item not found', 404);

    // Optional caller-provided location lets the UI show "x km away" AND
    // gates the item if the customer is in a zone the store isn't part of
    // (per the 2026-06-02 zone-discovery decision).
    const latStr = req.query['lat'] as string | undefined;
    const lngStr = req.query['lng'] as string | undefined;
    let distanceKm: number | null = null;
    if (latStr && lngStr) {
      const lat = Number(latStr);
      const lng = Number(lngStr);
      if (isFinite(lat) && isFinite(lng)) {
        distanceKm = Number(haversineDistance(lat, lng, storeItem.store.lat, storeItem.store.lng).toFixed(2));

        // Zone gate: if customer is inside a zone, the store must share at
        // least one of those zones. Falls back when no zones exist (dev).
        const anyZones = (await prisma.zone.count({ where: { isActive: true } })) > 0;
        if (anyZones) {
          const allowed = await filterStoresByCustomerZone(
            [
              {
                lat: storeItem.store.lat,
                lng: storeItem.store.lng,
                zoneId: storeItem.store.zoneId,
              },
            ],
            lat,
            lng,
          );
          if (allowed.length === 0) {
            return sendError(
              res,
              'This item is not available in your delivery area',
              404,
            );
          }
        }
      }
    }

    return sendSuccess(res, {
      storeItem: {
        id: storeItem.id,
        // `price` is the store owner's payout per unit (set by store owner).
        // `adminMargin` is admin's commission per unit (set by admin only).
        // Customer-facing price = price + adminMargin. Surfaced as
        // `customerPrice` so client apps don't have to recompute.
        price: storeItem.price,
        adminMargin: storeItem.adminMargin ?? 0,
        customerPrice: storeItem.price + (storeItem.adminMargin ?? 0),
        stockQty: storeItem.stockQty,
        isAvailable: storeItem.isAvailable,
      },
      catalogItem: {
        id: storeItem.catalogItem.id,
        name: storeItem.catalogItem.name,
        description: storeItem.catalogItem.description,
        category: storeItem.catalogItem.category,
        defaultUnit: storeItem.catalogItem.defaultUnit,
        imageUrl: storeItem.catalogItem.imageUrl,
      },
      store: {
        id: storeItem.store.id,
        name: storeItem.store.name,
        rating: storeItem.store.rating ?? 0,
        isOpen: storeItem.store.isOpen,
        status: storeItem.store.status,
        distanceKm,
      },
    });
  } catch (err) {
    console.error('[Items] detail error:', err);
    return sendError(res, 'Failed to load item', 500);
  }
});

// ─── Store owner: manage their own inventory selections ──────────────────────

const addItemSchema = z.object({
  catalogItemId: z.string().min(1),
  price: z.number().positive(),
  stockQty: z.number().int().min(0),
  isAvailable: z.boolean().optional(),
});

router.post(
  '/',
  authenticate,
  authorize('STORE_OWNER'),
  requireApproved,
  validate(addItemSchema),
  async (req: Request, res: Response) => {
    try {
      const myStore = await prisma.store.findUnique({ where: { ownerId: req.user!.id } });
      if (!myStore) return sendError(res, 'No store found for this owner', 404);

      const catalogItem = await prisma.catalogItem.findUnique({
        where: { id: req.body.catalogItemId },
      });
      if (!catalogItem) return sendError(res, 'Catalog item not found', 404);

      const created = await prisma.storeItem.create({
        data: {
          storeId: myStore.id,
          catalogItemId: req.body.catalogItemId,
          price: req.body.price,
          stockQty: req.body.stockQty,
          isAvailable: req.body.isAvailable ?? true,
        },
        include: { catalogItem: true },
      });
      return sendSuccess(res, created, 'Item added to your store', 201);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === 'P2002') return sendError(res, 'Your store already carries this item', 409);
      console.error('[Items] create error:', err);
      return sendError(res, 'Failed to add item', 500);
    }
  },
);

router.put(
  '/:id',
  authenticate,
  authorize('STORE_OWNER'),
  requireApproved,
  validate(addItemSchema.partial().omit({ catalogItemId: true })),
  async (req: Request, res: Response) => {
    try {
      const item = await prisma.storeItem.findUnique({
        where: { id: req.params['id'] }, include: { store: true },
      });
      if (!item) return sendError(res, 'Item not found', 404);
      if (item.store.ownerId !== req.user!.id) return sendError(res, 'Not your item', 403);
      const updated = await prisma.storeItem.update({
        where: { id: req.params['id'] }, data: req.body, include: { catalogItem: true },
      });
      return sendSuccess(res, updated, 'Item updated');
    } catch (err) {
      console.error('[Items] update error:', err);
      return sendError(res, 'Failed to update item', 500);
    }
  },
);

router.delete(
  '/:id',
  authenticate,
  authorize('STORE_OWNER'),
  requireApproved,
  async (req: Request, res: Response) => {
    try {
      const item = await prisma.storeItem.findUnique({
        where: { id: req.params['id'] }, include: { store: true },
      });
      if (!item) return sendError(res, 'Item not found', 404);
      if (item.store.ownerId !== req.user!.id) return sendError(res, 'Not your item', 403);
      await prisma.storeItem.delete({ where: { id: req.params['id'] } });
      return sendSuccess(res, null, 'Item removed from your store');
    } catch (err) {
      console.error('[Items] delete error:', err);
      return sendError(res, 'Failed to delete item', 500);
    }
  },
);

router.put(
  '/:id/toggle-availability',
  authenticate,
  authorize('STORE_OWNER'),
  requireApproved,
  async (req: Request, res: Response) => {
    try {
      const item = await prisma.storeItem.findUnique({
        where: { id: req.params['id'] }, include: { store: true },
      });
      if (!item) return sendError(res, 'Item not found', 404);
      if (item.store.ownerId !== req.user!.id) return sendError(res, 'Not your item', 403);
      const updated = await prisma.storeItem.update({
        where: { id: req.params['id'] }, data: { isAvailable: !item.isAvailable },
      });
      return sendSuccess(res, updated, `Item ${updated.isAvailable ? 'enabled' : 'disabled'}`);
    } catch (err) {
      console.error('[Items] toggle error:', err);
      return sendError(res, 'Failed to toggle availability', 500);
    }
  },
);

const stockSchema = z.object({ stockQty: z.number().int().min(0) });
router.put(
  '/:id/stock',
  authenticate,
  authorize('STORE_OWNER'),
  requireApproved,
  validate(stockSchema),
  async (req: Request, res: Response) => {
    try {
      const item = await prisma.storeItem.findUnique({
        where: { id: req.params['id'] }, include: { store: true },
      });
      if (!item) return sendError(res, 'Item not found', 404);
      if (item.store.ownerId !== req.user!.id) return sendError(res, 'Not your item', 403);
      const updated = await prisma.storeItem.update({
        where: { id: req.params['id'] }, data: { stockQty: req.body.stockQty },
      });
      return sendSuccess(res, updated, 'Stock updated');
    } catch (err) {
      console.error('[Items] stock error:', err);
      return sendError(res, 'Failed to update stock', 500);
    }
  },
);

// ─── Bulk CSV import (store owner) ───────────────────────────────────────────
// Body: { csv: string }
// Headers expected: catalogName,price,stockQty,isAvailable
// catalogName must match an existing CatalogItem.name (admin-managed master).
import { parseCsv } from '../utils/csv';

router.post(
  '/bulk-import',
  authenticate,
  authorize('STORE_OWNER'),
  requireApproved,
  async (req: Request, res: Response) => {
    try {
      const myStore = await prisma.store.findUnique({ where: { ownerId: req.user!.id } });
      if (!myStore) return sendError(res, 'No store found for this owner', 404);

      const csv = (req.body?.csv as string | undefined) ?? '';
      if (!csv.trim()) return sendError(res, 'csv field required', 400);

      const { rows, errors } = parseCsv<{ catalogName: string; price: number; stockQty: number; isAvailable: boolean }>(
        csv,
        (rec, line) => {
          if (!rec.catalogName) throw new Error(`Line ${line}: catalogName required`);
          const price = parseFloat(rec.price);
          if (!isFinite(price) || price <= 0) throw new Error(`Line ${line}: price must be > 0`);
          const stockQty = parseInt(rec.stockQty, 10);
          if (!isFinite(stockQty) || stockQty < 0) throw new Error(`Line ${line}: stockQty must be >= 0`);
          return {
            catalogName: rec.catalogName.trim(),
            price,
            stockQty,
            isAvailable: rec.isAvailable ? rec.isAvailable.toLowerCase() !== 'false' : true,
          };
        },
      );

      // Resolve catalog names → ids in one query
      const catalogItems = await prisma.catalogItem.findMany({
        where: { name: { in: rows.map((r) => r.catalogName) } },
        select: { id: true, name: true },
      });
      const catalogByName = new Map(catalogItems.map((c) => [c.name, c.id]));

      let upserted = 0;
      const failures: Array<{ row: string; error: string }> = [];

      for (const r of rows) {
        const catalogItemId = catalogByName.get(r.catalogName);
        if (!catalogItemId) {
          failures.push({ row: r.catalogName, error: 'Catalog item not found in master list' });
          continue;
        }
        try {
          await prisma.storeItem.upsert({
            where: { storeId_catalogItemId: { storeId: myStore.id, catalogItemId } },
            create: {
              storeId: myStore.id, catalogItemId,
              price: r.price, stockQty: r.stockQty, isAvailable: r.isAvailable,
            },
            update: {
              price: r.price, stockQty: r.stockQty, isAvailable: r.isAvailable,
            },
          });
          upserted++;
        } catch (err) {
          failures.push({ row: r.catalogName, error: (err as Error).message });
        }
      }

      return sendSuccess(
        res,
        { processed: rows.length, upserted, parseErrors: errors, upsertFailures: failures },
        `${upserted} inventory rows imported`,
      );
    } catch (err) {
      console.error('[Items] bulk-import error:', err);
      return sendError(res, 'Failed to import inventory', 500);
    }
  },
);

export default router;
