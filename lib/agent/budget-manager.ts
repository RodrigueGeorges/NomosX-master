/**
 * Global Budget Manager — Autonomous spending control
 *
 * Prevents runaway costs by tracking cumulative spending across:
 * - Per-pipeline costs (already tracked)
 * - Per-cycle costs (already tracked in think-tank-dispatcher)
 * - Per-day / per-month / per-year cumulative spending (NEW)
 *
 * Features:
 * - Monthly cap (default $100, configurable via NOMOSX_MONTHLY_BUDGET_USD)
 * - Daily cap (default $10, configurable via NOMOSX_DAILY_BUDGET_USD)
 * - Anomaly detection: alerts if single run > 3× average
 * - Per-provider cost tracking
 * - Budget remaining calculation
 * - Auto-throttle: if budget < 20% remaining, reduce concurrent dispatches
 *
 * Storage: Prisma SystemMetric table (no new schema needed)
 */

import { prisma } from '../db';

const MONTHLY_BUDGET_USD = parseFloat(process.env.NOMOSX_MONTHLY_BUDGET_USD ?? '100');
const DAILY_BUDGET_USD = parseFloat(process.env.NOMOSX_DAILY_BUDGET_USD ?? '10');
const ANOMALY_THRESHOLD = 3.0; // 3× average = anomaly

export interface BudgetStatus {
  dailySpent: number;
  dailyCap: number;
  dailyRemaining: number;
  dailyPct: number;
  monthlySpent: number;
  monthlyCap: number;
  monthlyRemaining: number;
  monthlyPct: number;
  isDailyExceeded: boolean;
  isMonthlyExceeded: boolean;
  isCritical: boolean; // < 20% remaining
  anomalyDetected: boolean;
  anomalyDetail?: string;
  perProviderBreakdown: Record<string, number>;
  avgRunCost: number;
  totalRuns: number;
}

/**
 * Record a cost entry to the budget tracker.
 * Uses SystemMetric table with metricName='budget.spend'.
 */
export async function recordSpend(
  amountUsd: number,
  provider: string,
  runId?: string
): Promise<void> {
  if (!Number.isFinite(amountUsd) || amountUsd < 0) throw new Error('Invalid spend amount');
  if (amountUsd === 0) return;
  const now = new Date();
  await prisma.systemMetric.create({
    data: {
      metricName: 'budget.spend',
      metricValue: amountUsd,
      unit: 'usd',
      periodStart: now,
      periodEnd: now,
      dimensions: {
        provider,
        runId: runId ?? 'unknown',
        timestamp: now.toISOString(),
      },
    },
  }).catch((err) => {
    // Non-blocking — but never silent: an unwritten spend row means the
    // budget gate under-counts and the cycle can over-spend.
    console.warn(`[Budget] recordSpend failed (${provider} $${amountUsd.toFixed(4)}):`, err?.message ?? err);
    throw err;
  });
}

/**
 * Get current budget status by querying cumulative spend.
 */
export async function getBudgetStatus(): Promise<BudgetStatus> {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Query spend metrics
  const [dailyMetrics, monthlyMetrics] = await Promise.all([
    prisma.systemMetric.findMany({
      where: {
        metricName: 'budget.spend',
        periodStart: { gte: dayStart },
      },
      select: { metricValue: true, dimensions: true },
    }),
    prisma.systemMetric.findMany({
      where: {
        metricName: 'budget.spend',
        periodStart: { gte: monthStart },
      },
      select: { metricValue: true, dimensions: true },
    }),
  ]);

  const dailySpent = (dailyMetrics as any[]).reduce((sum, m) => sum + (m.metricValue ?? 0), 0);
  const monthlySpent = (monthlyMetrics as any[]).reduce((sum, m) => sum + (m.metricValue ?? 0), 0);

  // Per-provider breakdown (monthly)
  const perProvider: Record<string, number> = {};
  for (const m of monthlyMetrics as any[]) {
    const provider = m.dimensions?.provider ?? 'unknown';
    perProvider[provider] = (perProvider[provider] ?? 0) + (m.metricValue ?? 0);
  }

  // Anomaly detection: check if any single run > 3× average
  const runCosts = new Map<string, number>();
  for (const m of monthlyMetrics as any[]) {
    const runId = m.dimensions?.runId ?? 'unknown';
    runCosts.set(runId, (runCosts.get(runId) ?? 0) + (m.metricValue ?? 0));
  }
  const runCostValues = Array.from(runCosts.values());
  const totalRuns = runCostValues.length;
  const avgRunCost = totalRuns > 0 ? runCostValues.reduce((a, b) => a + b, 0) / totalRuns : 0;
  const maxRunCost = totalRuns > 0 ? Math.max(...runCostValues) : 0;
  const anomalyDetected = avgRunCost > 0 && maxRunCost > avgRunCost * ANOMALY_THRESHOLD;
  const anomalyRunId = anomalyDetected
    ? Array.from(runCosts.entries()).find(([_, v]) => v === maxRunCost)?.[0]
    : undefined;

  const dailyRemaining = Math.max(0, DAILY_BUDGET_USD - dailySpent);
  const monthlyRemaining = Math.max(0, MONTHLY_BUDGET_USD - monthlySpent);

  return {
    dailySpent,
    dailyCap: DAILY_BUDGET_USD,
    dailyRemaining,
    dailyPct: DAILY_BUDGET_USD > 0 ? (dailySpent / DAILY_BUDGET_USD) * 100 : 0,
    monthlySpent,
    monthlyCap: MONTHLY_BUDGET_USD,
    monthlyRemaining,
    monthlyPct: MONTHLY_BUDGET_USD > 0 ? (monthlySpent / MONTHLY_BUDGET_USD) * 100 : 0,
    isDailyExceeded: dailySpent >= DAILY_BUDGET_USD,
    isMonthlyExceeded: monthlySpent >= MONTHLY_BUDGET_USD,
    isCritical: monthlyRemaining < MONTHLY_BUDGET_USD * 0.2,
    anomalyDetected,
    anomalyDetail: anomalyDetected
      ? `Run ${anomalyRunId} cost $${maxRunCost.toFixed(4)} (${(maxRunCost / avgRunCost).toFixed(1)}× average $${avgRunCost.toFixed(4)})`
      : undefined,
    perProviderBreakdown: perProvider,
    avgRunCost,
    totalRuns,
  };
}

/**
 * Check if the think tank should throttle or stop based on budget.
 * Returns: 'proceed' | 'throttle' | 'stop'
 */
export async function checkBudgetGate(): Promise<'proceed' | 'throttle' | 'stop'> {
  if (![MONTHLY_BUDGET_USD, DAILY_BUDGET_USD].every(cap => Number.isFinite(cap) && cap >= 0)) return 'stop';
  let status: BudgetStatus;
  try {
    status = await getBudgetStatus();
  } catch {
    console.error('[BUDGET] Ledger unavailable — STOPPING');
    return 'stop';
  }

  if (status.isMonthlyExceeded) {
    console.warn(`[BUDGET] Monthly budget exceeded: $${status.monthlySpent.toFixed(2)} / $${status.monthlyCap.toFixed(2)} — STOPPING`);
    return 'stop';
  }

  if (status.isDailyExceeded) {
    console.warn(`[BUDGET] Daily budget exceeded: $${status.dailySpent.toFixed(2)} / $${status.dailyCap.toFixed(2)} — STOPPING`);
    return 'stop';
  }

  if (status.isCritical) {
    console.warn(`[BUDGET] Critical: only $${status.monthlyRemaining.toFixed(2)} remaining — THROTTLING`);
    return 'throttle';
  }

  if (status.anomalyDetected) {
    console.warn(`[BUDGET] Anomaly detected: ${status.anomalyDetail}`);
    // Don't stop, just warn — anomalies are informational
  }

  return 'proceed';
}

/**
 * Get a formatted budget report for logging/dashboard.
 */
export async function getBudgetReport(): Promise<string> {
  const status = await getBudgetStatus();
  const lines = [
    `╔══════════════════════════════════════════════════════╗`,
    `║  BUDGET REPORT                                        ║`,
    `╠══════════════════════════════════════════════════════╣`,
    `║  Daily:   $${status.dailySpent.toFixed(4)} / $${status.dailyCap.toFixed(2)} (${status.dailyPct.toFixed(1)}%)${' '.repeat(Math.max(0, 8 - status.dailyPct.toFixed(1).length))}║`,
    `║  Monthly: $${status.monthlySpent.toFixed(4)} / $${status.monthlyCap.toFixed(2)} (${status.monthlyPct.toFixed(1)}%)${' '.repeat(Math.max(0, 8 - status.monthlyPct.toFixed(1).length))}║`,
    `║  Runs:    ${status.totalRuns} (avg $${status.avgRunCost.toFixed(4)}/run)${' '.repeat(Math.max(0, 16 - String(status.totalRuns).length - status.avgRunCost.toFixed(4).length))}║`,
    `║  Status:  ${status.isMonthlyExceeded ? 'STOPPED' : status.isCritical ? 'THROTTLED' : 'OK'}${' '.repeat(Math.max(0, 42 - (status.isMonthlyExceeded ? 'STOPPED' : status.isCritical ? 'THROTTLED' : 'OK').length))}║`,
  ];

  if (status.anomalyDetected && status.anomalyDetail) {
    lines.push(`║  ⚠ Anomaly: ${status.anomalyDetail.slice(0, 42).padEnd(42)}║`);
  }

  const topProviders = Object.entries(status.perProviderBreakdown)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);
  if (topProviders.length > 0) {
    lines.push(`║  Top providers:                                       ║`);
    for (const [provider, cost] of topProviders) {
      lines.push(`║    ${provider.slice(0, 20).padEnd(20)}: $${cost.toFixed(4)}${' '.repeat(Math.max(0, 20 - cost.toFixed(4).length))}║`);
    }
  }

  lines.push(`╚══════════════════════════════════════════════════════╝`);
  return lines.join('\n');
}
