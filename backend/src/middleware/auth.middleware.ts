import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { verifyAccessToken } from '../utils/jwt';
import { sendError } from '../utils/response';
import { prisma } from '../config/prisma';

// Augment Express Request to carry the authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: UserRole;
        phone: string;
      };
    }
  }
}

/**
 * Verifies the JWT access token from the Authorization header.
 * Attaches req.user on success; returns 401 otherwise.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendError(res, 'Authentication required', 401);
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.id, role: payload.role, phone: payload.phone };
    next();
  } catch {
    sendError(res, 'Invalid or expired token', 401);
  }
}

/**
 * Returns middleware that checks req.user.role is in the allowed roles.
 * Must be used after authenticate.
 */
export function authorize(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 'Authentication required', 401);
      return;
    }

    if (!roles.includes(req.user.role)) {
      sendError(res, 'You do not have permission to perform this action', 403);
      return;
    }

    next();
  };
}

/**
 * Blocks the request if the authenticated user's role profile is still
 * waiting for admin approval. Mirrors what the login response signals via
 * `pendingApproval: true` — these users can hit /auth/me + the profile read
 * endpoints (which don't use this middleware) but not act on the platform.
 *
 * For STORE_OWNER: checks Store.status. For DRIVER: checks Driver.status.
 * For other roles: pass-through.
 *
 * Must be used AFTER authenticate (relies on req.user).
 */
export async function requireApproved(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    sendError(res, 'Authentication required', 401);
    return;
  }
  try {
    if (req.user.role === 'STORE_OWNER') {
      const store = await prisma.store.findUnique({
        where: { ownerId: req.user.id },
        select: { status: true },
      });
      // No store yet = still in onboarding; can't act on the platform either.
      if (!store || store.status === 'PENDING_APPROVAL') {
        sendError(res, 'Your store is awaiting admin approval.', 403);
        return;
      }
      if (store.status === 'SUSPENDED') {
        sendError(res, 'Your store has been suspended.', 403);
        return;
      }
    } else if (req.user.role === 'DRIVER') {
      const driver = await prisma.driver.findUnique({
        where: { userId: req.user.id },
        select: { status: true },
      });
      if (!driver || driver.status === 'PENDING_APPROVAL') {
        sendError(res, 'Your driver account is awaiting admin approval.', 403);
        return;
      }
      if (driver.status === 'SUSPENDED') {
        sendError(res, 'Your driver account has been suspended.', 403);
        return;
      }
    }
    next();
  } catch (err) {
    console.error('[Auth] requireApproved error:', err);
    sendError(res, 'Authorization check failed', 500);
  }
}

/**
 * Like authenticate but does not fail when no token is present.
 * Sets req.user if a valid token is found.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.id, role: payload.role, phone: payload.phone };
  } catch {
    // Ignore invalid tokens in optional auth
  }

  next();
}
