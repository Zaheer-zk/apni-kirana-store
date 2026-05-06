import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { VehicleType } from '@prisma/client';
import { prisma } from '../config/prisma';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { sendSuccess, sendError } from '../utils/response';
import { assignDriverForOrder } from '../services/driver.service';
import { sendNotification } from '../services/notification.service';

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
  validate(registerDriverSchema),
  async (req: Request, res: Response) => {
    try {
      const existing = await getDriverByUser(req.user!.id);
      if (existing) return sendError(res, 'You are already registered as a driver', 409);

      const driver = await prisma.$transaction(async (tx) => {
        const created = await tx.driver.create({
          data: { ...req.body, userId: req.user!.id, status: 'PENDING_APPROVAL' },
        });
        await tx.user.update({
          where: { id: req.user!.id },
          data: { role: 'DRIVER' },
        });
        return created;
      });

      return sendSuccess(res, driver, 'Driver registered. Awaiting approval.', 201);
    } catch (err) {
      console.error('[Drivers] register error:', err);
      return sendError(res, 'Failed to register driver', 500);
    }
  },
);

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

// ─── PUT /orders/:orderId/accept ──────────────────────────────────────────────

router.put(
  '/orders/:orderId/accept',
  authenticate,
  authorize('DRIVER'),
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

      await sendNotification(
        order.customerId,
        'Order Delivered',
        'Your order has been delivered. Enjoy!',
        { orderId: order.id },
      );

      return sendSuccess(res, updated, 'Delivery confirmed');
    } catch (err) {
      console.error('[Drivers] deliver error:', err);
      return sendError(res, 'Failed to confirm delivery', 500);
    }
  },
);

export default router;
