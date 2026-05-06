import { redis } from '../config/redis';

const OTP_EXPIRES_IN_SECONDS = 300; // 5 minutes
const OTP_KEY_PREFIX = 'otp:';

/**
 * Generates a random 6-digit OTP string.
 */
export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Stores OTP in Redis with TTL.
 */
export async function storeOtp(phone: string, otp: string): Promise<void> {
  const key = `${OTP_KEY_PREFIX}${phone}`;
  await redis.set(key, otp, 'EX', OTP_EXPIRES_IN_SECONDS);
}

/**
 * Retrieves and verifies OTP from Redis.
 * Returns true if valid. Deletes the key on success (one-time use).
 */
export async function verifyOtp(phone: string, otp: string): Promise<boolean> {
  const key = `${OTP_KEY_PREFIX}${phone}`;
  const stored = await redis.get(key);

  if (!stored || stored !== otp) {
    return false;
  }

  await redis.del(key);
  return true;
}
