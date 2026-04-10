/**
 * Redis Cache Service
 * Provides caching for embeddings, LLM responses, and API calls
 * P1-FIX: Delegates to simpleRedisManager (single connection, no duplication)
 */

import { simpleRedisManager } from '../agent/redis-simple';

/**
 * Generate cache key from any object
 */
function generateCacheKey(prefix: string, data: any): string {
  // Simple hash without crypto (Edge Runtime compatible)
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `${prefix}:${Math.abs(hash).toString(36).slice(0, 16)}`;
}

/**
 * Cache embedding vector
 */
export async function cacheEmbedding(
  text: string,
  model: string,
  embedding: number[]
): Promise<void> {
  const key = generateCacheKey("emb", { text, model });
  await simpleRedisManager.setWithTTL(key, embedding, 30 * 24 * 60 * 60);
}

/**
 * Get cached embedding
 */
export async function getCachedEmbedding(
  text: string,
  model: string
): Promise<number[] | null> {
  const key = generateCacheKey("emb", { text, model });
  return simpleRedisManager.get<number[]>(key);
}

/**
 * Cache LLM response (semantic cache)
 */
export async function cacheLLMResponse(
  prompt: string,
  model: string,
  response: any,
  ttl: number = 7 * 24 * 60 * 60 // 7 days default
): Promise<void> {
  const key = generateCacheKey("llm", { prompt, model });
  await simpleRedisManager.setWithTTL(key, response, ttl);
}

/**
 * Get cached LLM response
 */
export async function getCachedLLMResponse(
  prompt: string,
  model: string
): Promise<any | null> {
  const key = generateCacheKey("llm", { prompt, model });
  const cached = await simpleRedisManager.get<any>(key);
  if (cached) console.log("✅ Cache hit for LLM response");
  return cached;
}

/**
 * Cache generic API response
 */
export async function cacheAPIResponse(
  cacheKey: string,
  data: any,
  ttl: number = 24 * 60 * 60 // 24 hours default
): Promise<void> {
  await simpleRedisManager.setWithTTL(cacheKey, data, ttl);
}

/**
 * Get cached API response
 */
export async function getCachedAPIResponse(cacheKey: string): Promise<any | null> {
  return simpleRedisManager.get<any>(cacheKey);
}

/**
 * Invalidate cache by pattern
 */
export async function invalidateCacheByPattern(pattern: string): Promise<number> {
  const keys = await simpleRedisManager.scanKeys(pattern, 100);
  if (keys.length > 0) {
    let deleted = 0;
    for (const key of keys) {
      if (await simpleRedisManager.delete(key)) deleted++;
    }
    return deleted;
  }
  return 0;
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  connected: boolean;
  keyCount: number;
  memoryUsage: string;
} | null> {
  if (!simpleRedisManager.isRedisConnected()) return null;
  return { connected: true, keyCount: 0, memoryUsage: "delegated" };
}

/**
 * Close Redis connection (for cleanup)
 */
export async function closeRedisConnection(): Promise<void> {
  await simpleRedisManager.disconnect();
}
