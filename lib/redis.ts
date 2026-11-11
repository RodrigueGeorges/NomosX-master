import Redis from 'ioredis';

declare global {
  var __redis: Redis | null | undefined;
}

/**
 * Redis client with fallback for development
 * Uses Upstash Redis in production, local Redis in development
 */
function getRedisClient(): Redis {
  // Production: Upstash Redis via rediss:// TCP endpoint (not REST URL)
  // UPSTASH_REDIS_URL must be the rediss:// endpoint, not the REST URL
  if (process.env.UPSTASH_REDIS_URL) {
    return new Redis(process.env.UPSTASH_REDIS_URL, {
      tls: {},
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
  
  // Production REST fallback: only UPSTASH_REDIS_REST_* credentials exist
  // (no rediss:// TCP endpoint) — serve the small cache surface over the
  // Upstash HTTP API instead of silently disabling caching.
  const restUrl = process.env.UPSTASH_REDIS_REST_URL;
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (restUrl && restToken) {
    const { createUpstashRestClient } = require('./agent/redis-rest');
    return createUpstashRestClient(restUrl, restToken) as unknown as Redis;
  }

  // Development/Fallback: Local Redis
  if (process.env.REDIS_URL) {
    return new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
  
  // No Redis available - return null
  return null as any;
}

// Singleton Redis client
const redisClientSingleton = () => {
  const client = getRedisClient();
  if (!client) {
    console.warn('⚠️ Redis not configured - caching disabled');
    return null;
  }
  return client;
};

export const redis = globalThis.__redis ?? redisClientSingleton();

// Default export for compatibility
export default redis;

// Singleton in dev to prevent hot-reload connection leaks
if (process.env.NODE_ENV !== "production") {
  globalThis.__redis = redis;
}

// Graceful shutdown - disconnect on exit
if (redis && typeof window === 'undefined') {
  const gracefulShutdown = async (sig: 'SIGINT' | 'SIGTERM') => {
    if (redis && redis.status === 'ready') {
      await redis.quit();
    }
    // If another handler owns shutdown (e.g. the pipeline worker releases the
    // job lock before exiting), let it decide when the process exits.
    if (process.listenerCount(sig) > 1) return;
    process.exit(0);
  };
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

// Helper functions for caching
export const cacheHelpers = {
  // Set cache with TTL
  async set(key: string, value: any, ttl: number = 3600): Promise<boolean> {
    if (!redis) return false;
    
    try {
      await redis.setex(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  },
  
  // Get cache
  async get<T>(key: string): Promise<T | null> {
    if (!redis) return null;
    
    try {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  },
  
  // Delete cache
  async del(key: string): Promise<boolean> {
    if (!redis) return false;
    
    try {
      await redis.del(key);
      return true;
    } catch (error) {
      console.error('Cache del error:', error);
      return false;
    }
  },
  
  // Clear all cache (use with caution)
  async flush(): Promise<boolean> {
    if (!redis) return false;
    
    try {
      await redis.flushdb();
      return true;
    } catch (error) {
      console.error('Cache flush error:', error);
      return false;
    }
  },
  
  // Check if Redis is available
  async ping(): Promise<boolean> {
    if (!redis) return false;
    
    try {
      const result = await redis.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('Redis ping error:', error);
      return false;
    }
  },
  
  // Rate limiting
  async rateLimit(key: string, limit: number, window: number): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    if (!redis) {
      return { allowed: true, remaining: limit - 1, resetTime: Date.now() + window * 1000 };
    }
    
    try {
      const current = await redis.incr(key);
      if (current === 1) {
        await redis.expire(key, window);
      }
      
      const allowed = current <= limit;
      const remaining = Math.max(0, limit - current);
      const ttl = await redis.ttl(key);
      const resetTime = Date.now() + (ttl * 1000);
      
      return { allowed, remaining, resetTime };
    } catch (error) {
      console.error('Rate limit error:', error);
      return { allowed: true, remaining: limit - 1, resetTime: Date.now() + window * 1000 };
    }
  }
};
