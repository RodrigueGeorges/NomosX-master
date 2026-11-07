/**
 * CSRF Protection for Next.js API routes.
 *
 * Strategy: Origin/Referer header validation.
 * - Checks that mutation requests (POST/PUT/PATCH/DELETE) come from our own origin.
 * - Lightweight alternative to token-based CSRF (no state needed).
 * - sameSite=lax cookies already block most CSRF, this adds defense-in-depth.
 *
 * Usage in API routes:
 *   import { assertCsrf } from '@/lib/security/csrf';
 *   assertCsrf(req); // throws CsrfError if invalid
 */

import { NextRequest } from 'next/server';
import { safeCompare } from './timing-safe';

export class CsrfError extends Error {
  constructor() {
    super("CSRF validation failed");
    this.name = "CsrfError";
  }
}

/**
 * Allowed origins for CSRF validation.
 * Includes localhost for development and the production URL.
 */
function getAllowedOrigins(): string[] {
  const origins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];

  if (process.env.NEXT_PUBLIC_APP_URL) {
    origins.push(process.env.NEXT_PUBLIC_APP_URL);
  }

  // Also allow the Netlify deploy URL pattern
  if (process.env.URL) {
    origins.push(process.env.URL);
  }

  return origins;
}

/**
 * Assert CSRF protection on a mutation request.
 * Safe methods (GET, HEAD, OPTIONS) are always allowed.
 * 
 * @throws CsrfError if the request origin doesn't match allowed origins
 */
export function assertCsrf(req: NextRequest): void {
  const method = req.method.toUpperCase();

  // Safe methods don't need CSRF protection
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return;

  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');

  // If no origin AND no referer, block (could be a direct form submission from another site)
  // Exception: only internal routes (cron/webhooks) may bypass with dedicated headers
  if (!origin && !referer) {
    const { pathname } = new URL(req.url);
    const isInternalRoute = pathname.startsWith('/api/cron/') || pathname.startsWith('/api/webhooks/');
    if (isInternalRoute) {
      // x-admin-key bypasses CSRF only when it matches ADMIN_KEY — a bare
      // presence check was a forgeable bypass. Authorization presence is
      // still allowed: cron/webhook routes verify their own Bearer secret.
      const hasValidAdminKey = safeCompare(req.headers.get('x-admin-key'), process.env.ADMIN_KEY);
      const hasAuth = req.headers.get('authorization');
      if (hasValidAdminKey || hasAuth) return;
    }

    throw new CsrfError();
  }

  const allowedOrigins = getAllowedOrigins();

  // Check origin header first (most reliable)
  if (origin) {
    if (allowedOrigins.some(allowed => origin === allowed)) return;
    throw new CsrfError();
  }

  // Fallback to referer header
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const refererOrigin = refererUrl.origin;
      if (allowedOrigins.some(allowed => refererOrigin === allowed)) return;
    } catch {
      // Invalid referer URL
    }
    throw new CsrfError();
  }

  throw new CsrfError();
}
