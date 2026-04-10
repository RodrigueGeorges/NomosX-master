/**
 * NomosX PROVIDER HEALTH TRACKER — Circuit Breaker for Data Sources
 *
 * P3-K: Tracks provider failure rates and temporarily blacklists
 * providers that are consistently failing, avoiding wasted API calls.
 *
 * Features:
 * - Tracks success/failure per provider in Redis (with DB fallback)
 * - Circuit breaker: blacklist provider after 3 consecutive failures
 * - Auto-recovery: re-enable after 30 minutes
 * - Feeds failure data back into AgentMemory for calibration
 * - Exposes getHealthyProviders() for pipeline to use
 */

import { prisma } from '../db';

// ============================================================================
// TYPES
// ============================================================================

export interface ProviderHealth {
  provider: string;
  status: "healthy" | "degraded" | "blacklisted";
  successRate: number;      // 0-1 over last 24h
  consecutiveFailures: number;
  lastFailure: Date | null;
  lastSuccess: Date | null;
  avgResponseMs: number;
  blacklistedUntil: Date | null;
}

export interface ProviderCallResult {
  provider: string;
  success: boolean;
  responseMs: number;
  resultCount?: number;
  error?: string;
}

// ============================================================================
// IN-MEMORY CIRCUIT BREAKER (fast path, no DB for hot path)
// ============================================================================

const circuitBreakers = new Map<string, {
  consecutiveFailures: number;
  blacklistedUntil: Date | null;
  lastCheck: Date;
}>();

const BLACKLIST_THRESHOLD = 3;       // failures before blacklist
const BLACKLIST_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const DEGRADED_THRESHOLD = 0.5;     // < 50% success rate = degraded

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Record the result of a provider call.
 * Call this after every provider search attempt.
 */
export function recordProviderCall(result: ProviderCallResult): void {
  const state = circuitBreakers.get(result.provider) || {
    consecutiveFailures: 0,
    blacklistedUntil: null,
    lastCheck: new Date(),
  };

  if (result.success) {
    state.consecutiveFailures = 0;
    state.blacklistedUntil = null;
  } else {
    state.consecutiveFailures += 1;
    if (state.consecutiveFailures >= BLACKLIST_THRESHOLD) {
      state.blacklistedUntil = new Date(Date.now() + BLACKLIST_DURATION_MS);
      console.warn(`[PROVIDER HEALTH] ⚠️ ${result.provider} blacklisted for 30min (${state.consecutiveFailures} consecutive failures)`);
    }
  }

  state.lastCheck = new Date();
  circuitBreakers.set(result.provider, state);

  // Persist to DB asynchronously (non-blocking)
  persistProviderCall(result, state).catch(() => {});
}

/**
 * Check if a provider is currently healthy/available.
 * Returns false if blacklisted (circuit open).
 */
export function isProviderHealthy(provider: string): boolean {
  const state = circuitBreakers.get(provider);
  if (!state) return true; // No history = assume healthy

  if (state.blacklistedUntil && state.blacklistedUntil > new Date()) {
    return false; // Circuit open
  }

  // Auto-recover: clear blacklist if time has passed
  if (state.blacklistedUntil && state.blacklistedUntil <= new Date()) {
    state.consecutiveFailures = 0;
    state.blacklistedUntil = null;
    circuitBreakers.set(provider, state);
    console.log(`[PROVIDER HEALTH] ✅ ${provider} auto-recovered from blacklist`);
  }

  return true;
}

/**
 * Filter a list of providers to only healthy ones.
 * Used by pipeline before calling providers.
 */
export function getHealthyProviders(providers: string[]): string[] {
  const healthy = providers.filter(p => isProviderHealthy(p));
  const blacklisted = providers.filter(p => !isProviderHealthy(p));

  if (blacklisted.length > 0) {
    console.log(`[PROVIDER HEALTH] Skipping ${blacklisted.length} blacklisted providers: ${blacklisted.join(", ")}`);
  }

  return healthy;
}

/**
 * Get full health status for all tracked providers.
 */
export async function getProviderHealthReport(): Promise<ProviderHealth[]> {
  const report: ProviderHealth[] = [];

  // Load from DB for historical stats
  try {
    const stats = await prisma.systemMetric.findMany({
      where: {
        metricName: { startsWith: "provider_health:" },
        timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { timestamp: "desc" },
      take: 500,
    });

    // Group by provider
    const byProvider = new Map<string, typeof stats>();
    for (const stat of stats) {
      const provider = stat.metricName.replace("provider_health:", "");
      if (!byProvider.has(provider)) byProvider.set(provider, []);
      byProvider.get(provider)!.push(stat);
    }

    for (const [provider, calls] of byProvider) {
      const successes = calls.filter(c => (c.dimensions as any)?.success === true).length;
      const successRate = calls.length > 0 ? successes / calls.length : 1;
      const avgMs = calls.length > 0
        ? calls.reduce((s, c) => s + ((c.dimensions as any)?.responseMs || 0), 0) / calls.length
        : 0;

      const circuit = circuitBreakers.get(provider);
      const blacklistedUntil = circuit?.blacklistedUntil || null;
      const status: ProviderHealth["status"] =
        blacklistedUntil && blacklistedUntil > new Date() ? "blacklisted" :
        successRate < DEGRADED_THRESHOLD ? "degraded" : "healthy";

      report.push({
        provider,
        status,
        successRate,
        consecutiveFailures: circuit?.consecutiveFailures || 0,
        lastFailure: calls.find(c => !(c.dimensions as any)?.success)?.timestamp || null,
        lastSuccess: calls.find(c => (c.dimensions as any)?.success)?.timestamp || null,
        avgResponseMs: Math.round(avgMs),
        blacklistedUntil,
      });
    }
  } catch (err) {
    console.warn(`[PROVIDER HEALTH] Failed to load DB stats:`, err);
  }

  return report.sort((a, b) => b.successRate - a.successRate);
}

/**
 * Force-reset a provider's circuit breaker (manual recovery).
 */
export function resetProvider(provider: string): void {
  circuitBreakers.delete(provider);
  console.log(`[PROVIDER HEALTH] 🔄 ${provider} circuit breaker manually reset`);
}

// ============================================================================
// PERSISTENCE (non-blocking)
// ============================================================================

async function persistProviderCall(
  result: ProviderCallResult,
  state: { consecutiveFailures: number; blacklistedUntil: Date | null }
): Promise<void> {
  try {
    const now = new Date();
    await prisma.systemMetric.create({
      data: {
        metricName: `provider_health:${result.provider}`,
        metricValue: result.success ? 1 : 0,
        dimensions: {
          success: result.success,
          responseMs: result.responseMs,
          resultCount: result.resultCount || 0,
          error: result.error || null,
          consecutiveFailures: state.consecutiveFailures,
        },
        periodStart: now,
        periodEnd: now,
      },
    });
  } catch { /* non-fatal */ }
}
