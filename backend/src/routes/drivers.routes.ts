import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { VehicleType } from '@prisma/client';
import { prisma } from '../config/prisma';
import { config } from '../config/env';
import { authenticate, authorize, requireApproved } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { sendSuccess, sendError } from '../utils/response';
import { assignDriverForOrder } from '../services/driver.service';
import { sendNotification } from '../services/notification.service';
import { generateInvoiceForOrder } from '../services/invoice.service';
import { broadcastOrderStatus } from '../services/order-events.service';
import { sendNewDriverAwaitingApprovalEmail } from '../services/email.service';
import { sendWebPushToUser } from '../services/web-push.service';
import { haversineDistance } from '../utils/geo';

const router = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const registerDriverSchema = z.object({
  vehicleType: z.nativeEnum(VehicleType),
  vehicleNumber: z.string().min(2).max(20),
  licenseNumber: z.string().min(4).max(30),
});

const updateStatusSchema = z.object({
  status: z.enum(['ONLINE', 'OFFLINE']),
});

const updateLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

// ─── Helper ───────────────────────────────────────────────────────────────────

async function getDriverByUser(userId: string) {
  return prisma.driver.findUnique({ where: { userId } });
}

// ─── POST /register ───────────────────────────────────────────────────────────

router.post(
  '/register',
  authenticate,
  authorize('DRIVER'),
  validate(registerDriverSchema),
  async (req: Request, res: Response) => {
    try {
      const existing = await getDriverByUser(req.user!.id);
      if (existing) return sendError(res, 'You are already registered as a driver', 409);

      const driver = await prisma.driver.create({
        data: { ...req.body, userId: req.user!.id, status: 'PENDING_APPROVAL' },
      });

      // Notify every admin so they know there's a new driver to review.
      // Best-effort — never fail the registration on a notification miss.
      notifyAdminsOfNewDriver(driver.id, req.user!.id).catch((err) =>
        console.warn('[Drivers] admin notification failed:', err),
      );

      return sendSuccess(res, driver, 'Driver registered. Awaiting approval.', 201);
    } catch (err) {
      console.error('[Drivers] register error:', err);
      return sendError(res, 'Failed to register driver', 500);
    }
  },
);

/**
 * Fans out a "new driver pending approval" notification to every active
 * admin: email (where an admin has one on file) + web push. Best-effort.
 */
async function notifyAdminsOfNewDriver(driverId: string, userId: string): Promise<void> {
  const [driver, user, admins] = await Promise.all([
    prisma.driver.findUnique({
      where: { id: driverId },
      select: { id: true, vehicleType: true, vehicleNumber: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, phone: true } }),
    prisma.user.findMany({
      where: { role: 'ADMIN', isActive: true },
      select: { id: true, name: true, email: true },
    }),
  ]);
  if (!driver) return;

  const adminsWithEmail = admins
    .filter((a): a is typeof a & { email: string } => !!a.email)
    .map((a) => ({ email: a.email, name: a.name }));

  await sendNewDriverAwaitingApprovalEmail({
    toAdmins: adminsWithEmail,
    driverName: user?.name ?? null,
    driverPhone: user?.phone ?? null,
    driverId: driver.id,
    vehicleType: driver.vehicleType,
    vehicleNumber: driver.vehicleNumber,
    reviewLinkBase: config.webAppUrl,
  }).catch((err) => console.warn('[Drivers] admin email failed:', err));

  await Promise.allSettled(
    admins.map((a) =>
      sendWebPushToUser(a.id, {
        title: 'New driver awaiting approval',
        body: `${user?.name ?? 'A new driver'} just registered (${driver.vehicleNumber}).`,
        url: `${config.webAppUrl}/drivers/${driver.id}`,
      }),
    ),
  );
}

// ─── PUT /status ──────────────────────────────────────────────────────────────

router.put(
  '/status',
  authenticate,
  authorize('DRIVER'),
  validate(updateStatusSchema),
  async (req: Request, res: Response) => {
    try {
      const driver = await getDriverByUser(req.user!.id);
      if (!driver) return sendError(res, 'Driver profile not found', 404);

      if (driver.status === 'PENDING_APPROVAL' || driver.status === 'SUSPENDED') {
        return sendError(res, 'Your account is not yet approved', 403);
      }

      const { status } = req.body as { status: 'ONLINE' | 'OFFLINE' };

      const updated = await prisma.driver.update({
        where: { id: driver.id },
        data: { status },
      });

      return sendSuccess(res, { status: updated.status }, `You are now ${status.toLowerCase()}`);
    } catch (err) {
      console.error('[Drivers] status error:', err);
      return sendError(res, 'Failed to update status', 500);
    }
  },
);

// ─── PUT /location ────────────────────────────────────────────────────────────

router.put(
  '/location',
  authenticate,
  authorize('DRIVER'),
  validate(updateLocationSchema),
  async (req: Request, res: Response) => {
    try {
      const { lat, lng } = req.body as { lat: number; lng: number };

      const driver = await prisma.driver.update({
        where: { userId: req.user!.id },
        data: { currentLat: lat, currentLng: lng },
        select: { id: true, currentLat: true, currentLng: true },
      });

      return sendSuccess(res, driver, 'Location updated');
    } catch (err) {
      console.error('[Drivers] location error:', err);
      return sendError(res, 'Failed to update location', 500);
    }
  },
);

// ─── GET /earnings ────────────────────────────────────────────────────────────

router.get('/earnings', authenticate, authorize('DRIVER'), async (req: Request, res: Response) => {
  try {
    const driver = await getDriverByUser(req.user!.id);
    if (!driver) return sendError(res, 'Driver profile not found', 404);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalOrders, todayOrders] = await Promise.all([
      prisma.order.count({ where: { driverId: driver.id, status: 'DELIVERED' } }),
      prisma.order.count({
        where: { driverId: driver.id, status: 'DELIVERED', deliveredAt: { gte: today } },
      }),
    ]);

    return sendSuccess(res, {
      totalEarnings: driver.totalEarnings,
      rating: driver.rating,
      totalRatings: driver.totalRatings,
      totalDeliveries: totalOrders,
      todayDeliveries: todayOrders,
    });
  } catch (err) {
    console.error('[Drivers] earnings error:', err);
    return sendError(res, 'Failed to fetch earnings', 500);
  }
});

// ─── GET /stats/today ─────────────────────────────────────────────────────────
// Today's deliveries + earnings + rating snapshot (used by driver dashboard).
router.get(
  '/stats/today',
  authenticate,
  authorize('DRIVER'),
  async (req: Request, res: Response) => {
    try {
      const driver = await getDriverByUser(req.user!.id);
      if (!driver) return sendError(res, 'Driver profile not found', 404);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayDeliveredOrders = await prisma.order.findMany({
        where: { driverId: driver.id, status: 'DELIVERED', deliveredAt: { gte: today } },
        select: { deliveryFee: true },
      });
      const todayEarnings = todayDeliveredOrders.reduce(
        (sum, o) => sum + (o.deliveryFee ?? 0),
        0,
      );

      return sendSuccess(res, {
        todayDeliveries: todayDeliveredOrders.length,
        todayEarnings,
        rating: driver.rating,
        totalRatings: driver.totalRatings,
        status: driver.status,
      });
    } catch (err) {
      console.error('[Drivers] stats/today error:', err);
      return sendError(res, 'Failed to fetch stats', 500);
    }
  },
);

// ─── GET /deliveries ──────────────────────────────────────────────────────────
// Driver's own delivery history (alias for orders filtered to this driver).
router.get(
  '/deliveries',
  authenticate,
  authorize('DRIVER'),
  async (req: Request, res: Response) => {
    try {
      const driver = await getDriverByUser(req.user!.id);
      if (!driver) return sendError(res, 'Driver profile not found', 404);

      const status = req.query['status'] as string | undefined;
      const orders = await prisma.order.findMany({
        where: {
          driverId: driver.id,
          ...(status ? { status: status as never } : {}),
        },
        include: {
          store: { select: { name: true, lat: true, lng: true } },
          deliveryAddress: { select: { lat: true, lng: true, label: true, city: true, pincode: true } },
          rating: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return sendSuccess(res, orders);
    } catch (err) {
      console.error('[Drivers] deliveries error:', err);
      return sendError(res, 'Failed to fetch deliveries', 500);
    }
  },
);

// ─── GET /order-group/:id — driver multi-pickup rollup ────────────────────
// Driver-side view of a multi-store basket. Returns every pickup leg the
// driver needs to do (in route-friendly order: nearest first from their
// current location, falling back to insertion order if no driver
// location yet) plus the single dropoff. PII redacted: no customer
// name/phone or full street — same privacy contract as the per-order
// driver endpoint.
//
// Driver must be the one assigned to the group; otherwise 403. The
// matching engine fans driver assignment across the group's children
// (assignDriverToGroup in order-group.service.ts) so checking any
// child's driverId is enough.

router.get(
  '/order-group/:id',
  authenticate,
  authorize('DRIVER'),
  async (req: Request, res: Response) => {
    try {
      const driver = await getDriverByUser(req.user!.id);
      if (!driver) return sendError(res, 'Driver profile not found', 404);

      // Prisma's findUnique-with-include return type in this repo's
      // tsconfig narrows away relations — explicit shape so the
      // .orders / .deliveryAddress accesses below typecheck.
      type GroupRow = {
        id: string;
        status: string;
        driverId: string | null;
        total: number;
        paymentMethod: string;
        recipientName: string | null;
        recipientPhone: string | null;
        deliveryAddress: {
          lat: number;
          lng: number;
          label: string;
          city: string;
          pincode: string;
        } | null;
        orders: Array<{
          id: string;
          status: string;
          subtotal: number;
          pickedUpAt: Date | null;
          items: Array<{ id: string }>;
          store: {
            id: string;
            name: string;
            lat: number;
            lng: number;
            city: string;
            street: string;
          } | null;
        }>;
      };
      const group = (await prisma.orderGroup.findUnique({
        where: { id: req.params['id'] as string },
        include: {
          deliveryAddress: {
            select: { lat: true, lng: true, label: true, city: true, pincode: true },
          },
          orders: {
            include: {
              items: true,
              store: {
                select: { id: true, name: true, lat: true, lng: true, city: true, street: true },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      })) as unknown as GroupRow | null;
      if (!group) return sendError(res, 'Order group not found', 404);
      if (group.driverId !== driver.id) {
        return sendError(res, 'This group was not assigned to you', 403);
      }

      // Order legs to minimise the driver's total trip distance. We
      // split into picked-up (already done — stays at the front in
      // chronological order) and remaining (route-optimised via TSP).
      // Picked-up legs at the top let the driver glance at "what's
      // done" without scrolling; the remaining legs are presented in
      // the order they should actually visit.
      const legs = group.orders.map((o) => ({
        orderId: o.id,
        status: o.status,
        pickedUpAt: o.pickedUpAt,
        store: o.store,
        itemsCount: o.items.length,
        subtotal: o.subtotal,
      }));
      if (
        driver.currentLat != null &&
        driver.currentLng != null &&
        group.deliveryAddress
      ) {
        const { optimizePickupOrder } = await import(
          '../services/route-optimizer.service'
        );
        const driverLat = driver.currentLat;
        const driverLng = driver.currentLng;
        const dropoffLat = group.deliveryAddress.lat;
        const dropoffLng = group.deliveryAddress.lng;
        const pickedUp = legs.filter((l) => l.pickedUpAt);
        const remaining = legs
          .filter((l) => !l.pickedUpAt && l.store?.lat != null && l.store?.lng != null)
          .map((l) => ({
            ...l,
            lat: l.store!.lat!,
            lng: l.store!.lng!,
          }));
        const { order: optimised } = optimizePickupOrder({
          driverLat,
          driverLng,
          pickups: remaining.map((r) => ({ id: r.orderId, lat: r.lat, lng: r.lng })),
          dropoffLat,
          dropoffLng,
        });
        // Re-map the optimised id sequence back to the rich leg rows.
        const remainingById = new Map(remaining.map((r) => [r.orderId, r]));
        const orderedRemaining = optimised
          .map((p) => remainingById.get(p.id))
          .filter((x): x is (typeof remaining)[number] => !!x)
          // Drop the lat/lng helper fields before returning to the client.
          .map(({ lat: _lat, lng: _lng, ...rest }) => {
            void _lat; void _lng;
            return rest;
          });
        legs.length = 0;
        legs.push(...pickedUp, ...orderedRemaining);
      }

      return sendSuccess(res, {
        id: group.id,
        status: group.status,
        total: group.total,
        paymentMethod: group.paymentMethod,
        recipientName: group.recipientName,
        recipientPhone: group.recipientPhone,
        // Coords + label only — no street name (PII).
        deliveryAddress: group.deliveryAddress
          ? {
              lat: group.deliveryAddress.lat,
              lng: group.deliveryAddress.lng,
              label: group.deliveryAddress.label,
              city: group.deliveryAddress.city,
              pincode: group.deliveryAddress.pincode,
            }
          : null,
        pickupLegs: legs,
      });
    } catch (err) {
      console.error('[Drivers] order-group error:', err);
      return sendError(res, 'Failed to fetch order group', 500);
    }
  },
);

// ─── PUT /orders/:orderId/accept ──────────────────────────────────────────────

router.put(
  '/orders/:orderId/accept',
  authenticate,
  authorize('DRIVER'),
  requireApproved,
  async (req: Request, res: Response) => {
    try {
      const driver = await getDriverByUser(req.user!.id);
      if (!driver) return sendError(res, 'Driver profile not found', 404);

      const order = await prisma.order.findUnique({ where: { id: req.params['orderId'] } });
      if (!order) return sendError(res, 'Order not found', 404);

      if (order.driverId !== driver.id) return sendError(res, 'This order was not assigned to you', 403);

      if (order.status !== 'DRIVER_ASSIGNED') {
        return sendError(res, `Cannot accept order with status ${order.status}`, 400);
      }

      const updated = await prisma.order.update({
        where: { id: order.id },
        data: { status: 'DRIVER_ASSIGNED' }, // status stays but driverAssignedAt is confirmed
      });

      // Multi-store fan-out: if this order is part of a group, the SAME
      // driver carries every leg (one delivery for the whole basket).
      // Update siblings + the parent group so the driver app sees the
      // full pickup list and the customer rollup shows one driver.
      const { assignDriverToGroup, rollUpGroupStatus } = await import(
        '../services/order-group.service'
      );
      await assignDriverToGroup(prisma, order.id, driver.id);
      if (order.orderGroupId) {
        await rollUpGroupStatus(prisma, order.orderGroupId);
      }

      await broadcastOrderStatus(order.id, 'DRIVER_ASSIGNED', { driverId: driver.id });
      await sendNotification(
        order.customerId,
        'Driver On the Way',
        'Your driver has accepted the order and is heading to the store.',
        { orderId: order.id },
      );

      return sendSuccess(res, updated, 'Order accepted');
    } catch (err) {
      console.error('[Drivers] order accept error:', err);
      return sendError(res, 'Failed to accept order', 500);
    }
  },
);

// ─── PUT /orders/:orderId/reject ──────────────────────────────────────────────

router.put(
  '/orders/:orderId/reject',
  authenticate,
  authorize('DRIVER'),
  requireApproved,
  async (req: Request, res: Response) => {
    try {
      const driver = await getDriverByUser(req.user!.id);
      if (!driver) return sendError(res, 'Driver profile not found', 404);

      const order = await prisma.order.findUnique({ where: { id: req.params['orderId'] } });
      if (!order) return sendError(res, 'Order not found', 404);

      if (order.driverId !== driver.id) return sendError(res, 'This order was not assigned to you', 403);

      // Reset driver assignment and trigger next driver
      await prisma.order.update({
        where: { id: order.id },
        data: { driverId: null, status: 'STORE_ACCEPTED', driverAssignedAt: null },
      });

      // Assign next available driver, excluding this one
      assignDriverForOrder(order.id, [driver.id]).catch(console.error);

      return sendSuccess(res, null, 'Order rejected. Finding another driver.');
    } catch (err) {
      console.error('[Drivers] order reject error:', err);
      return sendError(res, 'Failed to reject order', 500);
    }
  },
);

// ─── PUT /orders/:orderId/pickup ──────────────────────────────────────────────

router.put(
  '/orders/:orderId/pickup',
  authenticate,
  authorize('DRIVER'),
  requireApproved,
  async (req: Request, res: Response) => {
    try {
      const driver = await getDriverByUser(req.user!.id);
      if (!driver) return sendError(res, 'Driver profile not found', 404);

      const order = await prisma.order.findUnique({ where: { id: req.params['orderId'] } });
      if (!order) return sendError(res, 'Order not found', 404);

      if (order.driverId !== driver.id) return sendError(res, 'Unauthorized', 403);

      if (order.status !== 'DRIVER_ASSIGNED') {
        return sendError(res, `Cannot confirm pickup for order with status ${order.status}`, 400);
      }

      const updated = await prisma.order.update({
        where: { id: order.id },
        data: { status: 'PICKED_UP', pickedUpAt: new Date() },
      });

      // Multi-store: rolling the group up keeps the customer's
      // "X/Y pickups done" indicator in sync, and lets the customer-
      // facing OrderGroup.status only flip to PICKED_UP once EVERY
      // leg has been picked up (rollUpGroupStatus encodes this).
      if (order.orderGroupId) {
        const { rollUpGroupStatus } = await import('../services/order-group.service');
        await rollUpGroupStatus(prisma, order.orderGroupId);
      }

      await broadcastOrderStatus(order.id, 'PICKED_UP', { dropoffOtp: order.dropoffOtp });
      await sendNotification(
        order.customerId,
        'Order Picked Up',
        'Your order has been picked up and is on the way!',
        { orderId: order.id },
      );

      return sendSuccess(res, updated, 'Pickup confirmed');
    } catch (err) {
      console.error('[Drivers] pickup error:', err);
      return sendError(res, 'Failed to confirm pickup', 500);
    }
  },
);

// ─── PUT /orders/:orderId/deliver ─────────────────────────────────────────────

router.put(
  '/orders/:orderId/deliver',
  authenticate,
  authorize('DRIVER'),
  requireApproved,
  async (req: Request, res: Response) => {
    try {
      const driver = await getDriverByUser(req.user!.id);
      if (!driver) return sendError(res, 'Driver profile not found', 404);

      const order = await prisma.order.findUnique({ where: { id: req.params['orderId'] } });
      if (!order) return sendError(res, 'Order not found', 404);

      if (order.driverId !== driver.id) return sendError(res, 'Unauthorized', 403);

      if (order.status !== 'PICKED_UP') {
        return sendError(res, `Cannot confirm delivery for order with status ${order.status}`, 400);
      }

      // Privacy verification: driver must enter the 4-digit dropoffOtp shown
      // in the customer's app. This avoids exposing customer phone to driver.
      const submittedOtp = (req.body?.dropoffOtp as string | undefined)?.trim();
      if (order.dropoffOtp) {
        if (!submittedOtp) {
          return sendError(res, 'Dropoff OTP required to confirm delivery', 400);
        }
        if (submittedOtp !== order.dropoffOtp) {
          return sendError(res, 'Incorrect dropoff OTP', 400);
        }
      }

      // Delivery fee goes to driver earnings
      const driverEarning = order.deliveryFee;

      const updated = await prisma.$transaction(async (tx) => {
        const deliveredOrder = await tx.order.update({
          where: { id: order.id },
          data: { status: 'DELIVERED', deliveredAt: new Date(), paymentStatus: order.paymentMethod === 'CASH_ON_DELIVERY' ? 'PAID' : 'PENDING' },
        });

        await tx.driver.update({
          where: { id: driver.id },
          data: { totalEarnings: { increment: driverEarning } },
        });

        return deliveredOrder;
      });

      await broadcastOrderStatus(order.id, 'DELIVERED');
      await sendNotification(
        order.customerId,
        'Order Delivered',
        'Your order has been delivered. Enjoy!',
        { orderId: order.id },
      );

      // Multi-store rollup: this child is done; if every sibling is
      // DELIVERED too, OrderGroup.status flips to DELIVERED. (Single
      // delivery event for the whole basket — the driver only does one
      // physical handoff, but the per-leg orders are marked delivered
      // independently as the driver works through the dropoff sequence.
      // Today's UI does the whole basket at once; future "leave some
      // here, deliver rest later" can use this rollup as-is.)
      if (order.orderGroupId) {
        const { rollUpGroupStatus } = await import('../services/order-group.service');
        await rollUpGroupStatus(prisma, order.orderGroupId);
      }

      // Generate the GST invoice in the background — don't block the
      // delivery-confirm response on PDF I/O. The customer can download
      // it from the order detail page; if generation fails it'll retry
      // on the first download attempt.
      generateInvoiceForOrder(order.id).catch((err) => {
        console.warn('[Drivers] invoice generation failed for', order.id, err);
      });

      return sendSuccess(res, updated, 'Delivery confirmed');
    } catch (err) {
      console.error('[Drivers] deliver error:', err);
      return sendError(res, 'Failed to confirm delivery', 500);
    }
  },
);

// ─── GET /me/zones — driver lists their serving zones ──────────────────────
// Returns the zones the driver has opted into. Empty array = no zone
// filter (matching engine treats them as serving the whole city).
router.get('/me/zones', authenticate, authorize('DRIVER'), async (req: Request, res: Response) => {
  try {
    const driver = await prisma.driver.findUnique({
      where: { userId: req.user!.id },
      select: { id: true },
    });
    if (!driver) return sendError(res, 'Driver profile not found', 404);

    const rows = await prisma.driverZone.findMany({
      where: { driverId: driver.id },
      include: { zone: true },
      orderBy: { createdAt: 'asc' },
    });
    return sendSuccess(res, rows.map((r) => r.zone));
  } catch (err) {
    console.error('[Drivers] list zones error:', err);
    return sendError(res, 'Failed to fetch zones', 500);
  }
});

const updateMyZonesSchema = z.object({
  zoneIds: z.array(z.string().min(1)).max(50),
});

// ─── PUT /me/zones — driver replaces their full zone list ──────────────────
// Atomic: delete all existing rows for this driver, then insert the new set.
// Validates that every zoneId exists + isActive so a driver can't pin to a
// disabled or invented zone.
router.put(
  '/me/zones',
  authenticate,
  authorize('DRIVER'),
  validate(updateMyZonesSchema),
  async (req: Request, res: Response) => {
    try {
      const driver = await prisma.driver.findUnique({
        where: { userId: req.user!.id },
        select: { id: true },
      });
      if (!driver) return sendError(res, 'Driver profile not found', 404);

      const { zoneIds } = req.body as z.infer<typeof updateMyZonesSchema>;
      const unique = [...new Set(zoneIds)];

      if (unique.length > 0) {
        const found = await prisma.zone.findMany({
          where: { id: { in: unique }, isActive: true },
          select: { id: true },
        });
        if (found.length !== unique.length) {
          return sendError(res, 'One or more zones are invalid or inactive', 400);
        }
      }

      await prisma.$transaction([
        prisma.driverZone.deleteMany({ where: { driverId: driver.id } }),
        ...(unique.length > 0
          ? [
              prisma.driverZone.createMany({
                data: unique.map((zoneId) => ({ driverId: driver.id, zoneId })),
              }),
            ]
          : []),
      ]);

      const updated = await prisma.driverZone.findMany({
        where: { driverId: driver.id },
        include: { zone: true },
        orderBy: { createdAt: 'asc' },
      });
      return sendSuccess(res, updated.map((r) => r.zone), 'Zones updated');
    } catch (err) {
      console.error('[Drivers] update zones error:', err);
      return sendError(res, 'Failed to update zones', 500);
    }
  },
);

export default router;
