/**
 * Run-Regression Eval — systemic health metrics over historical pipeline runs.
 *
 * Complements eval-golden.ts (which re-scores stored HTML through the quality
 * stack). This harness is DETERMINISTIC and FREE: it replays the telemetry
 * persisted by live runs —
 *   PipelineRun          → status, totalCostUsd, durationMs, trustScore
 *   ThinkTankPublication → status + criticalLoopResult.stats (vetoes,
 *                          evaluationFreshness — the S27 stale-verdict class)
 *
 * Usage:
 *   tsx --env-file=.env.local scripts/eval-runs.ts              # last 50 runs
 *   tsx --env-file=.env.local scripts/eval-runs.ts --limit=100
 *   tsx --env-file=.env.local scripts/eval-runs.ts --update     # write baseline
 *
 * Exit 1 on regression vs evals/runs-baseline.json:
 *   - completionRate drops > 10pts or publishRate drops > 10pts
 *   - meanTrust drops > 5pts
 *   - staleEvalRuns > 0 (evaluations reused on mutated artifacts)
 *   - meanCostUsd or meanDurationMin rises > 50%
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const BASELINE_PATH = join(ROOT, 'evals', 'runs-baseline.json');
const RESULTS_DIR = join(ROOT, 'evals', 'results');

interface Agg {
  runCount: number;
  completionRate: number;
  pubCount: number;
  publishRate: number;
  meanTrust: number;
  meanCostUsd: number;
  meanDurationMin: number;
  costPerPublished: number | null;
  staleEvalRuns: number;
  staleEvalTotal: number;
  vetoCounts: Record<string, number>;
  evaluatedAt: string;
}

async function collect(limit: number): Promise<Agg> {
  const { prisma } = await import('../lib/db');

  // ── Run telemetry: PipelineRun is the real execution record ──
  const runs = await prisma.pipelineRun.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { status: true, totalCostUsd: true, durationMs: true, trustScore: true },
  });

  // ── Publication outcomes + stored pipeline stats ──
  const pubs = await prisma.thinkTankPublication.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, status: true, trustScore: true, criticalLoopResult: true },
  });

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  const completed = runs.filter((r: any) => r.status === 'COMPLETED').length;
  const published = pubs.filter((p: any) => p.status === 'PUBLISHED');

  const vetoCounts: Record<string, number> = {};
  let staleEvalRuns = 0, staleEvalTotal = 0;
  for (const p of pubs as any[]) {
    const stats = (p.criticalLoopResult as any)?.stats ?? {};
    const stale: string[] = Array.isArray(stats.evaluationFreshness?.stale)
      ? stats.evaluationFreshness.stale : [];
    if (stale.length > 0) staleEvalRuns++;
    staleEvalTotal += stale.length;
    if (stats.devilsAdvocate?.veto) vetoCounts.devilsAdvocate = (vetoCounts.devilsAdvocate ?? 0) + 1;
    if (stats.critic?.recommendation === 'reject') vetoCounts.critic = (vetoCounts.critic ?? 0) + 1;
    if (stats.criticPanel?.veto) vetoCounts.criticPanel = (vetoCounts.criticPanel ?? 0) + 1;
    if (stats.symbolicVerifier?.veto) vetoCounts.symbolicVerifier = (vetoCounts.symbolicVerifier ?? 0) + 1;
  }

  const totalCost = runs.reduce((a: number, r: any) => a + (r.totalCostUsd ?? 0), 0);

  return {
    runCount: runs.length,
    completionRate: runs.length ? completed / runs.length : 0,
    pubCount: pubs.length,
    publishRate: pubs.length ? published.length / pubs.length : 0,
    meanTrust: mean(pubs.map((p: any) => p.trustScore).filter((x: any) => typeof x === 'number')),
    meanCostUsd: mean(runs.map((r: any) => r.totalCostUsd ?? 0)),
    meanDurationMin: mean(runs.map((r: any) => (r.durationMs ?? 0) / 60000)),
    costPerPublished: published.length ? totalCost / published.length : null,
    staleEvalRuns,
    staleEvalTotal,
    vetoCounts,
    evaluatedAt: new Date().toISOString(),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const updateBaseline = args.includes('--update');
  const limit = Number(args.find(a => a.startsWith('--limit='))?.split('=')[1] ?? 50);

  console.log(`[RUN-EVAL] Loading last ${limit} runs + publications...`);
  const agg = await collect(limit);
  if (agg.runCount === 0 && agg.pubCount === 0) {
    console.error('[RUN-EVAL] No runs or publications found.');
    process.exit(1);
  }

  console.log(`[RUN-EVAL] runs=${agg.runCount} (completed=${(agg.completionRate * 100).toFixed(0)}%) | pubs=${agg.pubCount} (published=${(agg.publishRate * 100).toFixed(0)}%) | trust=${agg.meanTrust.toFixed(1)} | cost/run=$${agg.meanCostUsd.toFixed(2)} | ${agg.meanDurationMin.toFixed(0)}min | staleEvalRuns=${agg.staleEvalRuns}`);
  if (agg.costPerPublished !== null) {
    console.log(`[RUN-EVAL] Cost per PUBLISHED piece: $${agg.costPerPublished.toFixed(2)}`);
  }
  if (Object.keys(agg.vetoCounts).length) {
    console.log(`[RUN-EVAL] Vetoes: ${Object.entries(agg.vetoCounts).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  }

  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(join(RESULTS_DIR, 'runs-latest.json'), JSON.stringify(agg, null, 2));

  if (updateBaseline) {
    writeFileSync(BASELINE_PATH, JSON.stringify(agg, null, 2));
    console.log('[RUN-EVAL] Baseline updated.');
    process.exit(0);
  }

  if (!existsSync(BASELINE_PATH)) {
    console.log('[RUN-EVAL] No baseline — run with --update to create one.');
    process.exit(0);
  }

  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
  const regressions: string[] = [];
  if (agg.completionRate < (baseline.completionRate ?? 0) - 0.10) {
    regressions.push(`completionRate: ${((baseline.completionRate ?? 0) * 100).toFixed(0)}% → ${(agg.completionRate * 100).toFixed(0)}%`);
  }
  if (agg.publishRate < (baseline.publishRate ?? 0) - 0.10) {
    regressions.push(`publishRate: ${((baseline.publishRate ?? 0) * 100).toFixed(0)}% → ${(agg.publishRate * 100).toFixed(0)}%`);
  }
  if (agg.meanTrust < (baseline.meanTrust ?? 0) - 5) {
    regressions.push(`meanTrust: ${baseline.meanTrust.toFixed(1)} → ${agg.meanTrust.toFixed(1)}`);
  }
  if (agg.staleEvalRuns > 0) {
    regressions.push(`staleEvalRuns: ${agg.staleEvalRuns} run(s) produced with stale evaluations`);
  }
  if (baseline.meanCostUsd > 0 && agg.meanCostUsd > baseline.meanCostUsd * 1.5) {
    regressions.push(`meanCostUsd: $${baseline.meanCostUsd.toFixed(2)} → $${agg.meanCostUsd.toFixed(2)}`);
  }
  if (baseline.meanDurationMin > 0 && agg.meanDurationMin > baseline.meanDurationMin * 1.5) {
    regressions.push(`meanDurationMin: ${baseline.meanDurationMin.toFixed(0)} → ${agg.meanDurationMin.toFixed(0)}min`);
  }

  if (regressions.length > 0) {
    console.error(`\n[RUN-EVAL] ❌ REGRESSION vs baseline:\n  ${regressions.join('\n  ')}`);
    process.exit(1);
  }
  console.log('\n[RUN-EVAL] ✅ No regression vs baseline.');
  process.exit(0);
}

main().catch(err => {
  console.error('[RUN-EVAL] Fatal:', err);
  process.exit(1);
});
