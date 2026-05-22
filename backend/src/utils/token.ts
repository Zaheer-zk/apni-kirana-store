import { randomBytes, createHash } from 'node:crypto';

/**
 * Mints a password-reset token. The `raw` value is emailed to the user inside
 * the reset link; only `hash` is persisted, so a database leak can't be used
 * to reset accounts.
 */
export function generateResetToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('hex');
  return { raw, hash: hashToken(raw) };
}

/** SHA-256 of a raw token — used to look a token up without storing it. */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
