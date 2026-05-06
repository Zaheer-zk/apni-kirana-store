import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { verifyAccessToken } from '../utils/jwt';
import { sendError } from '../utils/response';

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
