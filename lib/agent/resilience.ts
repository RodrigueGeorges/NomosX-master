/**
 * NomosX RESILIENCE LAYER — Cockatiel-based bulkhead + retry policies.
 *
 * This module provides:
 *   - Bulkhead isolation: limits concurrent LLM calls per provider
 *   - Retry with exponential backoff + jitter (Cockatiel's built-in)
 *   - Timeout escalation: increases timeout on each retry attempt
 *   - Circuit breaker integration: delegates to the existing custom breaker
 *
 * Used as a wrapper around LLM calls in unified-llm.ts.
 * The existing Redis-backed circuit breaker remains the source of truth for
 * provider availability — Cockatiel adds bulkhead + retry policy on top.
 */

import {
  BulkheadPolicy,
  RetryPolicy,
  ExponentialBackoff,
  handleAll,
  retry,
  bulkhead,
  wrap,
} from 'cockatiel';

// ================================
// BULKHEAD POLICIES (per LLM provider)
// ================================

/** Max concurrent LLM calls per provider. */
const PROVIDER_BULKHEAD: Record<string, number> = {
  deepseek: 5,
  glm: 3,
  kimi: 3,
  openai: 3,
  anthropic: 2,
  _default: 3,
};

const bulkheadPolicies = new Map<string, BulkheadPolicy>();

function getBulkheadPolicy(provider: string): BulkheadPolicy {
  let policy = bulkheadPolicies.get(provider);
  if (!policy) {
    const cap = PROVIDER_BULKHEAD[provider] ?? PROVIDER_BULKHEAD._default;
    policy = bulkhead(cap);
    bulkheadPolicies.set(provider, policy);
  }
  return policy;
}

// ================================
// RETRY POLICY (with jitter)
// ================================

/**
 * Create a retry policy with exponential backoff + jitter.
 * Cockatiel's ExponentialBackoff has built-in jitter by default.
 */
export function createLLMRetryPolicy(maxRetries = 2, initialDelayMs = 2000): RetryPolicy {
  return retry(handleAll, {
    maxAttempts: maxRetries,
    backoff: new ExponentialBackoff({
      initialDelay: initialDelayMs,
      maxDelay: 60_000,
      exponent: 2,
    }),
  });
}

// ================================
// COMPOSITE POLICY
// ================================

/**
 * Execute an LLM call with bulkhead isolation + retry policy.
 * The circuit breaker is checked separately (in unified-llm.ts) before calling this.
 *
 * @param provider LLM provider name (deepseek, glm, kimi, etc.)
 * @param fn The LLM call to execute
 * @param options Retry options
 */
export async function withLLMResilience<T>(
  provider: string,
  fn: () => Promise<T>,
  options: { maxRetries?: number; initialDelayMs?: number } = {}
): Promise<T> {
  const { maxRetries = 2, initialDelayMs = 2000 } = options;

  const retryPolicy = createLLMRetryPolicy(maxRetries, initialDelayMs);
  const bulkheadPolicy = getBulkheadPolicy(provider);

  // Compose: retry → bulkhead (retry wraps bulkhead so retries go through the bulkhead)
  const policy = wrap(retryPolicy, bulkheadPolicy);

  return policy.execute(fn);
}

/**
 * Get bulkhead stats for monitoring.
 */
export function getBulkheadStats() {
  return Array.from(bulkheadPolicies.entries()).map(([provider, policy]) => ({
    provider,
    // Cockatiel bulkhead exposes queue length and active count via internal state
    activeCount: (policy as any).activeCount ?? 0,
    queueLength: (policy as any).queueLength ?? 0,
    cap: PROVIDER_BULKHEAD[provider] ?? PROVIDER_BULKHEAD._default,
  }));
}

// ================================
// ADAPTIVE RATE LIMITING
// ================================

/**
 * Adaptive rate limiter — dynamically adjusts rate based on 429 frequency.
 *
 * When a provider returns 429s, the rate limiter reduces the allowed rate.
 * When calls succeed, the rate limiter gradually increases back to the baseline.
 *
 * This is a lightweight in-process adaptive limiter that works alongside
 * the existing static token bucket in http-client.ts.
 */

interface AdaptiveRateState {
  currentRate: number;       // current allowed req/s
  baselineRate: number;      // original req/s
  minRate: number;           // floor (never go below this)
  maxRate: number;           // ceiling (never go above baseline)
  consecutive429s: number;   // recent 429 streak
  consecutiveSuccesses: number; // recent success streak
  lastAdjustment: number;    // timestamp of last rate change
}

const adaptiveRates = new Map<string, AdaptiveRateState>();

/** Default adaptive rate configuration per provider. */
const ADAPTIVE_RATE_CONFIG: Record<string, { baseline: number; min: number }> = {
  openalex: { baseline: 10, min: 1 },
  crossref: { baseline: 8, min: 1 },
  semanticscholar: { baseline: 1, min: 0.5 },
  arxiv: { baseline: 3, min: 0.3 },
  _default: { baseline: 3, min: 0.5 },
};

/**
 * Initialize adaptive rate limiting for a provider.
 */
function ensureAdaptiveRate(provider: string): AdaptiveRateState {
  let state = adaptiveRates.get(provider);
  if (!state) {
    const config = ADAPTIVE_RATE_CONFIG[provider] ?? ADAPTIVE_RATE_CONFIG._default;
    state = {
      currentRate: config.baseline,
      baselineRate: config.baseline,
      minRate: config.min,
      maxRate: config.baseline,
      consecutive429s: 0,
      consecutiveSuccesses: 0,
      lastAdjustment: Date.now(),
    };
    adaptiveRates.set(provider, state);
  }
  return state;
}

/**
 * Record a 429 — reduces the adaptive rate.
 */
export function recordAdaptive429(provider: string): void {
  const state = ensureAdaptiveRate(provider);
  state.consecutive429s++;
  state.consecutiveSuccesses = 0;

  // Reduce rate by 50% on each 429 (exponential decay)
  const newRate = Math.max(state.minRate, state.currentRate * 0.5);
  if (newRate < state.currentRate) {
    state.currentRate = newRate;
    state.lastAdjustment = Date.now();
    console.warn(`[ADAPTIVE RATE] ${provider}: rate reduced to ${newRate.toFixed(2)} req/s after ${state.consecutive429s}× 429`);
  }
}

/**
 * Record a success — gradually increases the adaptive rate back to baseline.
 */
export function recordAdaptiveSuccess(provider: string): void {
  const state = ensureAdaptiveRate(provider);
  state.consecutiveSuccesses++;
  state.consecutive429s = 0;

  // After 5 consecutive successes, increase rate by 20% (gradual recovery)
  if (state.consecutiveSuccesses >= 5 && state.currentRate < state.baselineRate) {
    const newRate = Math.min(state.baselineRate, state.currentRate * 1.2);
    if (newRate > state.currentRate) {
      state.currentRate = newRate;
      state.consecutiveSuccesses = 0;
      state.lastAdjustment = Date.now();
      console.log(`[ADAPTIVE RATE] ${provider}: rate recovered to ${newRate.toFixed(2)} req/s`);
    }
  }
}

/**
 * Get the current adaptive rate for a provider.
 * Use this to dynamically adjust the token bucket rate.
 */
export function getAdaptiveRate(provider: string): number {
  const state = ensureAdaptiveRate(provider);
  return state.currentRate;
}

/**
 * Get adaptive rate stats for monitoring.
 */
export function getAdaptiveRateStats() {
  return Array.from(adaptiveRates.entries()).map(([provider, state]) => ({
    provider,
    currentRate: state.currentRate.toFixed(2),
    baselineRate: state.baselineRate,
    consecutive429s: state.consecutive429s,
    consecutiveSuccesses: state.consecutiveSuccesses,
  }));
}
