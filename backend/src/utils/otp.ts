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

const PENDING_ROLE_KEY_PREFIX = 'addrole:';

/**
 * Records that the OTP currently being sent is for ADDING `role` to an
 * existing account (registering an extra role on a known number). Lives as
 * long as the OTP itself.
 */
export async function setPendingRole(phone: string, role: string): Promise<void> {
  await redis.set(`${PENDING_ROLE_KEY_PREFIX}${phone}`, role, 'EX', OTP_EXPIRES_IN_SECONDS);
}

/**
 * Reads and clears a pending role-add for a phone. Returns null when there
 * isn't one — i.e. a normal login, not a role-add.
 */
export async function consumePendingRole(phone: string): Promise<string | null> {
  const key = `${PENDING_ROLE_KEY_PREFIX}${phone}`;
  const role = await redis.get(key);
  if (role) await redis.del(key);
  return role;
}
