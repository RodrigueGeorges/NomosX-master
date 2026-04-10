/**
 * Rate Limiting Middleware
 * 
 * Simple in-memory rate limiter for API endpoints
 * For production with multiple instances, use Redis (Upstash)
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store (use Redis in production)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

export interface RateLimitConfig {
  /**
   * Maximum number of requests allowed in the window
   */
  limit: number;
  
  /**
   * Time window in seconds
   */
  windowSeconds: number;
  
  /**
   * Custom identifier (default: IP address)
   */
  identifier?: string;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

/**
 * Check rate limit for a request
 * 
 * @param identifier - Unique identifier (IP, user ID, API key)
 * @param config - Rate limit configuration
 * @returns Rate limit result
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const key = `${identifier}:${config.limit}:${config.windowSeconds}`;

  let entry = rateLimitStore.get(key);

  // Create new entry if doesn't exist or expired
  if (!entry || entry.resetAt < now) {
    entry = {
      count: 0,
      resetAt: now + windowMs,
    };
    rateLimitStore.set(key, entry);
  }

  // Increment count
  entry.count++;

  const remaining = Math.max(0, config.limit - entry.count);
  const success = entry.count <= config.limit;

  return {
    success,
    limit: config.limit,
    remaining,
    reset: entry.resetAt,
  };
}

/**
 * Rate limit middleware for Next.js API routes
 * 
 * Usage:
 * ```typescript
 * export async function GET(req: NextRequest) {
 *   const rateLimitResult = await rateLimit(req, { limit: 100, windowSeconds: 60 });
 *   if (!rateLimitResult.success) {
 *     return NextResponse.json(
 *       { error: "Too many requests" },
 *       { 
 *         status: 429,
 *         headers: {
 *           'X-RateLimit-Limit': rateLimitResult.limit.toString(),
 *           'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
 *           'X-RateLimit-Reset': rateLimitResult.reset.toString(),
 *         }
 *       }
 *     );
 *   }
 *   // ... rest of handler
 * }
 * ```
 */
export async function rateLimit(
  req: Request,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  // Get identifier (IP address or custom)
  const identifier = config.identifier || getClientIP(req);
  
  return checkRateLimit(identifier, config);
}

/**
 * Get client IP address from request
 */
function getClientIP(req: Request): string {
  // Try various headers (Netlify, Cloudflare, etc.)
  const headers = req.headers;
  
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  
  const realIP = headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }
  
  const cfConnectingIP = headers.get('cf-connecting-ip');
  if (cfConnectingIP) {
    return cfConnectingIP;
  }
  
  // Fallback
  return 'unknown';
}

/**
 * Create rate limit response headers
 */
export function createRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': result.reset.toString(),
    'Retry-After': Math.ceil((result.reset - Date.now()) / 1000).toString(),
  };
}

/**
 * Preset rate limit configurations
 */
export const RateLimitPresets = {
  /**
   * Strict: 10 requests per minute
   */
  STRICT: { limit: 10, windowSeconds: 60 },
  
  /**
   * Standard: 60 requests per minute
   */
  STANDARD: { limit: 60, windowSeconds: 60 },
  
  /**
   * Generous: 100 requests per minute
   */
  GENEROUS: { limit: 100, windowSeconds: 60 },
  
  /**
   * API: 1000 requests per hour
   */
  API: { limit: 1000, windowSeconds: 3600 },
  
  /**
   * Auth: 5 attempts per 15 minutes
   */
  AUTH: { limit: 5, windowSeconds: 900 },
};
