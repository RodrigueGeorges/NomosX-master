/**
 * Timing-safe secret comparison for cron/webhook/admin authentication.
 *
 * Plain `===` on secrets leaks length and prefix via timing side-channels.
 * `crypto.timingSafeEqual` requires equal-length Buffers, so we SHA-256 both
 * sides first — constant-time and length-agnostic.
 */

import { createHash, timingSafeEqual } from 'crypto';

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Constant-time string equality. Safe for comparing secrets.
 * Returns false for null/undefined/empty inputs without throwing.
 */
export function safeCompare(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || b.length === 0) {
    return false;
  }
  return timingSafeEqual(sha256(a), sha256(b));
}

/**
 * Verify an `Authorization: Bearer <secret>` header against an expected secret.
 */
export function verifyBearerToken(authHeader: string | null, expectedSecret: string | undefined): boolean {
  if (!expectedSecret) return false;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const presented = authHeader.slice('Bearer '.length);
  return safeCompare(presented, expectedSecret);
}
