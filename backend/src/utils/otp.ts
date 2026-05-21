import { randomInt } from 'node:crypto';
import { redis } from '../config/redis';

const OTP_EXPIRES_IN_SECONDS = 300; // 5 minutes
const OTP_KEY_PREFIX = 'otp:';
const ATTEMPTS_KEY_PREFIX = 'otp-attempts:';
const MAX_OTP_ATTEMPTS = 5; // wrong guesses before the OTP is burned

/**
 * Generates a cryptographically-random 6-digit OTP string.
 */
export function generateOtp(): string {
  return randomInt(100000, 1000000).toString();
}

/**
 * Stores OTP in Redis with TTL and resets the failed-attempt counter.
 */
export async function storeOtp(phone: string, otp: string): Promise<void> {
  const key = `${OTP_KEY_PREFIX}${phone}`;
  await redis.set(key, otp, 'EX', OTP_EXPIRES_IN_SECONDS);
  await redis.del(`${ATTEMPTS_KEY_PREFIX}${phone}`);
}

/**
 * Retrieves and verifies OTP from Redis. Returns true if valid (and deletes
 * the key — one-time use). After MAX_OTP_ATTEMPTS wrong guesses the OTP is
 * burned, so a 6-digit code can't be brute-forced within its 5-minute life.
 */
export async function verifyOtp(phone: string, otp: string): Promise<boolean> {
  const key = `${OTP_KEY_PREFIX}${phone}`;
  const attemptsKey = `${ATTEMPTS_KEY_PREFIX}${phone}`;

  const stored = await redis.get(key);
  if (!stored) return false; // expired, never issued, or already burned

  if (stored !== otp) {
    const attempts = await redis.incr(attemptsKey);
    await redis.expire(attemptsKey, OTP_EXPIRES_IN_SECONDS);
    if (attempts >= MAX_OTP_ATTEMPTS) {
      await redis.del(key); // too many wrong guesses — burn it
    }
    return false;
  }

  await redis.del(key);
  await redis.del(attemptsKey);
  return true;
}
