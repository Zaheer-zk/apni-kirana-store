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

// Excludes visually ambiguous characters (0/O, 1/l/I) so a temp password read
// off a screen or phone call can't be mistyped.
const TEMP_PW_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/**
 * Generates a human-readable temporary password for admin-created accounts.
 * The user is forced to change it on first login.
 */
export function generateTempPassword(length = 10): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += TEMP_PW_ALPHABET[bytes[i]! % TEMP_PW_ALPHABET.length];
  }
  return out;
}
