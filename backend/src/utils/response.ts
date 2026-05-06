import { Response } from 'express';

export const sendSuccess = (
  res: Response,
  data: unknown,
  message?: string,
  statusCode = 200,
): Response =>
  res.status(statusCode).json({ success: true, data, message });

export const sendError = (
  res: Response,
  message: string,
  statusCode = 500,
): Response =>
  res.status(statusCode).json({ success: false, error: message });
