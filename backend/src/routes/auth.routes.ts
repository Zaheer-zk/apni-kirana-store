import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { prisma } from '../config/prisma';
import { config } from '../config/env';
import { validate } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { otpLimiter } from '../middleware/rate-limit.middleware';
import { sendSuccess, sendError } from '../utils/response';
import { publicUser } from '../utils/roles';
import { generateResetToken, hashToken } from '../utils/token';
import bcrypt from 'bcryptjs';
import { generateOtp, storeOtp, verifyOtp } from '../utils/otp';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { sendSmsOtp } from '../services/sms.service';
import { sendPasswordResetEmail } from '../services/email.service';

const router = Router();

// Roles a self-service account can hold. ADMIN accounts are provisioned only
// by the create-admin script and log in via /admin-login.
type AppRole = 'CUSTOMER' | 'STORE_OWNER' | 'DRIVER';
const APP_ROLES = ['CUSTOMER', 'STORE_OWNER', 'DRIVER'] as const;

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const BCRYPT_ROUNDS = 10;

// ─── Schemas ──────────────────────────────────────────────────────────────────

const phoneRule = z.string().regex(/^\d{10}$/, 'Phone must be exactly 10 digits');
const passwordRule = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters'); // bcrypt's input limit

const sendOtpSchema = z.object({ phone: phoneRule });

const verifyOtpSchema = z.object({
  phone: phoneRule,
  otp: z.string().length(6, 'OTP must be 6 digits'),
  // Which app the user is logging in from. The role must already be granted to
  // the account — the OTP flow never creates accounts or roles any more.
  role: z.enum(APP_ROLES).optional(),
});

// Username rule: 3-30 chars, alphanumerics + `_` `-` `.`. Kept here so
// /register and /login-password validate identically.
const usernameRule = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be at most 30 characters')
  .regex(/^[a-zA-Z0-9_.\-]+$/, 'Username may only contain letters, numbers, "_", "-" and "."');

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  phone: phoneRule,
  // Email, username and password are OPTIONAL on registration. A user who
  // signs up with phone alone can still log in via the OTP flow. They can
  // add an email + password later from the profile screen (separate flow).
  email: z.string().trim().toLowerCase().email('Enter a valid email address').optional(),
  username: usernameRule.optional(),
  password: passwordRule.optional(),
  role: z.enum(APP_ROLES),
});

const loginSchema = z.object({
  // username, or a 10-digit phone number
  identifier: z.string().trim().min(1, 'Enter your username or mobile number'),
  password: z.string().min(1, 'Password is required'),
  role: z.enum(APP_ROLES).optional(),
});

// Body for the unified /login-password endpoint. Identifier may be a username
// or an email. Role is required because (identifier, role) is the new unique
// key — without it, the same value could resolve to multiple accounts.
const loginPasswordSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your username or email'),
  password: z.string().min(1, 'Password is required'),
  role: z.enum(['CUSTOMER', 'STORE_OWNER', 'DRIVER', 'ADMIN']),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).optional(),
  newPassword: passwordRule,
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: passwordRule,
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const adminLoginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const roleLabel = (r: UserRole): string => r.replace('_', ' ').toLowerCase();

/** Issues an access + refresh token pair and persists the refresh token. */
async function issueSession(user: { id: string; phone: string | null }, activeRole: UserRole) {
  const accessToken = signAccessToken({ id: user.id, role: activeRole, phone: user.phone ?? '' });
  const refreshToken = signRefreshToken({ id: user.id, role: activeRole });
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  await prisma.refreshToken.create({ data: { token: refreshToken, userId: user.id, expiresAt } });
  return { accessToken, refreshToken };
}

/**
 * Tells the login response whether the resolved (userId, role) is still
 * waiting for admin approval. Mirrors the existing DRIVER pattern (status =
 * PENDING_APPROVAL means "logged in, but can't act yet"). The token still
 * works for /auth/me + the role's profile endpoint; everything else returns
 * 403 via the requirePending middleware.
 */
async function getApprovalGate(
  userId: string,
  role: UserRole,
): Promise<{ pendingApproval?: true; reason?: 'STORE_PENDING' | 'DRIVER_PENDING' }> {
  if (role === 'STORE_OWNER') {
    const store = await prisma.store.findUnique({
      where: { ownerId: userId },
      select: { status: true },
    });
    if (store?.status === 'PENDING_APPROVAL') {
      return { pendingApproval: true, reason: 'STORE_PENDING' };
    }
  }
  if (role === 'DRIVER') {
    const driver = await prisma.driver.findUnique({
      where: { userId },
      select: { status: true },
    });
    if (driver?.status === 'PENDING_APPROVAL') {
      return { pendingApproval: true, reason: 'DRIVER_PENDING' };
    }
  }
  return {};
}

// ─── POST /send-otp ───────────────────────────────────────────────────────────
// Sends an OTP. Used both for registration verification and for phone+OTP login.

router.post('/send-otp', otpLimiter, validate(sendOtpSchema), async (req: Request, res: Response) => {
  try {
    const { phone } = req.body as { phone: string };

    const otp = generateOtp();
    await storeOtp(phone, otp);
    await sendSmsOtp(phone, otp);

    sendSuccess(res, null, 'OTP sent successfully');
  } catch (err) {
    console.error('[Auth] send-otp error:', err);
    sendError(res, 'Failed to send OTP', 500);
  }
});

// ─── POST /register ───────────────────────────────────────────────────────────
// Creates a new account (customer / store owner / driver). The account is
// inactive for login until the OTP sent to the phone is verified.

router.post('/register', otpLimiter, validate(registerSchema), async (req: Request, res: Response) => {
  try {
    const { name, phone, email, username, password, role } = req.body as {
      name: string;
      phone: string;
      email?: string;
      username?: string;
      password?: string;
      role: AppRole;
    };

    // Each (phone, role) is its own account — fully isolated profile. Look up
    // by the composite key, not by phone alone.
    const existing = await prisma.user.findUnique({
      where: { phone_role: { phone, role: role as UserRole } },
    });

    // Already-registered (and verified) account for this exact (phone, role).
    if (existing && existing.phoneVerified) {
      return sendError(
        res,
        `This mobile number is already registered as a ${roleLabel(role)}. Please log in instead.`,
        409,
      );
    }

    // Email + username are unique PER ROLE (mirrors the (phone, role) rule).
    // A user can be alice@x.com on both CUSTOMER and STORE_OWNER — but only
    // once per role. Skip these checks if the caller didn't provide them.
    if (email) {
      const emailOwner = await prisma.user.findUnique({
        where: { email_role: { email, role: role as UserRole } },
        select: { id: true },
      });
      if (emailOwner && emailOwner.id !== existing?.id) {
        return sendError(
          res,
          `This email is already registered as a ${roleLabel(role)}.`,
          409,
        );
      }
    }
    if (username) {
      const usernameOwner = await prisma.user.findUnique({
        where: { username_role: { username, role: role as UserRole } },
        select: { id: true },
      });
      if (usernameOwner && usernameOwner.id !== existing?.id) {
        return sendError(
          res,
          `This username is already taken for ${roleLabel(role)} accounts.`,
          409,
        );
      }
    }

    const passwordHash = password ? await bcrypt.hash(password, BCRYPT_ROUNDS) : null;
    const data = {
      name,
      ...(email !== undefined ? { email } : {}),
      ...(username !== undefined ? { username } : {}),
      ...(passwordHash !== null ? { passwordHash } : {}),
      role: role as UserRole,
      roles: [role as UserRole],
      phoneVerified: false,
      mustChangePassword: false,
    };

    if (existing) {
      // Re-registration of an unverified account — overwrite its details.
      await prisma.user.update({ where: { id: existing.id }, data });
    } else {
      await prisma.user.create({ data: { ...data, phone } });
    }

    const otp = generateOtp();
    await storeOtp(phone, otp);
    await sendSmsOtp(phone, otp);

    return sendSuccess(
      res,
      { phone },
      'Account created. Enter the OTP sent to your mobile number to verify it.',
      201,
    );
  } catch (err) {
    console.error('[Auth] register error:', err);
    return sendError(res, 'Registration failed', 500);
  }
});

// ─── POST /verify-otp ─────────────────────────────────────────────────────────
// Confirms ownership of a phone number. Used to complete registration AND as
// the phone+OTP login path. It never creates accounts — the number must
// already be registered.

router.post('/verify-otp', otpLimiter, validate(verifyOtpSchema), async (req: Request, res: Response) => {
  try {
    const { phone, otp, role } = req.body as { phone: string; otp: string; role?: AppRole };

    // Per-role accounts: look up the exact (phone, role) row. If the caller
    // didn't pass a role (legacy / older clients), fall back to *any* row for
    // the phone — but apps should always pass it.
    const user = role
      ? await prisma.user.findUnique({
          where: { phone_role: { phone, role: role as UserRole } },
        })
      : await prisma.user.findFirst({ where: { phone } });
    if (!user) {
      return sendError(
        res,
        role
          ? `This mobile number is not registered as a ${roleLabel(role as UserRole)}.`
          : 'This mobile number is not registered. Please create an account first.',
        404,
      );
    }

    const valid = await verifyOtp(phone, otp);
    if (!valid) {
      return sendError(res, 'Invalid or expired OTP', 400);
    }

    if (!user.isActive) {
      return sendError(res, 'Your account has been suspended', 403);
    }

    const activeRole: UserRole = (role as UserRole | undefined) ?? user.role;

    // First successful OTP after registration verifies the number.
    if (!user.phoneVerified) {
      await prisma.user.update({ where: { id: user.id }, data: { phoneVerified: true } });
    }

    const { accessToken, refreshToken } = await issueSession(user, activeRole);
    const addressCount = await prisma.address.count({ where: { userId: user.id } });
    const approvalGate = await getApprovalGate(user.id, activeRole);

    return sendSuccess(
      res,
      {
        accessToken,
        refreshToken,
        user: publicUser({ ...user, role: activeRole, phoneVerified: true }),
        hasAddress: addressCount > 0,
        mustChangePassword: user.mustChangePassword,
        ...approvalGate,
      },
      'Login successful',
    );
  } catch (err) {
    console.error('[Auth] verify-otp error:', err);
    return sendError(res, 'Authentication failed', 500);
  }
});

// ─── POST /login ──────────────────────────────────────────────────────────────
// Username/password (or phone/password) login for customers, store owners and
// drivers. Admins use /admin-login.

router.post('/login', otpLimiter, validate(loginSchema), async (req: Request, res: Response) => {
  try {
    const { identifier, password, role } = req.body as {
      identifier: string;
      password: string;
      role?: AppRole;
    };

    // A 10-digit identifier is a phone number, anything else is a username.
    // Phone alone is no longer unique (each role has its own row), so a phone
    // login requires the role to know which account to authenticate. Username
    // is also no longer globally unique — but for backwards compat with older
    // clients that don't pass a role, we fall back to findFirst() and pick
    // the only row if there happens to be exactly one. New clients should
    // call /login-password which always requires the role.
    const isPhone = /^\d{10}$/.test(identifier);
    if (isPhone && !role) {
      return sendError(
        res,
        'Please select a role when logging in with a mobile number.',
        400,
      );
    }
    let user;
    if (isPhone) {
      user = await prisma.user.findUnique({
        where: { phone_role: { phone: identifier, role: role as UserRole } },
      });
    } else if (role) {
      user = await prisma.user.findUnique({
        where: { username_role: { username: identifier, role: role as UserRole } },
      });
    } else {
      // No role + username identifier — best-effort lookup for legacy callers.
      // Returns the row only when one (and only one) account uses this
      // username; otherwise the caller is asked to disambiguate with a role.
      const matches = await prisma.user.findMany({
        where: { username: identifier },
        take: 2,
      });
      if (matches.length > 1) {
        return sendError(res, 'Please select a role when logging in.', 400);
      }
      user = matches[0] ?? null;
    }

    // Generic message — never reveal whether the account exists.
    if (!user || !user.passwordHash) {
      return sendError(res, 'Invalid credentials. Check your username/mobile and password.', 401);
    }
    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      return sendError(res, 'Invalid credentials. Check your username/mobile and password.', 401);
    }
    if (!user.isActive) {
      return sendError(res, 'Your account has been suspended', 403);
    }
    if (!user.phoneVerified) {
      return sendError(
        res,
        'Please verify your mobile number with the OTP before logging in.',
        403,
      );
    }

    const activeRole: UserRole = (role as UserRole | undefined) ?? user.role;
    if (role && !user.roles.includes(role as UserRole)) {
      return sendError(res, `This account is not registered as a ${roleLabel(activeRole)}.`, 403);
    }

    const { accessToken, refreshToken } = await issueSession(user, activeRole);
    const addressCount = await prisma.address.count({ where: { userId: user.id } });
    const approvalGate = await getApprovalGate(user.id, activeRole);

    return sendSuccess(
      res,
      {
        accessToken,
        refreshToken,
        user: publicUser({ ...user, role: activeRole }),
        hasAddress: addressCount > 0,
        mustChangePassword: user.mustChangePassword,
        ...approvalGate,
      },
      'Login successful',
    );
  } catch (err) {
    console.error('[Auth] login error:', err);
    return sendError(res, 'Login failed', 500);
  }
});

// ─── POST /change-password ────────────────────────────────────────────────────
// Authenticated password change. Also clears `mustChangePassword`, so the
// force-change screen calls this. `currentPassword` is required whenever the
// account already has a password set.

router.post(
  '/change-password',
  authenticate,
  validate(changePasswordSchema),
  async (req: Request, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body as {
        currentPassword?: string;
        newPassword: string;
      };

      const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
      if (!user) {
        return sendError(res, 'User not found', 404);
      }

      if (user.passwordHash) {
        if (!currentPassword) {
          return sendError(res, 'Your current password is required', 400);
        }
        const ok = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!ok) {
          return sendError(res, 'Your current password is incorrect', 401);
        }
      }

      const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: false },
      });
      // Force every other session to re-authenticate with the new password.
      await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

      return sendSuccess(res, null, 'Password updated successfully');
    } catch (err) {
      console.error('[Auth] change-password error:', err);
      return sendError(res, 'Failed to change password', 500);
    }
  },
);

// ─── POST /forgot-password ────────────────────────────────────────────────────
// Emails a password-reset link. Always responds with the same generic message
// so the endpoint can't be used to discover which emails have accounts.

router.post(
  '/forgot-password',
  otpLimiter,
  validate(forgotPasswordSchema),
  async (req: Request, res: Response) => {
    const generic =
      'If an account exists for that email, a password-reset link has been sent to it.';
    try {
      const { email } = req.body as { email: string };

      // Email is no longer globally unique (multi-role). Email all active
      // accounts that share this address — each gets its own reset link
      // tied to its own User row. In practice almost every user has only
      // one account per email, so this stays a single send.
      const users = await prisma.user.findMany({ where: { email, isActive: true } });
      for (const user of users) {
        // Only one live reset link per user — drop any earlier unused ones.
        await prisma.passwordResetToken.deleteMany({
          where: { userId: user.id, usedAt: null },
        });
        const { raw, hash } = generateResetToken();
        await prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: hash,
            expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
          },
        });
        const link = `${config.webAppUrl}/reset-password?token=${raw}`;
        await sendPasswordResetEmail(email, user.name, link);
      }

      return sendSuccess(res, null, generic);
    } catch (err) {
      console.error('[Auth] forgot-password error:', err);
      // Still return the generic message — never leak that something failed
      // for a particular email.
      return sendSuccess(res, null, generic);
    }
  },
);

// ─── GET /reset-password/validate ─────────────────────────────────────────────
// Lets the reset page check a token before showing the new-password form.

router.get('/reset-password/validate', async (req: Request, res: Response) => {
  try {
    const token = typeof req.query['token'] === 'string' ? req.query['token'] : '';
    if (!token) {
      return sendError(res, 'Reset token is required', 400);
    }
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    const valid = !!record && !record.usedAt && record.expiresAt > new Date();
    return sendSuccess(res, { valid }, valid ? 'Token is valid' : 'Token is invalid or expired');
  } catch (err) {
    console.error('[Auth] reset-password validate error:', err);
    return sendError(res, 'Could not validate the reset token', 500);
  }
});

// ─── POST /reset-password ─────────────────────────────────────────────────────
// Consumes a reset token and sets a new password. Single-use; all of the
// user's sessions are revoked so the old password stops working everywhere.

router.post(
  '/reset-password',
  otpLimiter,
  validate(resetPasswordSchema),
  async (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body as { token: string; newPassword: string };

      const record = await prisma.passwordResetToken.findUnique({
        where: { tokenHash: hashToken(token) },
      });
      if (!record || record.usedAt || record.expiresAt < new Date()) {
        return sendError(res, 'This password-reset link is invalid or has expired.', 400);
      }

      const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
      await prisma.$transaction([
        prisma.user.update({
          where: { id: record.userId },
          data: { passwordHash, mustChangePassword: false },
        }),
        prisma.passwordResetToken.update({
          where: { id: record.id },
          data: { usedAt: new Date() },
        }),
        prisma.refreshToken.deleteMany({ where: { userId: record.userId } }),
      ]);

      return sendSuccess(res, null, 'Your password has been reset. You can now log in.');
    } catch (err) {
      console.error('[Auth] reset-password error:', err);
      return sendError(res, 'Failed to reset password', 500);
    }
  },
);

// ─── POST /admin-login ────────────────────────────────────────────────────────
// Admins log in with a username + password — no OTP. Only ADMIN accounts that
// have a passwordHash set (via scripts/create-admin.ts) can use this.

router.post('/admin-login', otpLimiter, validate(adminLoginSchema), async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body as { username: string; password: string };

    // Username is unique per role — look up the (username, ADMIN) row.
    const user = await prisma.user.findUnique({
      where: { username_role: { username, role: 'ADMIN' } },
    });
    // Generic message whether the username or the password is wrong — don't
    // reveal which admin usernames exist.
    if (!user || user.role !== 'ADMIN' || !user.passwordHash) {
      return sendError(res, 'Invalid username or password', 401);
    }
    if (!user.isActive) {
      return sendError(res, 'Your account has been suspended', 403);
    }
    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      return sendError(res, 'Invalid username or password', 401);
    }

    const { accessToken, refreshToken } = await issueSession(user, 'ADMIN');

    return sendSuccess(
      res,
      { accessToken, refreshToken, user: publicUser(user) },
      'Login successful',
    );
  } catch (err) {
    console.error('[Auth] admin-login error:', err);
    return sendError(res, 'Login failed', 500);
  }
});

// ─── POST /login-password ─────────────────────────────────────────────────────
// Unified password login for ALL roles (including ADMIN). Mode 1 of three:
//   1. POST /login-password         — username OR email + password + role
//   2. POST /send-otp + /verify-otp — phone + OTP  (unchanged)
//   3. POST /login                  — legacy "username or phone" + password
//
// Identifier is matched against User.username OR User.email on the (X, role)
// tuple. Role is REQUIRED — the same email may belong to two different
// rows (one CUSTOMER and one STORE_OWNER), so we can't resolve without it.

router.post(
  '/login-password',
  otpLimiter,
  validate(loginPasswordSchema),
  async (req: Request, res: Response) => {
    try {
      const { identifier, password, role } = req.body as {
        identifier: string;
        password: string;
        role: UserRole;
      };

      const looksLikeEmail = identifier.includes('@');
      const normalised = looksLikeEmail ? identifier.toLowerCase() : identifier;

      // Try the matching uniqueness boundary first; if not found AND identifier
      // looks like an email, also try username (and vice versa). Real-world
      // users sometimes paste their email into the username field.
      let user = looksLikeEmail
        ? await prisma.user.findUnique({
            where: { email_role: { email: normalised, role } },
          })
        : await prisma.user.findUnique({
            where: { username_role: { username: normalised, role } },
          });
      if (!user) {
        user = looksLikeEmail
          ? await prisma.user.findUnique({
              where: { username_role: { username: normalised, role } },
            })
          : await prisma.user.findUnique({
              where: { email_role: { email: normalised, role } },
            });
      }

      // Generic message — never reveal whether the account exists.
      if (!user) {
        return sendError(res, 'Invalid credentials. Check your username/email and password.', 401);
      }
      if (!user.passwordHash) {
        // Account exists but has never set a password. Don't fall through to
        // "invalid credentials" — that's misleading. Steer them to the OTP
        // flow.
        return sendError(
          res,
          'Password is not set on this account. Sign in with the OTP sent to your mobile number instead.',
          401,
        );
      }
      const passwordOk = await bcrypt.compare(password, user.passwordHash);
      if (!passwordOk) {
        return sendError(res, 'Invalid credentials. Check your username/email and password.', 401);
      }
      if (!user.isActive) {
        return sendError(res, 'Your account has been suspended', 403);
      }
      // Non-admin roles must have a verified phone before they can log in via
      // password (admin accounts are created with phoneVerified=true by the
      // admin-create-user script).
      if (role !== 'ADMIN' && !user.phoneVerified) {
        return sendError(
          res,
          'Please verify your mobile number with the OTP before logging in.',
          403,
        );
      }
      if (!user.roles.includes(role)) {
        return sendError(res, `This account is not registered as a ${roleLabel(role)}.`, 403);
      }

      const { accessToken, refreshToken } = await issueSession(user, role);
      const addressCount = await prisma.address.count({ where: { userId: user.id } });
      const approvalGate = await getApprovalGate(user.id, role);

      return sendSuccess(
        res,
        {
          accessToken,
          refreshToken,
          user: publicUser({ ...user, role }),
          hasAddress: addressCount > 0,
          mustChangePassword: user.mustChangePassword,
          ...approvalGate,
        },
        'Login successful',
      );
    } catch (err) {
      console.error('[Auth] login-password error:', err);
      return sendError(res, 'Login failed', 500);
    }
  },
);

// ─── POST /refresh ────────────────────────────────────────────────────────────

router.post('/refresh', validate(refreshSchema), async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body as { refreshToken: string };

    // Verify JWT signature
    let payload: { id: string; role?: UserRole };
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      return sendError(res, 'Invalid or expired refresh token', 401);
    }

    // Check DB record
    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.expiresAt < new Date()) {
      return sendError(res, 'Refresh token is expired or not found', 401);
    }

    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user || !user.isActive) {
      return sendError(res, 'User not found or suspended', 401);
    }

    // Preserve the role the session was opened with (multi-role accounts).
    const activeRole =
      payload.role && user.roles.includes(payload.role) ? payload.role : user.role;
    const accessToken = signAccessToken({ id: user.id, role: activeRole, phone: user.phone ?? '' });

    return sendSuccess(res, { accessToken }, 'Token refreshed');
  } catch (err) {
    console.error('[Auth] refresh error:', err);
    return sendError(res, 'Token refresh failed', 500);
  }
});

// ─── POST /logout ─────────────────────────────────────────────────────────────

router.post('/logout', authenticate, async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };

    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    } else {
      // Delete all refresh tokens for the user (logout from all devices)
      await prisma.refreshToken.deleteMany({ where: { userId: req.user!.id } });
    }

    return sendSuccess(res, null, 'Logged out successfully');
  } catch (err) {
    console.error('[Auth] logout error:', err);
    return sendError(res, 'Logout failed', 500);
  }
});

export default router;
