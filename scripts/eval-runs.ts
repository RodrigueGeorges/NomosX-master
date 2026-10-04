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
 *   - stalePublished > 0 (a PUBLISHED piece carries a stale verdict eval —
 *     the S27 bug class shipped; non-verdict stale evals are reported only)
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
  stalePublished: number;
  staleEvalTotal: number;
  vetoCounts: Record<string, number>;
  /** How often each repair mechanism fired across runs — the observability
   * for the S33 machinery (rescore, DA missions, gap re-analysis, regen,
   * tail-trim, early outline). A mechanism that never fires is dead code;
   * one that fires but never changes outcomes is a cost sink. */
  repairActivity: Record<string, number>;
  evaluatedAt: string;
}

async function collect(limit: number): Promise<Agg> {
  const { prisma } = await import('../lib/db');

  // ── Run telemetry: PipelineRun is the real execution record ──
  const runs = await prisma.pipelineRun.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { status: true, totalCostUsd: true, durationMs: true, trustScore: true, error: true },
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
  const repairActivity: Record<string, number> = {};
  const bump = (key: string) => { repairActivity[key] = (repairActivity[key] ?? 0) + 1; };
  let staleEvalRuns = 0, staleEvalTotal = 0, stalePublished = 0;
  for (const p of pubs as any[]) {
    const stats = (p.criticalLoopResult as any)?.stats ?? {};
    const freshness = stats.evaluationFreshness ?? {};
    const stale: string[] = Array.isArray(freshness.stale) ? freshness.stale : [];
    const verdictStale: string[] = Array.isArray(freshness.verdictStale)
      ? freshness.verdictStale : [];
    // Detection-and-report is HEALTHY (transparency). The regression is a
    // stale VERDICT eval on a PUBLISHED piece — a stale verdict drove the
    // decision. Non-verdict stale evals (grounding, claimBinding…) are
    // reported but never gate-bearing, so they cannot be a regression.
    if (stale.length > 0) {
      staleEvalRuns++;
      // PUBLISHED/CORRECTED/RETRACTED were all shipped — a stale verdict on
      // any of them drove a live decision, even if the piece was later fixed.
      const shipped = ['PUBLISHED', 'CORRECTED', 'RETRACTED'].includes(p.status);
      if (verdictStale.length > 0 && shipped) stalePublished++;
    }
    staleEvalTotal += stale.length;
    if (stats.devilsAdvocate?.veto) vetoCounts.devilsAdvocate = (vetoCounts.devilsAdvocate ?? 0) + 1;
    if (stats.critic?.recommendation === 'reject') vetoCounts.critic = (vetoCounts.critic ?? 0) + 1;
    if (stats.criticPanel?.veto) vetoCounts.criticPanel = (vetoCounts.criticPanel ?? 0) + 1;
    if (stats.symbolicVerifier?.veto) vetoCounts.symbolicVerifier = (vetoCounts.symbolicVerifier ?? 0) + 1;

    // ── Repair-mechanism activity (S33) — count firing, not success ──
    if (stats.critic?.rescoredPostMutation || stats.criticPanel?.rescoredPostMutation || stats.structuralEditor?.rescoredPostMutation) bump('evalRescored');
    if (stats.devilsAdvocateRecheck) bump('daRecheck');
    if (stats.gapFillReAnalysis?.triggered) bump('gapFillReAnalysis');
    if (stats.gapRetrieval?.newSources > 0) bump('gapSourcesRetrieved');
    if (stats.qualityTailTrim?.dropped > 0) bump('qualityTailTrim');
    if (stats.outlineCriticEarly?.coverageScore !== undefined) bump('outlineCriticEarly');
    if (stats.regeneration?.triggered || stats.regeneration?.attempted) bump('regeneration');
    if (stats.regeneration?.adopted === true) bump('regenAdopted');
    if (stats.branchCoverage?.unsupported > 0) bump('branchUnsupported');
    if (stats.branchCitations?.uncited?.length > 0) bump('branchUncited');
    if (stats.gapFillReAnalysis?.rejectedByRescore) bump('gapFillVetoed');
  }

  // Viability refusals live on PipelineRun (pre-brief — no publication row):
  // the corpus pre-gate persists status FAILED + error 'corpus_insufficient'.
  const viabilityRefusals = runs.filter(
    (r: any) => r.status === 'FAILED' && typeof r.error === 'string' && r.error.startsWith('corpus_insufficient')
  ).length;
  if (viabilityRefusals > 0) repairActivity.viabilityRefusal = viabilityRefusals;

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
    stalePublished,
    staleEvalTotal,
    vetoCounts,
    repairActivity,
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

  console.log(`[RUN-EVAL] runs=${agg.runCount} (completed=${(agg.completionRate * 100).toFixed(0)}%) | pubs=${agg.pubCount} (published=${(agg.publishRate * 100).toFixed(0)}%) | trust=${agg.meanTrust.toFixed(1)} | cost/run=$${agg.meanCostUsd.toFixed(2)} | ${agg.meanDurationMin.toFixed(0)}min | staleDetected=${agg.staleEvalRuns} stalePublished=${agg.stalePublished}`);
  if (agg.costPerPublished !== null) {
    console.log(`[RUN-EVAL] Cost per PUBLISHED piece: $${agg.costPerPublished.toFixed(2)}`);
  }
  if (Object.keys(agg.vetoCounts).length) {
    console.log(`[RUN-EVAL] Vetoes: ${Object.entries(agg.vetoCounts).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  }
  if (Object.keys(agg.repairActivity).length) {
    console.log(`[RUN-EVAL] Repair activity: ${Object.entries(agg.repairActivity).map(([k, v]) => `${k}=${v}`).join(' ')}`);
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
  if (agg.stalePublished > 0) {
    regressions.push(`stalePublished: ${agg.stalePublished} publication(s) shipped with stale evaluations driving the verdict`);
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
