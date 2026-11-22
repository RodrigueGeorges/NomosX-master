/**
 * Signed newsletter unsubscribe links.
 *
 * GET /api/newsletter/unsubscribe must not accept a bare ?email= — anyone
 * could mass-unsubscribe arbitrary addresses (GET bypasses CSRF). Links now
 * carry an HMAC signature over the normalized email; the route verifies it
 * with a constant-time compare. The subscriber confirmToken path remains
 * supported for tokenized links.
 */

import { createHmac, timingSafeEqual } from 'crypto';

const SECRET =
  process.env.NEWSLETTER_UNSUBSCRIBE_SECRET ||
  process.env.JWT_SECRET ||
  '';

function normalize(email: string): string {
  return email.toLowerCase().trim();
}

export function unsubscribeSignature(email: string): string {
  return createHmac('sha256', SECRET).update(normalize(email)).digest('hex').slice(0, 32);
}

export function unsubscribeUrl(email: string, appUrl: string): string {
  const e = encodeURIComponent(email);
  return `${appUrl}/api/newsletter/unsubscribe?email=${e}&sig=${unsubscribeSignature(email)}`;
}

export function verifyUnsubscribeSignature(email: string, sig: string | null): boolean {
  if (!SECRET || !sig) return false;
  const expected = unsubscribeSignature(email);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
