import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { Prisma, UserRole, StoreCategory, VehicleType } from '@prisma/client';
import { prisma } from '../config/prisma';
import { config } from '../config/env';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { sendSuccess, sendError } from '../utils/response';
import { validate } from '../middleware/validate.middleware';
import { broadcastOrderStatus } from '../services/order-events.service';
import { haversineDistance } from '../utils/geo';
import { notify } from '../services/notification.service';
import { getSettings, updateSettings } from '../services/settings.service';
import { generateResetToken, generateTempPassword } from '../utils/token';
import { sendPasswordResetEmail, sendAccountApprovedEmail } from '../services/email.service';
import { writeAudit } from '../utils/audit';
import { creditWallet, getWalletWithTxns } from '../services/wallet.service';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const BCRYPT_ROUNDS = 10;
const APP_ROLES = ['CUSTOMER', 'STORE_OWNER', 'DRIVER'] as const;

const router = Router();

// All admin routes require ADMIN role
router.use(authenticate, authorize('ADMIN'));

// ─── GET /users ───────────────────────────────────────────────────────────────

const USER_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  username: true,
  role: true,
  roles: true,
  isActive: true,
  phoneVerified: true,
  mustChangePassword: true,
  isSuperAdmin: true,
  createdAt: true,
} as const;

router.get('/users', async (req: Request, res: Response) => {
  try {
    const search = req.query['search'] as string | undefined;
    const role = req.query['role'] as string | undefined;
    const page = Math.max(1, parseInt((req.query['page'] as string) || '1', 10));
    const limit = Math.min(100, parseInt((req.query['limit'] as string) || '20', 10));
    const skip = (page - 1) * limit;

    const conditions: Record<string, unknown>[] = [];
    if (search) {
      conditions.push({
        OR: [
          { phone: { contains: search, mode: 'insensitive' as const } },
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { username: { contains: search, mode: 'insensitive' as const } },
        ],
      });
    }
    // Filter by a role the account holds (matches multi-role accounts).
    if (role && (APP_ROLES as readonly string[]).concat('ADMIN').includes(role)) {
      conditions.push({ roles: { has: role as UserRole } });
    }
    const where = conditions.length ? { AND: conditions } : {};

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        select: USER_SELECT,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    return sendSuccess(res, { users, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[Admin] get users error:', err);
    return sendError(res, 'Failed to fetch users', 500);
  }
});

// ─── GET /users/:id ───────────────────────────────────────────────────────────

router.get('/users/:id', async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params['id'] },
      select: { ...USER_SELECT, store: { select: { id: true, name: true, status: true } }, driver: { select: { id: true, status: true } } },
    });
    if (!user) return sendError(res, 'User not found', 404);
    return sendSuccess(res, user);
  } catch (err) {
    console.error('[Admin] get user error:', err);
    return sendError(res, 'Failed to fetch user', 500);
  }
});

// ─── POST /users ──────────────────────────────────────────────────────────────
// Admin creates an account. It gets a temporary password (returned once, in
// this response) and `mustChangePassword` — the user must set their own on
// first login. The account is phone-verified up front so the user can log in
// with the temp password without an OTP step.

const createUserSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  phone: z.string().regex(/^\d{10}$/, 'Phone must be exactly 10 digits'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(30)
    .regex(/^[a-zA-Z0-9_.]+$/, 'Username may only contain letters, numbers, "_" and "."'),
  // ADMIN is allowed here too, but only the super admin may use it (enforced
  // in the handler, not the schema).
  role: z.enum(['CUSTOMER', 'STORE_OWNER', 'DRIVER', 'ADMIN']),
});

router.post('/users', validate(createUserSchema), async (req: Request, res: Response) => {
  try {
    const { name, phone, email, username, role } = req.body as {
      name: string;
      phone: string;
      email: string;
      username: string;
      role: 'CUSTOMER' | 'STORE_OWNER' | 'DRIVER' | 'ADMIN';
    };

    const roleLabel = role.replace('_', ' ').toLowerCase();

    // Creating an ADMIN is reserved for the super admin.
    if (role === 'ADMIN') {
      const me = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { isSuperAdmin: true },
      });
      if (!me?.isSuperAdmin) {
        return sendError(res, 'Only the super admin can create admin accounts.', 403);
      }
    }

    // Per-role accounts: each (phone, role) is its own row. Block duplicates
    // of THIS exact role on THIS phone; a different role on the same phone is
    // a fresh row.
    const existing = await prisma.user.findUnique({
      where: { phone_role: { phone, role } },
    });
    if (existing) {
      return sendError(res, `This number is already registered as a ${roleLabel}.`, 409);
    }

    // Email + username are unique per (X, role) — the same value may exist
    // on a different role's row. Only block when the conflict is on THIS
    // role.
    const [emailOwner, usernameOwner] = await Promise.all([
      prisma.user.findUnique({
        where: { email_role: { email, role } },
        select: { id: true },
      }),
      prisma.user.findUnique({
        where: { username_role: { username, role } },
        select: { id: true },
      }),
    ]);
    if (emailOwner) {
      return sendError(res, `This email is already used by a ${roleLabel} account.`, 409);
    }
    if (usernameOwner) {
      return sendError(res, `This username is already taken for ${roleLabel} accounts.`, 409);
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        name,
        phone,
        email,
        username,
        passwordHash,
        role,
        roles: [role],
        isActive: true,
        phoneVerified: true,
        mustChangePassword: true,
      },
      select: USER_SELECT,
    });

    await prisma.auditLog
      .create({
        data: {
          actorId: req.user!.id,
          action: 'USER_CREATE',
          targetType: 'User',
          targetId: user.id,
          after: { role, phone, email, username },
        },
      })
      .catch(() => undefined);

    return sendSuccess(
      res,
      { user, tempPassword },
      'User created. Share the temporary password — they must change it on first login.',
      201,
    );
  } catch (err) {
    console.error('[Admin] create user error:', err);
    return sendError(res, 'Failed to create user', 500);
  }
});

// ─── PUT /users/:id ───────────────────────────────────────────────────────────
// Edit any user's profile. `roles` lets an admin grant/revoke roles.

const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    phone: z.string().regex(/^\d{10}$/, 'Phone must be exactly 10 digits'),
    email: z.string().trim().toLowerCase().email('Enter a valid email address'),
    isActive: z.boolean(),
  })
  .partial();
// roles aren't editable here — each role is its own User row now.

router.put('/users/:id', validate(updateUserSchema), async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    const body = req.body as Partial<{
      name: string;
      phone: string;
      email: string;
      isActive: boolean;
    }>;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return sendError(res, 'User not found', 404);
    // Only the super admin may edit admin accounts.
    if (user.role === 'ADMIN') {
      const me = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { isSuperAdmin: true },
      });
      if (!me?.isSuperAdmin) {
        return sendError(res, 'Only the super admin can manage admin accounts.', 403);
      }
    }
    // The super admin account itself can't be deactivated.
    if (body.isActive === false && user.isSuperAdmin) {
      return sendError(res, 'The super admin account cannot be deactivated.', 400);
    }
    if (body.isActive === false && id === req.user!.id) {
      return sendError(res, 'You cannot deactivate your own account.', 400);
    }

    // Uniqueness checks for changed phone / email. Phone is no longer unique
    // on its own — check the (phone, role) composite.
    if (body.phone && body.phone !== user.phone) {
      const owner = await prisma.user.findUnique({
        where: { phone_role: { phone: body.phone, role: user.role } },
        select: { id: true },
      });
      if (owner) {
        return sendError(res, `This mobile number is already used by another ${user.role.replace('_', ' ').toLowerCase()} account.`, 409);
      }
    }
    if (body.email && body.email !== user.email) {
      const owner = await prisma.user.findUnique({
        where: { email_role: { email: body.email, role: user.role } },
        select: { id: true },
      });
      if (owner) {
        return sendError(
          res,
          `This email is already used by another ${user.role.replace('_', ' ').toLowerCase()} account.`,
          409,
        );
      }
    }

    const data: Prisma.UserUpdateInput = {};
    if (body.name !== undefined) data['name'] = body.name;
    if (body.phone !== undefined) data['phone'] = body.phone;
    if (body.email !== undefined) data['email'] = body.email;
    if (body.isActive !== undefined) data['isActive'] = body.isActive;

    const updated = await prisma.user.update({ where: { id }, data, select: USER_SELECT });

    await prisma.auditLog
      .create({
        data: {
          actorId: req.user!.id,
          action: 'USER_UPDATE',
          targetType: 'User',
          targetId: id,
          before: { name: user.name, phone: user.phone, email: user.email, isActive: user.isActive, roles: user.roles },
          after: data as Prisma.InputJsonObject,
        },
      })
      .catch(() => undefined);

    return sendSuccess(res, updated, 'User updated successfully');
  } catch (err) {
    console.error('[Admin] update user error:', err);
    return sendError(res, 'Failed to update user', 500);
  }
});

// ─── POST /users/:id/reset-credentials ────────────────────────────────────────
// Admin-triggered password reset — emails the user a reset link (same flow as
// the self-service "forgot password").

router.post('/users/:id/reset-credentials', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return sendError(res, 'User not found', 404);
    if (!user.email) {
      return sendError(res, 'This user has no email address on file to send a reset link to.', 400);
    }

    await prisma.passwordResetToken.deleteMany({ where: { userId: id, usedAt: null } });
    const { raw, hash } = generateResetToken();
    await prisma.passwordResetToken.create({
      data: { userId: id, tokenHash: hash, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
    });
    const link = `${config.webAppUrl}/reset-password?token=${raw}`;
    await sendPasswordResetEmail(user.email, user.name, link);

    await prisma.auditLog
      .create({
        data: {
          actorId: req.user!.id,
          action: 'USER_RESET_CREDENTIALS',
          targetType: 'User',
          targetId: id,
        },
      })
      .catch(() => undefined);

    return sendSuccess(res, null, `A password-reset link has been emailed to ${user.email}.`);
  } catch (err) {
    console.error('[Admin] reset credentials error:', err);
    return sendError(res, 'Failed to send the reset link', 500);
  }
});

// ─── PUT /users/:id/suspend ───────────────────────────────────────────────────

router.put('/users/:id/suspend', async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params['id'] } });
    if (!user) return sendError(res, 'User not found', 404);

    // The super admin can never be suspended.
    if (user.isSuperAdmin) {
      return sendError(res, 'The super admin account cannot be suspended.', 403);
    }
    // Only the super admin may suspend/reactivate another admin.
    if (user.role === 'ADMIN') {
      const me = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { isSuperAdmin: true },
      });
      if (!me?.isSuperAdmin) {
        return sendError(res, 'Only the super admin can suspend admin accounts.', 403);
      }
    }

    const updated = await prisma.user.update({
      where: { id: req.params['id'] },
      data: { isActive: !user.isActive },
      select: { id: true, isActive: true },
    });

    await writeAudit({
      actorId: req.user!.id,
      action: updated.isActive ? 'user.reactivate' : 'user.suspend',
      entity: 'User',
      entityId: updated.id,
      before: { isActive: user.isActive },
      after: { isActive: updated.isActive },
      ip: req.ip ?? null,
    });

    return sendSuccess(
      res,
      updated,
      `User ${updated.isActive ? 'activated' : 'suspended'} successfully`,
    );
  } catch (err) {
    console.error('[Admin] suspend user error:', err);
    return sendError(res, 'Failed to update user status', 500);
  }
});

// ─── GET /stores ──────────────────────────────────────────────────────────────
// Supports ?status=PENDING_APPROVAL|ACTIVE|SUSPENDED and ?search=name

router.get('/stores', async (req: Request, res: Response) => {
  try {
    const status = req.query['status'] as string | undefined;
    const search = req.query['search'] as string | undefined;
    const page = Math.max(1, parseInt((req.query['page'] as string) || '1', 10));
    const limit = Math.min(100, parseInt((req.query['limit'] as string) || '50', 10));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (status) where['status'] = status;
    if (search) where['name'] = { contains: search, mode: 'insensitive' };

    const [stores, total] = await prisma.$transaction([
      prisma.store.findMany({
        where,
        include: {
          owner: { select: { id: true, name: true, phone: true, email: true, isActive: true, role: true } },
          _count: { select: { items: true, orders: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.store.count({ where }),
    ]);

    return sendSuccess(res, { stores, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[Admin] get stores error:', err);
    return sendError(res, 'Failed to fetch stores', 500);
  }
});

// ─── GET /stores/pending ──────────────────────────────────────────────────────
// Kept for backwards compatibility

router.get('/stores/pending', async (_req: Request, res: Response) => {
  try {
    const stores = await prisma.store.findMany({
      where: { status: 'PENDING_APPROVAL' },
      include: { owner: { select: { id: true, name: true, phone: true, email: true, isActive: true, role: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return sendSuccess(res, stores);
  } catch (err) {
    console.error('[Admin] pending stores error:', err);
    return sendError(res, 'Failed to fetch pending stores', 500);
  }
});

// ─── GET /stores/:id ──────────────────────────────────────────────────────────
// Full store detail: store + owner + inventory + recent orders + lifetime
// totals. Registered after /stores/pending so it doesn't shadow it.

router.get('/stores/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    const store = await prisma.store.findUnique({
      where: { id },
      include: {
        owner: { select: { name: true, phone: true, email: true } },
        items: { include: { catalogItem: true }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!store) return sendError(res, 'Store not found', 404);

    const [orderCount, revenue, recentOrders] = await Promise.all([
      prisma.order.count({ where: { storeId: id } }),
      prisma.order.aggregate({
        where: { storeId: id, status: 'DELIVERED' },
        _sum: { total: true },
      }),
      prisma.order.findMany({
        where: { storeId: id },
        include: { customer: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const { owner, items, ...storeFields } = store;
    return sendSuccess(res, {
      store: {
        ...storeFields,
        ownerName: owner?.name ?? '',
        ownerPhone: owner?.phone ?? '',
        totalOrders: orderCount,
        totalRevenue: revenue._sum.total ?? 0,
      },
      items: items.map((it) => ({
        id: it.id,
        name: it.catalogItem.name,
        category: it.catalogItem.category,
        unit: it.catalogItem.defaultUnit,
        imageUrl: it.catalogItem.imageUrl,
        price: it.price,
        stockQty: it.stockQty,
        isAvailable: it.isAvailable,
      })),
      recentOrders: recentOrders.map((o) => ({
        ...o,
        customerName: o.customer?.name ?? 'Customer',
      })),
    });
  } catch (err) {
    console.error('[Admin] get store detail error:', err);
    return sendError(res, 'Failed to fetch store', 500);
  }
});

// ─── PUT /stores/:id/approve ──────────────────────────────────────────────────

router.put('/stores/:id/approve', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    const store = await prisma.store.findUnique({
      where: { id },
      include: { owner: { select: { id: true, name: true, email: true } } },
    });
    if (!store) return sendError(res, 'Store not found', 404);

    const updated = await prisma.store.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });

    await writeAudit({
      actorId: req.user!.id,
      action: 'store.approve',
      entity: 'Store',
      entityId: updated.id,
      before: { status: store.status },
      after: { status: updated.status },
      ip: req.ip ?? null,
    });

    // Notify the owner: email if they have one + in-app push/web push.
    if (store.owner.email) {
      sendAccountApprovedEmail({
        to: store.owner.email,
        name: store.owner.name,
        kind: 'STORE',
        loginUrl: `${config.webAppUrl}/login`,
      }).catch((err) => console.warn('[Admin] approval email failed:', err));
    }
    notify('STORE_APPROVED', store.owner.id).catch(() => undefined);

    return sendSuccess(res, updated, 'Store approved successfully');
  } catch (err) {
    console.error('[Admin] approve store error:', err);
    return sendError(res, 'Failed to approve store', 500);
  }
});

// ─── PUT /stores/:id/suspend ──────────────────────────────────────────────────

router.put('/stores/:id/suspend', async (req: Request, res: Response) => {
  try {
    const store = await prisma.store.findUnique({ where: { id: req.params['id'] } });
    if (!store) return sendError(res, 'Store not found', 404);

    const updated = await prisma.store.update({
      where: { id: req.params['id'] },
      data: { status: 'SUSPENDED', isOpen: false },
    });

    await writeAudit({
      actorId: req.user!.id,
      action: 'store.suspend',
      entity: 'Store',
      entityId: updated.id,
      before: { status: store.status, isOpen: store.isOpen },
      after: { status: updated.status, isOpen: updated.isOpen },
      ip: req.ip ?? null,
    });

    return sendSuccess(res, updated, 'Store suspended successfully');
  } catch (err) {
    console.error('[Admin] suspend store error:', err);
    return sendError(res, 'Failed to suspend store', 500);
  }
});

// ─── PUT /stores/:id/wholesaler ───────────────────────────────────────────────
// Flag (or unflag) a store as a wholesaler. Wholesalers are excluded from
// customer matching and become restock-order targets for retail store owners.

router.put('/stores/:id/wholesaler', async (req: Request, res: Response) => {
  try {
    const isWholesaler = Boolean((req.body as { isWholesaler?: unknown }).isWholesaler);

    const store = await prisma.store.findUnique({ where: { id: req.params['id'] } });
    if (!store) return sendError(res, 'Store not found', 404);

    const updated = await prisma.store.update({
      where: { id: req.params['id'] },
      data: { isWholesaler },
    });

    await writeAudit({
      actorId: req.user!.id,
      action: isWholesaler ? 'store.flag-wholesaler' : 'store.unflag-wholesaler',
      entity: 'Store',
      entityId: updated.id,
      before: { isWholesaler: store.isWholesaler },
      after: { isWholesaler: updated.isWholesaler },
      ip: req.ip ?? null,
    });

    return sendSuccess(
      res,
      updated,
      isWholesaler ? 'Store marked as wholesaler' : 'Store unmarked as wholesaler',
    );
  } catch (err) {
    console.error('[Admin] toggle wholesaler error:', err);
    return sendError(res, 'Failed to update wholesaler flag', 500);
  }
});

// ─── PUT /stores/:id/preferred ────────────────────────────────────────────────
// Flag (or unflag) a store as "preferred". Preferred stores get a scoring boost
// in the matching engine so they are favoured when assigning orders.

router.put('/stores/:id/preferred', async (req: Request, res: Response) => {
  try {
    const isPreferred = Boolean((req.body as { isPreferred?: unknown }).isPreferred);

    const store = await prisma.store.findUnique({ where: { id: req.params['id'] } });
    if (!store) return sendError(res, 'Store not found', 404);

    const updated = await prisma.store.update({
      where: { id: req.params['id'] },
      data: { isPreferred },
    });

    await writeAudit({
      actorId: req.user!.id,
      action: isPreferred ? 'store.flag-preferred' : 'store.unflag-preferred',
      entity: 'Store',
      entityId: updated.id,
      before: { isPreferred: store.isPreferred },
      after: { isPreferred: updated.isPreferred },
      ip: req.ip ?? null,
    });

    return sendSuccess(
      res,
      updated,
      isPreferred ? 'Store marked as preferred' : 'Store unmarked as preferred',
    );
  } catch (err) {
    console.error('[Admin] toggle preferred error:', err);
    return sendError(res, 'Failed to update preferred flag', 500);
  }
});

// ─── PUT /stores/:id ──────────────────────────────────────────────────────────
// Admin edits a store's details. Status / open / wholesaler / preferred have
// their own dedicated endpoints.

const adminUpdateStoreSchema = z
  .object({
    name: z.string().min(2).max(100),
    description: z.string().max(500),
    category: z.nativeEnum(StoreCategory),
    lat: z.number(),
    lng: z.number(),
    street: z.string().min(2),
    city: z.string().min(2),
    state: z.string().min(2),
    pincode: z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits'),
    openTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
    closeTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
  })
  .partial();

router.put('/stores/:id', validate(adminUpdateStoreSchema), async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    const store = await prisma.store.findUnique({ where: { id } });
    if (!store) return sendError(res, 'Store not found', 404);

    const updated = await prisma.store.update({ where: { id }, data: req.body });

    await prisma.auditLog
      .create({
        data: {
          actorId: req.user!.id,
          action: 'STORE_UPDATE',
          targetType: 'Store',
          targetId: id,
          after: req.body as Prisma.InputJsonObject,
        },
      })
      .catch(() => undefined);

    return sendSuccess(res, updated, 'Store updated successfully');
  } catch (err) {
    console.error('[Admin] update store error:', err);
    return sendError(res, 'Failed to update store', 500);
  }
});

// ─── GET /drivers ─────────────────────────────────────────────────────────────
// Supports ?status=PENDING_APPROVAL|ACTIVE|ONLINE|OFFLINE|SUSPENDED

router.get('/drivers', async (req: Request, res: Response) => {
  try {
    const status = req.query['status'] as string | undefined;
    const page = Math.max(1, parseInt((req.query['page'] as string) || '1', 10));
    const limit = Math.min(100, parseInt((req.query['limit'] as string) || '50', 10));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (status === 'ACTIVE') {
      // "Active" in the admin UI = approved-and-not-suspended. The DB enum
      // splits this into OFFLINE (approved, not currently online) and ONLINE
      // (toggled online and accepting deliveries).
      where['status'] = { in: ['OFFLINE', 'ONLINE'] };
    } else if (status) {
      where['status'] = status;
    }

    const [drivers, total] = await prisma.$transaction([
      prisma.driver.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, phone: true, email: true, isActive: true, role: true } },
          _count: { select: { orders: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.driver.count({ where }),
    ]);

    return sendSuccess(res, { drivers, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[Admin] get drivers error:', err);
    return sendError(res, 'Failed to fetch drivers', 500);
  }
});

// ─── GET /drivers/pending ─────────────────────────────────────────────────────
// Kept for backwards compatibility

router.get('/drivers/pending', async (_req: Request, res: Response) => {
  try {
    const drivers = await prisma.driver.findMany({
      where: { status: 'PENDING_APPROVAL' },
      include: { user: { select: { id: true, name: true, phone: true, email: true, isActive: true, role: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return sendSuccess(res, drivers);
  } catch (err) {
    console.error('[Admin] pending drivers error:', err);
    return sendError(res, 'Failed to fetch pending drivers', 500);
  }
});

// ─── PUT /drivers/:id/suspend ─────────────────────────────────────────────────

router.put('/drivers/:id/suspend', async (req: Request, res: Response) => {
  try {
    const driver = await prisma.driver.findUnique({ where: { id: req.params['id'] } });
    if (!driver) return sendError(res, 'Driver not found', 404);

    const newStatus = driver.status === 'SUSPENDED' ? 'OFFLINE' : 'SUSPENDED';
    const updated = await prisma.driver.update({
      where: { id: req.params['id'] },
      data: { status: newStatus },
    });

    return sendSuccess(res, updated, `Driver ${newStatus === 'SUSPENDED' ? 'suspended' : 'reactivated'}`);
  } catch (err) {
    console.error('[Admin] suspend driver error:', err);
    return sendError(res, 'Failed to update driver status', 500);
  }
});

// ─── PUT /drivers/:id/approve ─────────────────────────────────────────────────

router.put('/drivers/:id/approve', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    const driver = await prisma.driver.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!driver) return sendError(res, 'Driver not found', 404);

    const updated = await prisma.driver.update({
      where: { id },
      data: { status: 'OFFLINE' }, // Approved but starts as OFFLINE
    });

    // Notify the driver: email + in-app push.
    if (driver.user.email) {
      sendAccountApprovedEmail({
        to: driver.user.email,
        name: driver.user.name,
        kind: 'DRIVER',
        loginUrl: `${config.webAppUrl}/login`,
      }).catch((err) => console.warn('[Admin] approval email failed:', err));
    }
    notify('DRIVER_APPROVED', driver.user.id).catch(() => undefined);

    return sendSuccess(res, updated, 'Driver approved successfully');
  } catch (err) {
    console.error('[Admin] approve driver error:', err);
    return sendError(res, 'Failed to approve driver', 500);
  }
});

// ─── PUT /drivers/:id ─────────────────────────────────────────────────────────
// Admin edits a driver's vehicle / licence details. Status has its own
// dedicated approve/suspend endpoints.

const adminUpdateDriverSchema = z
  .object({
    vehicleType: z.nativeEnum(VehicleType),
    vehicleNumber: z.string().min(2).max(20),
    licenseNumber: z.string().min(4).max(30),
  })
  .partial();

router.put('/drivers/:id', validate(adminUpdateDriverSchema), async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    const driver = await prisma.driver.findUnique({ where: { id } });
    if (!driver) return sendError(res, 'Driver not found', 404);

    const updated = await prisma.driver.update({ where: { id }, data: req.body });

    await prisma.auditLog
      .create({
        data: {
          actorId: req.user!.id,
          action: 'DRIVER_UPDATE',
          targetType: 'Driver',
          targetId: id,
          after: req.body as Prisma.InputJsonObject,
        },
      })
      .catch(() => undefined);

    return sendSuccess(res, updated, 'Driver updated successfully');
  } catch (err) {
    console.error('[Admin] update driver error:', err);
    return sendError(res, 'Failed to update driver', 500);
  }
});

// ─── GET /orders ──────────────────────────────────────────────────────────────

router.get('/orders', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt((req.query['page'] as string) || '1', 10));
    const limit = Math.min(100, parseInt((req.query['limit'] as string) || '20', 10));
    const skip = (page - 1) * limit;
    const status = req.query['status'] as string | undefined;
    const storeId = req.query['storeId'] as string | undefined;
    const type = req.query['type'] as string | undefined;

    const where = {
      ...(status ? { status: status as never } : {}),
      ...(storeId ? { storeId } : {}),
      ...(type ? { orderType: type as never } : {}),
    };

    const [orders, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        include: {
          customer: { select: { name: true, phone: true, email: true } },
          store: { select: { name: true } },
          buyerStore: { select: { name: true } },
          driver: { include: { user: { select: { name: true } } } },
          _count: { select: { items: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.count({ where }),
    ]);

    return sendSuccess(res, { orders, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[Admin] get orders error:', err);
    return sendError(res, 'Failed to fetch orders', 500);
  }
});

// ─── GET /orders/:id — full detail (customer, store, driver, items, ratings) ─

router.get('/orders/:id', async (req: Request, res: Response) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params['id'] },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true, isActive: true, role: true } },
        store: { select: { id: true, name: true, ownerId: true, lat: true, lng: true, street: true, city: true } },
        driver: { include: { user: { select: { id: true, name: true, phone: true, email: true, isActive: true, role: true } } } },
        items: true,
        deliveryAddress: true,
        rating: true,
      },
    });
    if (!order) return sendError(res, 'Order not found', 404);
    return sendSuccess(res, order);
  } catch (err) {
    console.error('[Admin] get order detail error:', err);
    return sendError(res, 'Failed to fetch order', 500);
  }
});

// ─── GET /orders/:id/eligible-stores ────────────────────────────────────────
// Returns active stores that carry at least one of the items in the order,
// ranked by match% then distance from delivery address. Includes owner
// contact details so the admin can call the store before reassigning.

router.get('/orders/:id/eligible-stores', async (req: Request, res: Response) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params['id'] },
      include: { items: true, deliveryAddress: { select: { lat: true, lng: true } } },
    });
    if (!order) return sendError(res, 'Order not found', 404);

    const orderStoreItems = await prisma.storeItem.findMany({
      where: { id: { in: order.items.map((i) => i.itemId).filter((id): id is string => !!id) } },
      select: { catalogItemId: true },
    });
    const orderCatalogIds = orderStoreItems.map((si) => si.catalogItemId);
    const totalItems = new Set(orderCatalogIds).size;
    if (totalItems === 0) return sendSuccess(res, []);

    // Filter candidates by order type: customer orders must never be rescued
    // to a wholesaler, and restock orders must only consider wholesalers.
    // Without this an admin reassigning a stuck customer order could send it
    // to a B2B-only wholesaler (mirrors the matching.service.ts invariant).
    const isRestock = order.orderType === 'RESTOCK';
    const stores = await prisma.store.findMany({
      where: {
        status: 'ACTIVE',
        isWholesaler: isRestock,
        items: {
          some: {
            catalogItemId: { in: orderCatalogIds },
            isAvailable: true,
            stockQty: { gt: 0 },
          },
        },
      },
      include: {
        owner: { select: { id: true, name: true, phone: true, email: true, isActive: true, role: true } },
        items: {
          where: { catalogItemId: { in: orderCatalogIds }, isAvailable: true, stockQty: { gt: 0 } },
          select: { catalogItemId: true },
        },
      },
    });

    const { lat, lng } = order.deliveryAddress;
    const ranked = stores
      .map((s) => {
        const matchedItems = new Set(s.items.map((i) => i.catalogItemId)).size;
        return {
          id: s.id,
          name: s.name,
          isOpen: s.isOpen,
          rating: s.rating,
          openTime: s.openTime,
          closeTime: s.closeTime,
          street: s.street,
          city: s.city,
          owner: s.owner,
          distanceKm: Number(haversineDistance(lat, lng, s.lat, s.lng).toFixed(2)),
          matchedItems,
          totalItems,
          matchPercent: Math.round((matchedItems / totalItems) * 100),
        };
      })
      .sort((a, b) => b.matchPercent - a.matchPercent || a.distanceKm - b.distanceKm);

    return sendSuccess(res, ranked);
  } catch (err) {
    console.error('[Admin] eligible-stores error:', err);
    return sendError(res, 'Failed to fetch eligible stores', 500);
  }
});

// ─── GET /orders/:id/chats — all conversations on this order, read-only ─────
// Returns every Chat row for the order (could be 0–3: customer↔store,
// customer↔driver, store↔driver) with full message history and participant
// names. Used by admin for fraud / support investigation.

router.get('/orders/:id/chats', async (req: Request, res: Response) => {
  try {
    const orderId = req.params['id']!;
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true, role: true } },
        store: {
          select: {
            ownerId: true,
            owner: { select: { id: true, name: true, phone: true, email: true, role: true } },
          },
        },
        driver: {
          select: { user: { select: { id: true, name: true, phone: true, email: true, role: true } } },
        },
      },
    });
    if (!order) return sendError(res, 'Order not found', 404);

    // Build a userId → display info map so each chat can label its participants
    type Participant = { id: string; name: string | null; phone: string; role: string };
    const participants = new Map<string, Participant>();
    if (order.customer) participants.set(order.customer.id, { ...order.customer });
    if (order.store?.owner) participants.set(order.store.owner.id, { ...order.store.owner });
    if (order.driver?.user) participants.set(order.driver.user.id, { ...order.driver.user });

    const chats = await prisma.chat.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });

    const enriched = chats.map((c) => ({
      id: c.id,
      userA: participants.get(c.userAId) ?? { id: c.userAId, name: null, phone: '', role: '?' },
      userB: participants.get(c.userBId) ?? { id: c.userBId, name: null, phone: '', role: '?' },
      closedAt: c.closedAt,
      deletedAt: c.deletedAt,
      createdAt: c.createdAt,
      messageCount: c.messages.length,
      messages: c.messages,
    }));

    return sendSuccess(res, enriched);
  } catch (err) {
    console.error('[Admin] order chats error:', err);
    return sendError(res, 'Failed to fetch chats', 500);
  }
});

// ─── GET /orders/:id/eligible-drivers ───────────────────────────────────────
// Returns active drivers ranked by distance from the assigned store (or
// delivery address if no store yet). Includes user contact details.

router.get('/orders/:id/eligible-drivers', async (req: Request, res: Response) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params['id'] },
      include: {
        store: { select: { lat: true, lng: true } },
        deliveryAddress: { select: { lat: true, lng: true } },
      },
    });
    if (!order) return sendError(res, 'Order not found', 404);

    const origin = order.store ?? order.deliveryAddress;
    const drivers = await prisma.driver.findMany({
      where: {
        status: 'ONLINE',
        currentLat: { not: null },
        currentLng: { not: null },
      },
      include: { user: { select: { id: true, name: true, phone: true, email: true, isActive: true, role: true } } },
    });

    const ranked = drivers
      .map((d) => ({
        id: d.id,
        vehicleType: d.vehicleType,
        vehicleNumber: d.vehicleNumber,
        rating: d.rating,
        totalRatings: d.totalRatings,
        currentLat: d.currentLat,
        currentLng: d.currentLng,
        user: d.user,
        distanceKm:
          d.currentLat != null && d.currentLng != null
            ? Number(haversineDistance(origin.lat, origin.lng, d.currentLat, d.currentLng).toFixed(2))
            : null,
      }))
      .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));

    return sendSuccess(res, ranked);
  } catch (err) {
    console.error('[Admin] eligible-drivers error:', err);
    return sendError(res, 'Failed to fetch eligible drivers', 500);
  }
});

// ─── PUT /orders/:id/assign-store — admin manually assigns/changes the store ─

router.put('/orders/:id/assign-store', async (req: Request, res: Response) => {
  try {
    const orderId = req.params['id']!;
    const storeId = req.body?.storeId as string | undefined;
    if (!storeId) return sendError(res, 'storeId required', 400);

    const [order, store] = await Promise.all([
      prisma.order.findUnique({ where: { id: orderId } }),
      prisma.store.findUnique({ where: { id: storeId } }),
    ]);
    if (!order) return sendError(res, 'Order not found', 404);
    if (!store) return sendError(res, 'Store not found', 404);
    if (order.status === 'DELIVERED') {
      return sendError(res, 'Cannot reassign a delivered order', 400);
    }
    // Enforce the customer-vs-wholesaler boundary on manual reassignment:
    // a CUSTOMER order must never land on a wholesaler (B2B-only), and a
    // RESTOCK order must only land on a wholesaler. Without this an admin
    // could route a customer order to a wholesaler via this endpoint, which
    // bypasses the same invariant the matching engine enforces.
    if (order.orderType === 'RESTOCK' && !store.isWholesaler) {
      return sendError(res, 'Restock orders can only be assigned to a wholesaler', 400);
    }
    if (order.orderType !== 'RESTOCK' && store.isWholesaler) {
      return sendError(res, 'Customer orders cannot be assigned to a wholesaler', 400);
    }
    if (store.status !== 'ACTIVE') {
      return sendError(res, 'Assigned store must be ACTIVE', 400);
    }
    // CANCELLED orders are intentionally still rescuable: admin can assign a
    // store to un-cancel and resume the order. cancelReason is cleared so the
    // customer / store don't see the stale reason once it's live again.

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        storeId,
        status: 'STORE_ACCEPTED',
        storeAcceptedAt: new Date(),
        cancelReason: null, // wipe the auto-cancel reason on rescue
      },
      include: { store: { select: { name: true, ownerId: true } } },
    });

    await broadcastOrderStatus(orderId, 'STORE_ACCEPTED', { byAdmin: true });

    // Notify store owner via templated push (honors prefs). The previous
    // implementation referenced `totalAmount` / `items.quantity`, neither of
    // which exist on the schema (Order has `total`, OrderItem has `qty`) —
    // that 500'd the whole response even though the reassignment succeeded.
    const orderForCount = await prisma.order.findUnique({
      where: { id: orderId },
      select: { total: true, items: { select: { qty: true } } },
    });
    const itemCount = orderForCount?.items.reduce((sum, i) => sum + i.qty, 0) ?? 0;
    await notify('STORE_NEW_ORDER', store.ownerId, {
      orderShort: orderId.slice(-6),
      itemCount,
      total: orderForCount?.total ?? 0,
      orderId,
    });
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'ORDER_ASSIGN_STORE',
        targetType: 'Order',
        targetId: orderId,
        before: { storeId: order.storeId, status: order.status },
        after: { storeId, status: updated.status },
        reason: req.body?.reason ?? null,
      },
    });
    return sendSuccess(res, updated, 'Store assigned');
  } catch (err) {
    console.error('[Admin] assign-store error:', err);
    return sendError(res, 'Failed to assign store', 500);
  }
});

// ─── PUT /orders/:id/assign-driver — admin manually assigns/changes the driver ─

router.put('/orders/:id/assign-driver', async (req: Request, res: Response) => {
  try {
    const orderId = req.params['id']!;
    const driverId = req.body?.driverId as string | undefined;
    if (!driverId) return sendError(res, 'driverId required', 400);

    const [order, driver] = await Promise.all([
      prisma.order.findUnique({ where: { id: orderId } }),
      prisma.driver.findUnique({ where: { id: driverId }, include: { user: true } }),
    ]);
    if (!order) return sendError(res, 'Order not found', 404);
    if (!driver) return sendError(res, 'Driver not found', 404);
    if (order.status === 'DELIVERED') {
      return sendError(res, 'Cannot reassign a delivered order', 400);
    }
    if (!order.storeId) {
      return sendError(res, 'Order has no store yet — assign a store first', 400);
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        driverId,
        status: 'DRIVER_ASSIGNED',
        driverAssignedAt: new Date(),
        cancelReason: null, // wipe auto-cancel reason if we're rescuing
      },
    });

    await broadcastOrderStatus(orderId, 'DRIVER_ASSIGNED', { byAdmin: true, driverId });

    // Compute pickup distance for the driver template
    const orderForDistance = await prisma.order.findUnique({
      where: { id: orderId },
      include: { store: { select: { lat: true, lng: true } } },
    });
    const pickupDistance =
      orderForDistance?.store && driver.currentLat != null && driver.currentLng != null
        ? haversineDistance(
            orderForDistance.store.lat,
            orderForDistance.store.lng,
            driver.currentLat,
            driver.currentLng,
          ).toFixed(1)
        : '?';
    await notify('DRIVER_NEW_DELIVERY', driver.user.id, {
      orderShort: orderId.slice(-6),
      distanceKm: pickupDistance,
      earning: 50, // TODO: wire actual estimated earnings
      orderId,
    });
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'ORDER_ASSIGN_DRIVER',
        targetType: 'Order',
        targetId: orderId,
        before: { driverId: order.driverId, status: order.status },
        after: { driverId, status: updated.status },
        reason: req.body?.reason ?? null,
      },
    });
    return sendSuccess(res, updated, 'Driver assigned');
  } catch (err) {
    console.error('[Admin] assign-driver error:', err);
    return sendError(res, 'Failed to assign driver', 500);
  }
});

// ─── GET /analytics ───────────────────────────────────────────────────────────

// ─── /settings — global platform config (singleton row, cached read) ──────────

const matchingModeEnum = z.enum(['BROADCAST', 'CASCADE']);

const settingsUpdateSchema = z
  .object({
    baseDeliveryFee: z.number().min(0).max(1000),
    perKmFee: z.number().min(0).max(500),
    commissionPercent: z.number().min(0).max(50),
    deliveryRadiusKm: z.number().min(0.5).max(50),
    storeAcceptTimeoutMinutes: z.number().int().min(1).max(60),
    driverAcceptTimeoutSeconds: z.number().int().min(15).max(600),
    storeMatchingMode: matchingModeEnum,
    driverMatchingMode: matchingModeEnum,
  })
  .partial();

router.get('/settings', async (_req: Request, res: Response) => {
  try {
    const settings = await getSettings();
    return sendSuccess(res, settings);
  } catch (err) {
    console.error('[Admin] settings GET error:', err);
    return sendError(res, 'Failed to fetch settings', 500);
  }
});

router.put(
  '/settings',
  validate(settingsUpdateSchema),
  async (req: Request, res: Response) => {
    try {
      const updated = await updateSettings(req.body);
      // Best-effort audit trail
      await prisma.auditLog
        .create({
          data: {
            actorId: req.user?.id ?? null,
            action: 'PLATFORM_SETTINGS_UPDATE',
            targetType: 'PlatformSetting',
            targetId: 'default',
            after: req.body as object,
          },
        })
        .catch(() => undefined);
      return sendSuccess(res, updated, 'Settings updated');
    } catch (err) {
      console.error('[Admin] settings PUT error:', err);
      return sendError(res, 'Failed to update settings', 500);
    }
  },
);

router.get('/analytics', async (_req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalOrdersToday,
      gmvResult,
      activeDrivers,
      activeStores,
      totalOrders,
      totalUsers,
    ] = await Promise.all([
      prisma.order.count({
        where: { createdAt: { gte: today }, status: { not: 'CANCELLED' } },
      }),
      prisma.order.aggregate({
        _sum: { total: true },
        where: { createdAt: { gte: today }, status: { not: 'CANCELLED' } },
      }),
      prisma.driver.count({ where: { status: 'ONLINE' } }),
      prisma.store.count({ where: { status: 'ACTIVE', isOpen: true } }),
      prisma.order.count(),
      prisma.user.count(),
    ]);

    return sendSuccess(res, {
      today: {
        orders: totalOrdersToday,
        gmv: gmvResult._sum.total ?? 0,
      },
      activeDrivers,
      activeStores,
      allTime: {
        orders: totalOrders,
        users: totalUsers,
      },
    });
  } catch (err) {
    console.error('[Admin] analytics error:', err);
    return sendError(res, 'Failed to fetch analytics', 500);
  }
});

// ─── Audit log ────────────────────────────────────────────────────────────────

router.get('/audit-logs', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt((req.query['page'] as string) || '1', 10));
    const limit = Math.min(100, parseInt((req.query['limit'] as string) || '50', 10));
    const skip = (page - 1) * limit;
    const action = req.query['action'] as string | undefined;
    const targetType = req.query['targetType'] as string | undefined;

    const where: Record<string, unknown> = {};
    if (action) where['action'] = action;
    if (targetType) where['targetType'] = targetType;

    const [logs, total] = await prisma.$transaction([
      prisma.auditLog.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.auditLog.count({ where }),
    ]);

    // Enrich each row with the acting admin's name/username. AuditLog only
    // stores actorId — multiple admins exist, so resolve who did each action.
    const actorIds = [...new Set(logs.map((l) => l.actorId))];
    const actors = await prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true, username: true },
    });
    const actorById = new Map(actors.map((a) => [a.id, a]));
    const enriched = logs.map((l) => {
      const actor = actorById.get(l.actorId);
      return {
        ...l,
        actorName: actor?.name ?? null,
        actorUsername: actor?.username ?? null,
      };
    });

    return sendSuccess(res, { logs: enriched, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[Admin] audit log error:', err);
    return sendError(res, 'Failed to fetch audit logs', 500);
  }
});

// ─── Notifications dispatch log ───────────────────────────────────────────────
//
// Per-attempt log of every notification dispatch (in-app + push + web push).
// Lets admins see which messages were delivered, which failed, and why — and
// drill into the raw payload for incident investigation.

router.get('/notifications-log', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt((req.query['page'] as string) || '1', 10));
    const limit = Math.min(200, parseInt((req.query['limit'] as string) || '50', 10));
    const skip = (page - 1) * limit;

    const userId = req.query['userId'] as string | undefined;
    const event = req.query['event'] as string | undefined;
    const channel = req.query['channel'] as string | undefined;
    const status = req.query['status'] as string | undefined;
    const from = req.query['from'] as string | undefined;
    const to = req.query['to'] as string | undefined;

    const where: Prisma.NotificationWhereInput = {};
    if (userId) where.userId = userId;
    if (event) where.event = event;
    if (channel) where.channel = channel as Prisma.NotificationWhereInput['channel'];
    if (status) where.status = status as Prisma.NotificationWhereInput['status'];
    if (from || to) {
      where.createdAt = {};
      if (from) {
        const d = new Date(from);
        if (!Number.isNaN(d.getTime())) (where.createdAt as { gte?: Date }).gte = d;
      }
      if (to) {
        const d = new Date(to);
        if (!Number.isNaN(d.getTime())) (where.createdAt as { lte?: Date }).lte = d;
      }
    }

    const [rows, total] = await prisma.$transaction([
      prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where }),
    ]);

    // Enrich with recipient info — single lookup keyed by unique userIds.
    const recipientIds = [...new Set(rows.map((r) => r.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: recipientIds } },
      select: { id: true, name: true, phone: true, email: true, role: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    const enriched = rows.map((r) => {
      const u = userById.get(r.userId);
      return {
        ...r,
        recipient: u
          ? {
              id: u.id,
              name: u.name,
              phone: u.phone,
              email: u.email,
              role: u.role,
            }
          : null,
      };
    });

    return sendSuccess(res, {
      logs: enriched,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('[Admin] notifications log error:', err);
    return sendError(res, 'Failed to fetch notifications log', 500);
  }
});

// ─── Disputes / Refunds ───────────────────────────────────────────────────────

router.put('/orders/:id/refund', async (req: Request, res: Response) => {
  try {
    const orderId = req.params['id']!;
    const reason = (req.body?.reason as string | undefined) ?? 'Refund issued by admin';
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return sendError(res, 'Order not found', 404);
    if (order.paymentStatus === 'REFUNDED') {
      return sendError(res, 'Order already refunded', 400);
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: 'REFUNDED',
        cancelReason: reason,
        ...(order.status !== 'DELIVERED' ? { status: 'CANCELLED' as const } : {}),
      },
    });

    await broadcastOrderStatus(orderId, updated.status, { paymentStatus: 'REFUNDED', reason });

    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'ORDER_REFUND',
        targetType: 'Order',
        targetId: orderId,
        before: { paymentStatus: order.paymentStatus, status: order.status },
        after: { paymentStatus: updated.paymentStatus, status: updated.status },
        reason,
      },
    });

    // Credit the customer's wallet for the full order total (in paise). The
    // /orders/:id/refund path may be called for an already-paid order or one
    // that never reached PAID; either way the customer gets credited so they
    // can use it on their next order. If the same order is refunded twice
    // (shouldn't happen — guarded above), the wallet would double-credit;
    // the paymentStatus check prevents that.
    const refundPaise = Math.round((order.total ?? 0) * 100);
    if (refundPaise > 0) {
      await creditWallet({
        userId: order.customerId,
        amount: refundPaise,
        kind: 'REFUND',
        orderId,
        note: reason,
        actorId: req.user!.id,
      });
    }

    await prisma.notification.create({
      data: {
        userId: order.customerId,
        title: 'Refund issued',
        body: `₹${(refundPaise / 100).toFixed(2)} refunded to your wallet for order #${orderId.slice(-6)}.`,
      },
    });

    return sendSuccess(res, updated, 'Refund issued');
  } catch (err) {
    console.error('[Admin] refund error:', err);
    return sendError(res, 'Failed to issue refund', 500);
  }
});

// ─── Zones (delivery configuration) ───────────────────────────────────────────

// Whitelist the fields admins may set on Zone. Without this, POST/PUT used
// `data: req.body` directly — a stray key (e.g. an internal field added to
// the schema later) would silently persist or crash, and an attacker who got
// hold of an admin token could write arbitrary columns.
const zoneCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  city: z.string().trim().min(1).max(100),
  centerLat: z.number().min(-90).max(90),
  centerLng: z.number().min(-180).max(180),
  radiusKm: z.number().positive().max(100).optional(),
  baseDeliveryFee: z.number().min(0).max(10000).optional(),
  perKmFee: z.number().min(0).max(1000).optional(),
  commissionRate: z.number().min(0).max(1).optional(),
  isActive: z.boolean().optional(),
});
const zoneUpdateSchema = zoneCreateSchema.partial();

router.get('/zones', async (req: Request, res: Response) => {
  try {
    const zones = await prisma.zone.findMany({ orderBy: { createdAt: 'desc' } });
    return sendSuccess(res, zones);
  } catch (err) {
    console.error('[Admin] zones list error:', err);
    return sendError(res, 'Failed to fetch zones', 500);
  }
});

router.post('/zones', validate(zoneCreateSchema), async (req: Request, res: Response) => {
  try {
    const created = await prisma.zone.create({ data: req.body });
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'ZONE_CREATE',
        targetType: 'Zone',
        targetId: created.id,
        after: created as never,
      },
    });
    return sendSuccess(res, created, 'Zone created', 201);
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === 'P2002') return sendError(res, 'Zone name already exists', 409);
    console.error('[Admin] create zone error:', err);
    return sendError(res, 'Failed to create zone', 500);
  }
});

router.put('/zones/:id', validate(zoneUpdateSchema), async (req: Request, res: Response) => {
  try {
    const before = await prisma.zone.findUnique({ where: { id: req.params['id'] } });
    if (!before) return sendError(res, 'Zone not found', 404);
    const updated = await prisma.zone.update({ where: { id: req.params['id'] }, data: req.body });
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id, action: 'ZONE_UPDATE',
        targetType: 'Zone', targetId: updated.id,
        before: before as never, after: updated as never,
      },
    });
    return sendSuccess(res, updated, 'Zone updated');
  } catch (err) {
    console.error('[Admin] update zone error:', err);
    return sendError(res, 'Failed to update zone', 500);
  }
});

router.delete('/zones/:id', async (req: Request, res: Response) => {
  try {
    const before = await prisma.zone.findUnique({ where: { id: req.params['id'] } });
    if (!before) return sendError(res, 'Zone not found', 404);
    await prisma.zone.delete({ where: { id: req.params['id'] } });
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id, action: 'ZONE_DELETE',
        targetType: 'Zone', targetId: req.params['id'],
        before: before as never,
      },
    });
    return sendSuccess(res, null, 'Zone deleted');
  } catch (err) {
    console.error('[Admin] delete zone error:', err);
    return sendError(res, 'Failed to delete zone', 500);
  }
});

// ─── Wallets + Refunds (admin visibility + manual goodwill credits) ─────────

/** Validate `?page=N&limit=M&search=text` style query params. */
function parsePaging(req: Request, defaults = { page: 1, limit: 20 }) {
  const page = Math.max(1, Number(req.query['page']) || defaults.page);
  const limit = Math.min(100, Math.max(1, Number(req.query['limit']) || defaults.limit));
  const search = (req.query['search'] as string | undefined)?.trim() || undefined;
  return { page, limit, search, skip: (page - 1) * limit };
}

// GET /admin/wallets — paginated list of all wallets, sortable by balance desc
router.get('/wallets', async (req: Request, res: Response) => {
  try {
    const { page, limit, search, skip } = parsePaging(req);
    const where: Prisma.WalletWhereInput = search
      ? {
          user: {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          },
        }
      : {};
    const [items, total] = await Promise.all([
      prisma.wallet.findMany({
        where,
        include: { user: { select: { id: true, name: true, phone: true, email: true, role: true } } },
        orderBy: { balance: 'desc' },
        skip,
        take: limit,
      }),
      prisma.wallet.count({ where }),
    ]);
    return sendSuccess(res, { items, total, page, limit });
  } catch (err) {
    console.error('[Admin] list wallets error:', err);
    return sendError(res, 'Failed to fetch wallets', 500);
  }
});

// GET /admin/wallets/:userId — wallet detail + recent transactions
router.get('/wallets/:userId', async (req: Request, res: Response) => {
  try {
    const userId = req.params['userId']!;
    const view = await getWalletWithTxns(userId, 100);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, phone: true, email: true, role: true },
    });
    if (!user) return sendError(res, 'User not found', 404);
    return sendSuccess(res, { user, ...view });
  } catch (err) {
    console.error('[Admin] wallet detail error:', err);
    return sendError(res, 'Failed to fetch wallet', 500);
  }
});

const creditWalletSchema = z.object({
  amountRupees: z.number().positive().max(100000),
  kind: z.enum(['GOODWILL', 'ADJUSTMENT', 'PROMO_CREDIT']),
  note: z.string().trim().min(1).max(500),
});

// POST /admin/wallets/:userId/credit — admin issues goodwill / promo / adjustment
router.post(
  '/wallets/:userId/credit',
  validate(creditWalletSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.params['userId']!;
      const body = req.body as z.infer<typeof creditWalletSchema>;
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) return sendError(res, 'User not found', 404);

      const amountPaise = Math.round(body.amountRupees * 100);
      const txn = await creditWallet({
        userId,
        amount: amountPaise,
        kind: body.kind,
        note: body.note,
        actorId: req.user!.id,
      });

      await writeAudit({
        actorId: req.user!.id,
        action: 'WALLET_CREDIT',
        targetType: 'User',
        targetId: userId,
        after: { amountPaise, kind: body.kind, note: body.note },
      });

      await prisma.notification.create({
        data: {
          userId,
          title: 'Credit added to your wallet',
          body: `₹${body.amountRupees.toFixed(2)} (${body.kind.toLowerCase()}). ${body.note}`,
        },
      });

      return sendSuccess(res, txn, 'Credit issued');
    } catch (err) {
      console.error('[Admin] wallet credit error:', err);
      return sendError(res, 'Failed to credit wallet', 500);
    }
  },
);

// GET /admin/refunds — filterable log of every wallet transaction (refunds,
// goodwill, etc.). Default scope is "money-out-the-door" events (REFUND +
// GOODWILL + ADJUSTMENT) — pass ?kind=ALL to include ORDER_PAYMENT debits.
router.get('/refunds', async (req: Request, res: Response) => {
  try {
    const { page, limit, skip } = parsePaging(req);
    const kindParam = (req.query['kind'] as string | undefined)?.toUpperCase();
    const fromParam = req.query['from'] as string | undefined;
    const toParam = req.query['to'] as string | undefined;

    const where: Prisma.WalletTransactionWhereInput = {
      ...(kindParam && kindParam !== 'ALL'
        ? { kind: kindParam as 'REFUND' | 'GOODWILL' | 'ADJUSTMENT' | 'PROMO_CREDIT' | 'ORDER_PAYMENT' }
        : { kind: { in: ['REFUND', 'GOODWILL', 'ADJUSTMENT', 'PROMO_CREDIT'] } }),
      ...(fromParam || toParam
        ? {
            createdAt: {
              ...(fromParam ? { gte: new Date(fromParam) } : {}),
              ...(toParam ? { lte: new Date(toParam) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where,
        include: {
          wallet: {
            include: {
              user: { select: { id: true, name: true, phone: true, email: true } },
            },
          },
          order: { select: { id: true, total: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.walletTransaction.count({ where }),
    ]);
    return sendSuccess(res, { items, total, page, limit });
  } catch (err) {
    console.error('[Admin] refunds list error:', err);
    return sendError(res, 'Failed to fetch refunds', 500);
  }
});

export default router;
