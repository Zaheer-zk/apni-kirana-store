import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ItemCategory, CatalogRequestStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { sendSuccess, sendError } from '../utils/response';
import { sendWebPushToUser } from '../services/web-push.service';

// Store owners raise requests for new catalog items; admin reviews them.
// Lives in its own file rather than catalog.routes.ts because the access
// rules and audience are different (store-owner OR admin, not public),
// and we want a clean nested path under /api/v1/catalog/requests + a
// mirrored admin queue at /api/v1/admin/catalog-requests.
const router = Router();

const createSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  category: z.nativeEnum(ItemCategory),
  defaultUnit: z.string().min(1).max(40),
  imageUrl: z.string().url().optional(),
  priceHint: z.number().positive().optional(),
});

// ─── Store-owner endpoints ────────────────────────────────────────────────────

// POST /api/v1/catalog/requests — store owner asks admin to add a new item
router.post(
  '/',
  authenticate,
  authorize('STORE_OWNER'),
  validate(createSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const store = await prisma.store.findUnique({ where: { ownerId: userId } });
      if (!store) return sendError(res, 'No store registered for this account', 404);

      // Guard rail: don't accept duplicate pending requests for the same name
      // from the same store — keeps the admin queue clean.
      const dup = await prisma.catalogItemRequest.findFirst({
        where: { storeId: store.id, name: req.body.name, status: 'PENDING' },
      });
      if (dup) {
        return sendError(
          res,
          'You already have a pending request for this item — admin will review soon.',
          409,
        );
      }

      const created = await prisma.catalogItemRequest.create({
        data: { ...req.body, storeId: store.id, requestedBy: userId },
      });

      // Best-effort notify all admins so the queue surfaces immediately.
      notifyAdminsOfRequest(created.id).catch((e) =>
        console.warn('[CatalogReq] admin notify failed:', e),
      );

      return sendSuccess(res, created, 'Request submitted for review', 201);
    } catch (err) {
      console.error('[CatalogReq] create error:', err);
      return sendError(res, 'Failed to submit request', 500);
    }
  },
);

// GET /api/v1/catalog/requests/mine — store owner's own request history
router.get(
  '/mine',
  authenticate,
  authorize('STORE_OWNER'),
  async (req: Request, res: Response) => {
    try {
      const store = await prisma.store.findUnique({ where: { ownerId: req.user!.id } });
      if (!store) return sendSuccess(res, []);
      const requests = await prisma.catalogItemRequest.findMany({
        where: { storeId: store.id },
        orderBy: { createdAt: 'desc' },
        include: {
          catalogItem: { select: { id: true, name: true, imageUrl: true } },
        },
      });
      return sendSuccess(res, requests);
    } catch (err) {
      console.error('[CatalogReq] mine error:', err);
      return sendError(res, 'Failed to load your requests', 500);
    }
  },
);

async function notifyAdminsOfRequest(requestId: string): Promise<void> {
  const req = await prisma.catalogItemRequest.findUnique({
    where: { id: requestId },
    include: { store: { select: { name: true } } },
  });
  if (!req) return;
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', isActive: true },
    select: { id: true },
  });
  await Promise.allSettled(
    admins.map((a) =>
      sendWebPushToUser(a.id, {
        title: 'New catalog item request',
        body: `${req.store.name} requested "${req.name}".`,
        data: { url: '/catalog-requests' },
      }),
    ),
  );
}

export default router;

// ─── Admin endpoints (exported separately, mounted under /admin) ──────────────

export const adminRouter = Router();

// GET /api/v1/admin/catalog-requests?status=PENDING
adminRouter.get('/', authenticate, authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const statusParam = req.query['status'] as string | undefined;
    const where: Record<string, unknown> = {};
    if (statusParam && ['PENDING', 'APPROVED', 'REJECTED'].includes(statusParam)) {
      where['status'] = statusParam;
    }
    const items = await prisma.catalogItemRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        store: { select: { id: true, name: true, city: true } },
        requester: { select: { id: true, name: true, phone: true } },
        catalogItem: { select: { id: true, name: true, imageUrl: true } },
      },
    });
    return sendSuccess(res, items);
  } catch (err) {
    console.error('[CatalogReq] admin list error:', err);
    return sendError(res, 'Failed to load requests', 500);
  }
});

const reviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  reviewNote: z.string().max(500).optional(),
  // Admin can override the canonical name/description/unit when approving
  // (free-text user input often needs a polish before it lands in master catalog).
  overrideName: z.string().min(2).max(120).optional(),
  overrideDescription: z.string().max(500).optional(),
  overrideUnit: z.string().min(1).max(40).optional(),
});

// PUT /api/v1/admin/catalog-requests/:id
adminRouter.put(
  '/:id',
  authenticate,
  authorize('ADMIN'),
  validate(reviewSchema),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const adminId = req.user!.id;
      const reqRow = await prisma.catalogItemRequest.findUnique({ where: { id } });
      if (!reqRow) return sendError(res, 'Request not found', 404);
      if (reqRow.status !== 'PENDING') {
        return sendError(res, `Already ${reqRow.status.toLowerCase()}`, 409);
      }

      const action = req.body.status as 'APPROVED' | 'REJECTED';

      if (action === 'REJECTED') {
        const updated = await prisma.catalogItemRequest.update({
          where: { id },
          data: {
            status: 'REJECTED',
            reviewNote: req.body.reviewNote ?? null,
            reviewedBy: adminId,
            reviewedAt: new Date(),
          },
        });
        // Notify requester so they see why it bounced.
        sendWebPushToUser(reqRow.requestedBy, {
          title: 'Catalog request rejected',
          body: `Your request for "${reqRow.name}" was not approved.`,
          data: { url: '/help' },
        }).catch(() => undefined);
        return sendSuccess(res, updated, 'Request rejected');
      }

      // APPROVED → create CatalogItem (if no duplicate name) and auto-add it
      // to the requesting store's inventory at the priceHint (or 0 if absent).
      const name = (req.body.overrideName || reqRow.name).trim();
      const description = req.body.overrideDescription ?? reqRow.description;
      const defaultUnit = req.body.overrideUnit || reqRow.defaultUnit;

      // Reuse if an item with that name already exists; otherwise create.
      let catalogItem = await prisma.catalogItem.findUnique({ where: { name } });
      if (!catalogItem) {
        catalogItem = await prisma.catalogItem.create({
          data: {
            name,
            description: description ?? null,
            category: reqRow.category,
            defaultUnit,
            imageUrl: reqRow.imageUrl ?? null,
            isActive: true,
          },
        });
      }

      // Auto-add to requester's store at priceHint (or zero) so the owner
      // doesn't have to find it manually.
      await prisma.storeItem
        .upsert({
          where: {
            storeId_catalogItemId: {
              storeId: reqRow.storeId,
              catalogItemId: catalogItem.id,
            },
          },
          create: {
            storeId: reqRow.storeId,
            catalogItemId: catalogItem.id,
            price: reqRow.priceHint ?? 0,
            stockQty: 0,
            isAvailable: false,
          },
          update: {},
        })
        .catch((e) => console.warn('[CatalogReq] inventory link failed:', e));

      const updated = await prisma.catalogItemRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          reviewNote: req.body.reviewNote ?? null,
          reviewedBy: adminId,
          reviewedAt: new Date(),
          catalogItemId: catalogItem.id,
        },
        include: { catalogItem: true },
      });

      sendWebPushToUser(reqRow.requestedBy, {
        title: 'Catalog request approved',
        body: `"${name}" is now in the catalog. Set price + stock in your inventory.`,
        data: { url: '/inventory' },
      }).catch(() => undefined);

      return sendSuccess(res, updated, 'Request approved');
    } catch (err) {
      console.error('[CatalogReq] review error:', err);
      return sendError(res, 'Failed to review request', 500);
    }
  },
);

// Re-export for casual reference
export { CatalogRequestStatus };
