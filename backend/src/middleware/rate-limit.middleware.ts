// Rate limiting. Keyed by client IP.
//
// NOTE: behind a reverse proxy (nginx in the domain deployment), add
// `app.set('trust proxy', 1)` in index.ts so req.ip is the real client IP and
// not the proxy. The current IP-only deployment has no proxy, so it's omitted.

import rateLimit from 'express-rate-limit';

// Generous global cap — blocks blunt abuse without affecting normal traffic.
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env['NODE_ENV'] === 'test', // integration tests hammer these
  message: { success: false, error: 'Too many requests. Please try again later.' },
});

// Strict cap for OTP endpoints. `/send-otp` is an SMS-cost amplifier and
// `/verify-otp` is brute-forceable — 10 attempts per IP per 15 min. The
// per-OTP guess cap lives in utils/otp.ts (per phone).
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env['NODE_ENV'] === 'test', // integration tests hammer these
  message: { success: false, error: 'Too many OTP requests. Please wait a few minutes and try again.' },
});
