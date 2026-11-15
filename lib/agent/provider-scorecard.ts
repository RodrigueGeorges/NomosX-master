/**
 * PROVIDER SCORECARD — per-(task, provider) performance learned from CostLog.
 *
 * The routing table in unified-llm is static: it cannot know that freepool's
 * nemotron takes 285s on analyst_brief while groq answers in 1.5s, or that a
 * "cheap" provider times out into rule_based fallbacks downstream. Every
 * successful callLLM/streamLLM persists provider, model, task, tokens, cost
 * and (since 2026-11) durationMs — this module aggregates that into a
 * scorecard the consolidation layer (cron self-improve, self-evolver context,
 * future routing) can consume.
 *
 * SHADOW FIRST: nothing here changes routing. The scorecard reports what the
 * data says; wiring it into provider ordering is a separate, evidence-gated
 * step (same pattern as MiniCheck shadow → decisive).
 */

import { prisma } from '../db';

export interface ProviderTaskStats {
  operation: string;
  provider: string;
  model: string;
  calls: number;
  /** calls with a recorded duration (older rows predate durationMs) */
  timedCalls: number;
  avgDurationMs: number | null;
  p50DurationMs: number | null;
  p95DurationMs: number | null;
  avgCostUsd: number;
  totalCostUsd: number;
  /** 0-100 composite: rewards speed + low cost + volume confidence */
  score: number;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

/**
 * Aggregate CostLog rows into per-(operation, provider, model) stats.
 * Lookback bounded; rows without durationMs still count for cost/volume.
 */
export async function buildProviderScorecard(lookbackDays = 14, maxRows = 20000): Promise<ProviderTaskStats[]> {
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const rows = await prisma.costLog.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: maxRows,
    select: { operation: true, provider: true, model: true, costUsd: true, metadata: true },
  });

  const groups = new Map<string, {
    operation: string; provider: string; model: string;
    calls: number; durations: number[]; costSum: number;
  }>();

  for (const r of rows) {
    const key = `${r.operation}|${r.provider}|${r.model}`;
    let g = groups.get(key);
    if (!g) {
      g = { operation: r.operation, provider: r.provider, model: r.model, calls: 0, durations: [], costSum: 0 };
      groups.set(key, g);
    }
    g.calls++;
    g.costSum += r.costUsd ?? 0;
    const dur = (r.metadata as any)?.durationMs;
    if (typeof dur === 'number' && dur > 0) g.durations.push(dur);
  }

  const stats: ProviderTaskStats[] = [];
  for (const g of groups.values()) {
    const sorted = [...g.durations].sort((a, b) => a - b);
    const p50 = percentile(sorted, 50);
    const p95 = percentile(sorted, 95);
    const avgDur = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : null;
    const avgCost = g.costSum / g.calls;

    // Score: log-scaled call volume (confidence) tempered by speed and cost.
    // A provider with 1 call shouldn't outrank one with 200 — volume is the
    // evidence. Speed matters most for interactive-path tasks.
    const volume = Math.min(1, Math.log10(g.calls + 1) / 2); // 100 calls → 1.0
    const speed = avgDur == null ? 0.5 : Math.max(0, 1 - avgDur / 300_000); // 300s → 0
    const cheapness = avgCost <= 0 ? 1 : Math.max(0, 1 - avgCost / 0.05); // $0.05 → 0
    const score = Math.round(100 * (0.4 * volume + 0.4 * speed + 0.2 * cheapness));

    stats.push({
      operation: g.operation,
      provider: g.provider,
      model: g.model,
      calls: g.calls,
      timedCalls: sorted.length,
      avgDurationMs: avgDur == null ? null : Math.round(avgDur),
      p50DurationMs: p50,
      p95DurationMs: p95,
      avgCostUsd: avgCost,
      totalCostUsd: g.costSum,
      score,
    });
  }

  return stats.sort((a, b) =>
    a.operation === b.operation
      ? b.score - a.score
      : a.operation.localeCompare(b.operation)
  );
}

/** Best-scoring provider/model for a task, or null when no data. */
export async function bestProviderForTask(task: string, lookbackDays = 14): Promise<ProviderTaskStats | null> {
  const card = await buildProviderScorecard(lookbackDays);
  return card.find(s => s.operation === task) ?? null;
}

/** Compact text report for cron logs / stats snapshots. */
export function formatScorecard(stats: ProviderTaskStats[], perTask = 3): string {
  const byTask = new Map<string, ProviderTaskStats[]>();
  for (const s of stats) {
    const arr = byTask.get(s.operation) ?? [];
    arr.push(s);
    byTask.set(s.operation, arr);
  }
  const lines: string[] = [];
  for (const [task, arr] of [...byTask.entries()].sort()) {
    const top = arr.slice(0, perTask);
    lines.push(`${task}: ${top.map(s =>
      `${s.provider}/${s.model.split('/').pop()} (n=${s.calls}, p50=${s.p50DurationMs ?? '?'}ms, $${s.avgCostUsd.toFixed(4)}, score=${s.score})`
    ).join(' | ')}`);
  }
  return lines.join('\n');
}
