import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { validate } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { sendSuccess, sendError } from '../utils/response';
import { generateOtp, storeOtp, verifyOtp } from '../utils/otp';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { config } from '../config/env';
import twilio from 'twilio';

const router = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const sendOtpSchema = z.object({
  phone: z.string().regex(/^\d{10}$/, 'Phone must be exactly 10 digits'),
});

const verifyOtpSchema = z.object({
  phone: z.string().regex(/^\d{10}$/, 'Phone must be exactly 10 digits'),
  otp: z.string().length(6, 'OTP must be 6 digits'),
  // Optional. Mobile clients pass this so the backend knows which app the user
  // is logging in from. STORE_OWNER / DRIVER must be pre-provisioned by an admin
  // — the OTP flow refuses to auto-create those roles.
  role: z.enum(['CUSTOMER', 'STORE_OWNER', 'DRIVER']).optional(),
  // Optional name for first-time customer registration.
  name: z.string().min(1).max(100).optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function sendSmsOtp(phone: string, otp: string): Promise<void> {
  if (config.nodeEnv === 'development') {
    console.log(`[OTP] Phone: ${phone} | OTP: ${otp}`);
    return;
  }

  const client = twilio(config.twilio.accountSid, config.twilio.authToken);
  await client.messages.create({
    body: `Your Apni Kirana Store OTP is ${otp}. Valid for 5 minutes.`,
    from: config.twilio.phoneNumber,
    to: `+91${phone}`,
  });
}

// ─── POST /send-otp ───────────────────────────────────────────────────────────

router.post('/send-otp', validate(sendOtpSchema), async (req: Request, res: Response) => {
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

// ─── POST /verify-otp ─────────────────────────────────────────────────────────

router.post('/verify-otp', validate(verifyOtpSchema), async (req: Request, res: Response) => {
  try {
    const { phone, otp, role, name } = req.body as {
      phone: string;
      otp: string;
      role?: 'CUSTOMER' | 'STORE_OWNER' | 'DRIVER';
      name?: string;
    };

    const valid = await verifyOtp(phone, otp);
    if (!valid) {
      return sendError(res, 'Invalid or expired OTP', 400);
    }

    // Find or create user. STORE_OWNER and DRIVER must be pre-provisioned by
    // admin — the OTP flow only auto-creates customers.
    let user = await prisma.user.findUnique({ where: { phone } });
    if (!user) {
      if (role === 'STORE_OWNER' || role === 'DRIVER') {
        return sendError(
          res,
          'Account not found. Stores and drivers must be registered by an administrator.',
          404,
        );
      }
      user = await prisma.user.create({
        data: { phone, role: 'CUSTOMER', ...(name ? { name } : {}) },
      });
    } else if (role && role !== user.role) {
      // Existing user logging in from the wrong app
      return sendError(
        res,
        `This phone is registered as ${user.role}. Please use the correct app.`,
        403,
      );
    } else if (name && !user.name) {
      // First-time customer registration providing their name
      user = await prisma.user.update({ where: { id: user.id }, data: { name } });
    }

    if (!user.isActive) {
      return sendError(res, 'Your account has been suspended', 403);
    }

    // Issue tokens
    const accessToken = signAccessToken({ id: user.id, role: user.role, phone: user.phone });
    const refreshToken = signRefreshToken({ id: user.id });

    // Persist refresh token (expires in 30 days) and check addresses in parallel
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const [, addressCount] = await Promise.all([
      prisma.refreshToken.create({ data: { token: refreshToken, userId: user.id, expiresAt } }),
      prisma.address.count({ where: { userId: user.id } }),
    ]);

    return sendSuccess(
      res,
      { accessToken, refreshToken, user, hasAddress: addressCount > 0 },
      'Login successful',
    );
  } catch (err) {
    console.error('[Auth] verify-otp error:', err);
    return sendError(res, 'Authentication failed', 500);
  }
});

// ─── POST /refresh ────────────────────────────────────────────────────────────

router.post('/refresh', validate(refreshSchema), async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body as { refreshToken: string };

    // Verify JWT signature
    let payload: { id: string };
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

    const accessToken = signAccessToken({ id: user.id, role: user.role, phone: user.phone });

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
