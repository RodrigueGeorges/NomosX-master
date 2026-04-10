/**
 * Cache Layer for NomosX
 * 
 * Provides unified caching interface with Redis + in-memory fallback
 * Supports different cache strategies and TTL configurations
 */

import Redis from 'ioredis';
import { createHash } from 'crypto';

// Cache configuration
export interface CacheConfig {
  ttl?: number; // Time to live in seconds
  prefix?: string; // Key prefix
  strategy?: 'memory' | 'redis' | 'hybrid'; // Cache strategy
}

// Cache entry interface
export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  version: number;
}

// Cache statistics
export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
  hitRate: number;
  memoryUsage: number;
  redisConnected: boolean;
}

// Default configurations
const DEFAULT_TTL = 3600; // 1 hour
const DEFAULT_PREFIX = 'nomosx:';
const MEMORY_CACHE_LIMIT = 1000; // Max entries in memory cache

// In-memory cache fallback
class MemoryCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;

  constructor(maxSize = MEMORY_CACHE_LIMIT) {
    this.maxSize = maxSize;
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl * 1000) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set<T>(key: string, data: T, ttl = DEFAULT_TTL): void {
    // Implement LRU eviction if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
      version: 1,
    });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  // Get memory usage estimate
  getMemoryUsage(): number {
    let totalSize = 0;
    for (const [key, entry] of this.cache.entries()) {
      totalSize += key.length * 2; // String size estimate
      totalSize += JSON.stringify(entry).length * 2; // Entry size estimate
    }
    return totalSize;
  }
}

// Main cache class
export class Cache {
  private redis: Redis | null = null;
  private memoryCache: MemoryCache;
  private config: CacheConfig;
  private stats: CacheStats;
  private isRedisConnected = false;

  constructor(config: CacheConfig = {}) {
    this.config = {
      ttl: DEFAULT_TTL,
      prefix: DEFAULT_PREFIX,
      strategy: 'hybrid',
      ...config,
    };

    this.memoryCache = new MemoryCache();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      hitRate: 0,
      memoryUsage: 0,
      redisConnected: false,
    };

    this.initializeRedis();
  }

  private async initializeRedis(): Promise<void> {
    try {
      // Try Redis connection
      const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
      
      if (redisUrl) {
        this.redis = new Redis(redisUrl, {
          maxRetriesPerRequest: 3,
          lazyConnect: true,
        });

        // Test connection
        await this.redis.ping();
        this.isRedisConnected = true;
        this.stats.redisConnected = true;

        console.log('✅ Cache: Redis connected successfully');
      } else {
        console.warn('⚠️ Cache: No Redis URL found, using memory-only cache');
      }
    } catch (error) {
      console.warn('⚠️ Cache: Redis connection failed, using memory fallback:', error);
      this.isRedisConnected = false;
      this.stats.redisConnected = false;
    }
  }

  private getKey(key: string): string {
    const hash = createHash('md5').update(key).digest('hex');
    return `${this.config.prefix}${hash}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.getKey(key);

    try {
      // Try Redis first if connected and strategy allows
      if (this.isRedisConnected && this.config.strategy !== 'memory') {
        const cached = await this.redis!.get(fullKey);
        if (cached) {
          this.stats.hits++;
          this.updateHitRate();
          return JSON.parse(cached);
        }
      }

      // Fallback to memory cache
      if (this.config.strategy !== 'redis') {
        const memoryResult = this.memoryCache.get<T>(fullKey);
        if (memoryResult) {
          this.stats.hits++;
          this.updateHitRate();
          
          // If Redis failed but we have memory data, try to restore Redis
          if (!this.isRedisConnected && this.config.strategy === 'hybrid') {
            await this.initializeRedis();
          }
          
          return memoryResult;
        }
      }

      this.stats.misses++;
      this.updateHitRate();
      return null;
    } catch (error) {
      this.stats.errors++;
      console.error('Cache get error:', error);
      return null;
    }
  }

  async set<T>(key: string, data: T, ttl?: number): Promise<void> {
    const fullKey = this.getKey(key);
    const actualTtl = ttl || this.config.ttl || DEFAULT_TTL;

    try {
      // Set in memory cache if strategy allows
      if (this.config.strategy !== 'redis') {
        this.memoryCache.set(fullKey, data, actualTtl);
      }

      // Set in Redis if connected and strategy allows
      if (this.isRedisConnected && this.config.strategy !== 'memory') {
        const serialized = JSON.stringify(data);
        await this.redis!.setex(fullKey, actualTtl, serialized);
      }

      this.stats.sets++;
    } catch (error) {
      this.stats.errors++;
      console.error('Cache set error:', error);
    }
  }

  async delete(key: string): Promise<void> {
    const fullKey = this.getKey(key);

    try {
      // Delete from memory cache
      this.memoryCache.delete(fullKey);

      // Delete from Redis
      if (this.isRedisConnected && this.config.strategy !== 'memory') {
        await this.redis!.del(fullKey);
      }

      this.stats.deletes++;
    } catch (error) {
      this.stats.errors++;
      console.error('Cache delete error:', error);
    }
  }

  async clear(): Promise<void> {
    try {
      // Clear memory cache
      this.memoryCache.clear();

      // Clear Redis cache (only keys with our prefix)
      if (this.isRedisConnected && this.config.strategy !== 'memory') {
        const pattern = `${this.config.prefix}*`;
        const keys = await this.redis!.keys(pattern);
        if (keys.length > 0) {
          await this.redis!.del(...keys);
        }
      }
    } catch (error) {
      this.stats.errors++;
      console.error('Cache clear error:', error);
    }
  }

  async exists(key: string): Promise<boolean> {
    const fullKey = this.getKey(key);

    try {
      // Check Redis first
      if (this.isRedisConnected && this.config.strategy !== 'memory') {
        const exists = await this.redis!.exists(fullKey);
        if (exists) return true;
      }

      // Check memory cache
      if (this.config.strategy !== 'redis') {
        return this.memoryCache.get(fullKey) !== null;
      }

      return false;
    } catch (error) {
      this.stats.errors++;
      console.error('Cache exists error:', error);
      return false;
    }
  }

  // Cache warming utilities
  async warm<T>(entries: Array<{ key: string; data: T; ttl?: number }>): Promise<void> {
    const promises = entries.map(entry => 
      this.set(entry.key, entry.data, entry.ttl)
    );
    
    await Promise.allSettled(promises);
  }

  // Cache invalidation utilities
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      // For memory cache, we need to iterate through keys
      if (this.config.strategy !== 'redis') {
        const keys = this.memoryCache.keys();
        const regex = new RegExp(pattern);
        for (const key of keys) {
          if (regex.test(key)) {
            this.memoryCache.delete(key);
          }
        }
      }

      // For Redis, we can use KEYS pattern
      if (this.isRedisConnected && this.config.strategy !== 'memory') {
        const fullPattern = `${this.config.prefix}*${pattern}*`;
        const keys = await this.redis!.keys(fullPattern);
        if (keys.length > 0) {
          await this.redis!.del(...keys);
        }
      }
    } catch (error) {
      this.stats.errors++;
      console.error('Cache invalidate pattern error:', error);
    }
  }

  // Statistics
  getStats(): CacheStats {
    this.stats.memoryUsage = this.memoryCache.getMemoryUsage();
    this.stats.redisConnected = this.isRedisConnected;
    this.updateHitRate();
    
    return { ...this.stats };
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  // Health check
  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; details: any }> {
    const stats = this.getStats();
    const testKey = 'health-check-test';
    
    try {
      // Test cache operations
      await this.set(testKey, 'test-value', 10);
      const retrieved = await this.get<string>(testKey);
      await this.delete(testKey);

      const isWorking = retrieved === 'test-value';
      
      if (!isWorking) {
        return {
          status: 'unhealthy',
          details: { stats, error: 'Cache operations failed' }
        };
      }

      if (!this.isRedisConnected && this.config.strategy !== 'memory') {
        return {
          status: 'degraded',
          details: { stats, warning: 'Redis not connected, using memory fallback' }
        };
      }

      return {
        status: 'healthy',
        details: { stats }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { stats, error: (error as any).message }
      };
    }
  }

  // Cleanup
  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.isRedisConnected = false;
    }
  }
}

// Default cache instance
export const defaultCache = new Cache({
  ttl: DEFAULT_TTL,
  prefix: DEFAULT_PREFIX,
  strategy: 'hybrid',
});

// Cache factory for different configurations
export function createCache(config: CacheConfig): Cache {
  return new Cache(config);
}

// Predefined cache configurations
export const cacheConfigs = {
  // Short-term cache for frequently changing data
  short: {
    ttl: 300, // 5 minutes
    prefix: 'nomosx:short:',
    strategy: 'hybrid' as const,
  },
  
  // Medium-term cache for user sessions
  medium: {
    ttl: 1800, // 30 minutes
    prefix: 'nomosx:medium:',
    strategy: 'hybrid' as const,
  },
  
  // Long-term cache for static data
  long: {
    ttl: 86400, // 24 hours
    prefix: 'nomosx:long:',
    strategy: 'hybrid' as const,
  },
  
  // Memory-only cache for sensitive data
  memory: {
    ttl: 3600, // 1 hour
    prefix: 'nomosx:memory:',
    strategy: 'memory' as const,
  },
  
  // Redis-only cache for distributed systems
  redis: {
    ttl: 7200, // 2 hours
    prefix: 'nomosx:redis:',
    strategy: 'redis' as const,
  },
};

// Utility functions for common cache operations
export const cacheUtils = {
  // Cache API responses
  async cacheApiResponse<T>(
    key: string, 
    fetcher: () => Promise<T>, 
    ttl?: number
  ): Promise<T> {
    const cached = await defaultCache.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const data = await fetcher();
    await defaultCache.set(key, data, ttl);
    return data;
  },

  // Cache with automatic refresh
  async cacheWithRefresh<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number,
    refreshThreshold = 0.8 // Refresh when 80% of TTL has passed
  ): Promise<T> {
    const cached = await defaultCache.get<T>(key);
    
    if (cached !== null) {
      // Check if we should refresh in background
      const entry = await defaultCache.get<CacheEntry<T>>(`${key}:meta`);
      if (entry && Date.now() - entry.timestamp > entry.ttl * refreshThreshold * 1000) {
        // Refresh in background without waiting
        fetcher().then(data => {
          defaultCache.set(key, data, ttl);
        }).catch(error => {
          console.error('Background cache refresh failed:', error);
        });
      }
      
      return cached;
    }

    const data = await fetcher();
    await defaultCache.set(key, data, ttl);
    return data;
  },

  // Invalidate multiple keys by pattern
  async invalidateByPattern(pattern: string): Promise<void> {
    return defaultCache.invalidatePattern(pattern);
  },

  // Get cache statistics
  async getStats(): Promise<CacheStats> {
    return defaultCache.getStats();
  },

  // Health check
  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; details: any }> {
    return defaultCache.healthCheck();
  },
};
