import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import { recordError } from '../utils/error-log';

/**
 * Application-level error class for known operational errors.
 * Carries an HTTP status code alongside the message.
 */
export class AppError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
    // Restore prototype chain (needed when extending built-ins in TS)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Global Express error handler.
 * Must be registered LAST with four parameters so Express recognises it as an error handler.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message =
    err instanceof AppError ? err.message : 'An unexpected error occurred';

  if (config.nodeEnv === 'development') {
    console.error('[Error]', err.stack);
  }

  // Only ring-buffer 5xx — 4xx are client mistakes, not server faults
  if (statusCode >= 500) {
    recordError({
      source: 'request',
      message: err.message || message,
      stack: err.stack,
      method: req.method,
      path: req.originalUrl,
      statusCode,
      userId: req.user?.id,
    });
  }

  res.status(statusCode).json({
    success: false,
    error: message,
  });
}
