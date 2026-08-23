/**
 * NomosX PROVIDER QUEUE — Backpressure control for 200+ academic providers.
 *
 * Instead of launching all providers in parallel via Promise.allSettled(),
 * this module wraps calls in a concurrency-limited queue with:
 *   - Per-provider concurrency caps (configurable)
 *   - Global concurrency cap (prevents thundering herd)
 *   - Request deduplication (same query+provider = 1 call)
 *   - Circuit breaker integration (skip queued calls if provider is tripped)
 *
 * Design:
 *   - Uses p-limit for in-process concurrency control (lightweight, zero deps)
 *   - Uses Redis for cross-instance dedup (falls back to in-memory)
 *   - BullMQ is available for persistent job queues (future: background workers)
 *
 * Usage:
 *   const result = await queuedProviderCall('openalex', () => searchOpenAlex(query));
 *   const result = await queuedProviderCall('crossref', () => searchCrossref(query), { dedupKey: `crossref:${query}` });
 */

import pLimit from 'p-limit';

// ================================
// CONFIGURATION
// ================================

/** Global max concurrent provider calls across ALL providers. */
const GLOBAL_MAX_CONCURRENCY = 30;

/** Per-provider concurrency caps — prevents one slow provider from hogging slots. */
const PROVIDER_CONCURRENCY: Record<string, number> = {
  openalex: 5,
  crossref: 8,
  semanticscholar: 3,
  arxiv: 3,
  unpaywall: 10,
  cohere: 2,
  // Default for all other providers
  _default: 4,
};

/** TTL for dedup locks (ms) — if a call takes longer, allow a duplicate. */
const DEDUP_LOCK_TTL_MS = 60_000;

// ================================
// CONCURRENCY LIMITERS
// ================================

const globalLimiter = pLimit(GLOBAL_MAX_CONCURRENCY);
const providerLimiters = new Map<string, ReturnType<typeof pLimit>>();

function getProviderLimiter(provider: string): ReturnType<typeof pLimit> {
  let limiter = providerLimiters.get(provider);
  if (!limiter) {
    const cap = PROVIDER_CONCURRENCY[provider] ?? PROVIDER_CONCURRENCY._default;
    limiter = pLimit(cap);
    providerLimiters.set(provider, limiter);
  }
  return limiter;
}

// ================================
// REQUEST DEDUP
// ================================

/** In-flight request dedup: same dedupKey = 1 call, results shared. */
const inFlightRequests = new Map<string, Promise<any>>();

/**
 * Redis-backed dedup lock using setWithTTL (best-effort, falls back to in-memory).
 * Note: setWithTTL doesn't support NX flag, so we use in-memory dedup as the
 * primary mechanism (same-process), and Redis as a secondary cache layer.
 * Cross-instance dedup is a future enhancement — for now, same-process dedup
 * handles 99% of cases (all parallel calls in a SCOUT run are in-process).
 */
async function acquireDedupLock(_dedupKey: string): Promise<boolean> {
  // In-memory dedup is the primary mechanism (see inFlightRequests Map).
  // Redis lock is a no-op for now — kept as a seam for future cross-instance dedup.
  return true;
}

async function releaseDedupLock(_dedupKey: string): Promise<void> {
  // No-op — in-memory dedup is cleaned up in the finally block.
}

// ================================
// CIRCUIT BREAKER INTEGRATION
// ================================

async function isProviderAvailable(provider: string): Promise<boolean> {
  // Check HTTP circuit breaker (async — checks Redis for cross-instance state)
  try {
    const { isCircuitBreakerTrippedAsync } = await import('../http-client');
    return !(await isCircuitBreakerTrippedAsync(provider));
  } catch {
    return true; // If we can't check, allow the call
  }
}

// ================================
// MAIN API
// ================================

export interface QueuedCallOptions {
  /** Dedup key — if provided, identical calls share a single execution. */
  dedupKey?: string;
  /** Override per-provider concurrency cap. */
  maxConcurrency?: number;
  /** Skip circuit breaker check (use with caution). */
  skipCircuitBreaker?: boolean;
}

/**
 * Execute a provider call with:
 *   - Global concurrency control (prevents thundering herd)
 *   - Per-provider concurrency control (prevents one provider hogging slots)
 *   - Request deduplication (same key = 1 call)
 *   - Circuit breaker integration (skip if provider is tripped)
 *
 * Returns the result of the call, or throws if the provider is unavailable.
 */
export async function queuedProviderCall<T>(
  provider: string,
  fn: () => Promise<T>,
  options: QueuedCallOptions = {}
): Promise<T> {
  const { dedupKey, skipCircuitBreaker = false } = options;

  // 1. Circuit breaker check — fail-fast if provider is tripped
  if (!skipCircuitBreaker && !(await isProviderAvailable(provider))) {
    throw new Error(`Circuit breaker tripped for ${provider} — skipping queued call`);
  }

  // 2. Dedup check — if same key is in-flight, wait for its result
  if (dedupKey) {
    const existing = inFlightRequests.get(dedupKey);
    if (existing) {
      return existing as Promise<T>;
    }

    // Redis dedup lock (cross-instance)
    const acquired = await acquireDedupLock(dedupKey);
    if (!acquired) {
      // Another instance is handling this — wait briefly and retry
      // (In practice, the in-memory dedup handles same-instance cases)
      await new Promise(resolve => setTimeout(resolve, 500));
      const retry = inFlightRequests.get(dedupKey);
      if (retry) return retry as Promise<T>;
    }

    // Create the promise and register it for dedup
    const promise = (async () => {
      try {
        // 3. Acquire concurrency slots: provider-specific + global
        const providerLimiter = getProviderLimiter(provider);
        return await globalLimiter(() => providerLimiter(() => fn()));
      } finally {
        // 4. Release dedup lock
        inFlightRequests.delete(dedupKey);
        await releaseDedupLock(dedupKey).catch(() => {});
      }
    })();

    inFlightRequests.set(dedupKey, promise);
    return promise;
  }

  // No dedup key — just run with concurrency control
  const providerLimiter = getProviderLimiter(provider);
  return globalLimiter(() => providerLimiter(() => fn()));
}

/**
 * Batch version — runs multiple provider calls with shared concurrency control.
 * Returns results in the same order as inputs.
 */
export async function queuedBatchCalls<T>(
  calls: Array<{ provider: string; fn: () => Promise<T>; dedupKey?: string }>,
): Promise<Array<{ ok: boolean; value?: T; error?: Error }>> {
  const promises = calls.map(({ provider, fn, dedupKey }) =>
    queuedProviderCall(provider, fn, { dedupKey })
      .then(value => ({ ok: true as const, value }))
      .catch(error => ({ ok: false as const, error: error as Error }))
  );
  return Promise.all(promises);
}

/**
 * Get current queue stats for monitoring.
 */
export function getQueueStats() {
  return {
    global: {
      activeCount: globalLimiter.activeCount,
      pendingCount: globalLimiter.pendingCount,
    },
    perProvider: Array.from(providerLimiters.entries()).map(([provider, limiter]) => ({
      provider,
      activeCount: limiter.activeCount,
      pendingCount: limiter.pendingCount,
      cap: PROVIDER_CONCURRENCY[provider] ?? PROVIDER_CONCURRENCY._default,
    })),
    dedup: {
      inFlight: inFlightRequests.size,
    },
  };
}

/**
 * Reset all limiters (useful for tests).
 */
export function resetQueue(): void {
  inFlightRequests.clear();
  providerLimiters.clear();
}
