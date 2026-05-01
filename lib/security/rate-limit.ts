/**
 * Rate limiting for Next.js API routes.
 *
 * Strategy:
 * 1. Try Redis (ioredis) for serverless-safe distributed rate limiting
 * 2. Fallback to in-memory fixed window if Redis unavailable
 *
 * Redis uses atomic INCR + EXPIRE for correctness across instances.
 */

// ================================
// IN-MEMORY FALLBACK
// ================================

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Cleanup expired buckets every 60s
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets.entries()) {
    if (now >= b.resetAt) buckets.delete(k);
  }
}, 60_000).unref?.();

function assertRateLimitMemory(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const b = buckets.get(key);

  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (b.count >= limit) {
    throw new RateLimitError(b.resetAt - now);
  }

  b.count += 1;
  buckets.set(key, b);
}

// ================================
// REDIS BACKEND
// ================================

let redis: any = null;
let redisAvailable = false;

try {
  if (process.env.REDIS_URL) {
    const Redis = require('ioredis');
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableReadyCheck: false,
      connectTimeout: 2000,
    });
    redis.connect().then(() => {
      redisAvailable = true;
      console.log("[RateLimit] Redis connected");
    }).catch(() => {
      redisAvailable = false;
      console.warn("[RateLimit] Redis unavailable, using in-memory fallback");
    });
    redis.on('error', () => { redisAvailable = false; });
    redis.on('connect', () => { redisAvailable = true; });
  }
} catch {
  console.warn("[RateLimit] Redis not available, using in-memory fallback");
}

async function assertRateLimitRedis(key: string, limit: number, windowMs: number): Promise<void> {
  const redisKey = `rl:${key}`;
  const windowSec = Math.ceil(windowMs / 1000);

  // Atomic INCR + conditional EXPIRE
  const count = await redis.incr(redisKey);
  if (count === 1) {
    await redis.expire(redisKey, windowSec);
  }

  if (count > limit) {
    const ttl = await redis.ttl(redisKey);
    throw new RateLimitError(ttl > 0 ? ttl * 1000 : windowMs);
  }
}

// ================================
// PUBLIC API
// ================================

export class RateLimitError extends Error {
  constructor(public retryAfterMs: number) {
    super("Rate limit exceeded");
    this.name = "RateLimitError";
  }
}

/**
 * Assert rate limit for a given key.
 * Uses Redis if available (awaited for correctness), falls back to in-memory.
 *
 * IMPORTANT: This function is now async. Callers must `await` it.
 * For backward-compatible sync usage, use assertRateLimitSync() which
 * only checks in-memory (suitable for single-instance or as a fast guard).
 */
export async function assertRateLimit(key: string, limit: number, windowMs: number): Promise<void> {
  // Always check in-memory first (instant, no I/O)
  assertRateLimitMemory(key, limit, windowMs);

  // If Redis available, also check/update Redis for distributed consistency
  if (redisAvailable && redis) {
    try {
      await assertRateLimitRedis(key, limit, windowMs);
    } catch (err) {
      if (err instanceof RateLimitError) throw err;
      // Redis failed - in-memory guard already applied, continue
    }
  }
}

/**
 * Sync (non-async) rate limit check — in-memory only.
 * Use this when you can't await (e.g. in non-async middleware).
 * For distributed rate limiting, prefer the async assertRateLimit().
 */
export function assertRateLimitSync(key: string, limit: number, windowMs: number): void {
  assertRateLimitMemory(key, limit, windowMs);
}
