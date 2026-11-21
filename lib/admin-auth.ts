import { NextRequest } from 'next/server';
import { env } from '@/lib/env';

/** Dependency-free constant-time string compare (edge-safe, no node:crypto). */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Admin auth: x-admin-key header ONLY, constant-time compared.
 * The ?key= query-param fallback is deliberately gone — query strings are
 * written to access logs and proxy history, leaking the credential.
 */
export function isAdminRequest(req: NextRequest): boolean {
  const key = req.headers.get('x-admin-key');
  const expected = env.ADMIN_KEY;
  return !!expected && !!key && constantTimeEqual(key, expected);
}
