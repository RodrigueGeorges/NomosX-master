/**
 * BTF report — Lot 5 measurement.
 *
 * Scores the forecasting engine on RESOLVED predictions (the backtest-on-
 * the-past the spec asks for): Brier score, calibration buckets and cost
 * per question, grouped by probabilitySource — 'swarm' (independent-voter
 * election, the new engine) vs 'tier_table' (deterministic lookup, the old
 * path) — plus per-domain and per-kind cuts.
 *
 * Run:  tsx --env-file=.env.local scripts/btf-report.ts [--json out.json]
 *
 * A group needs ≥ MIN_GROUP resolved predictions to be reported as
 * comparable — below that the Brier is noise, not signal.
 */
import { prisma } from '../lib/db';

const MIN_GROUP = 10;

interface Row {
  id: string;
  probability: number;
  outcome: 'occurred' | 'not_occurred';
  brier: number;
  probabilitySource: string;
  kind: string;
  domain: string | null;
  question: string;
  costUsd: number | null;
  durationMin: number | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

function bucket(p: number): string {
  if (p < 0.2) return '0.0-0.2';
  if (p < 0.4) return '0.2-0.4';
  if (p < 0.6) return '0.4-0.6';
  if (p < 0.8) return '0.6-0.8';
  return '0.8-1.0';
}

interface GroupStats {
  n: number;
  brier: number;
  /** 95% bootstrap CI on mean Brier — the spec's "intervalle de
   *  confiance à 95 %". Deterministic LCG seed so reports are stable. */
  brierCi95: [number, number];
  calibration: Record<string, { n: number; meanPred: number; observedFreq: number }>;
  meanCostUsd: number | null;
  meanDurationMin: number | null;
}

/** Deterministic LCG — same seed, same resample, stable reports. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

function bootstrapBrierCi(briers: number[], iters = 2000): [number, number] {
  if (briers.length < 2) return [NaN, NaN];
  const rand = lcg(0x9e3779b9);
  const means: number[] = [];
  const n = briers.length;
  for (let i = 0; i < iters; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) sum += briers[(rand() * n) | 0];
    means.push(sum / n);
  }
  means.sort((a, b) => a - b);
  return [means[Math.floor(iters * 0.025)], means[Math.floor(iters * 0.975)]];
}

function summarize(rows: Row[]): GroupStats {
  const cal: GroupStats['calibration'] = {};
  let costSum = 0, costN = 0, durSum = 0, durN = 0;
  for (const r of rows) {
    const b = bucket(r.probability);
    const c = (cal[b] ??= { n: 0, meanPred: 0, observedFreq: 0 });
    c.n++; c.meanPred += r.probability; c.observedFreq += r.outcome === 'occurred' ? 1 : 0;
    if (r.costUsd != null) { costSum += r.costUsd; costN++; }
    if (r.durationMin != null) { durSum += r.durationMin; durN++; }
  }
  for (const c of Object.values(cal)) {
    c.meanPred /= c.n; c.observedFreq /= c.n;
  }
  return {
    n: rows.length,
    brier: rows.reduce((s, r) => s + r.brier, 0) / rows.length,
    brierCi95: bootstrapBrierCi(rows.map(r => r.brier)),
    calibration: cal,
    meanCostUsd: costN ? costSum / costN : null,
    meanDurationMin: durN ? durSum / durN : null,
  };
}

function groupBy(rows: Row[], key: (r: Row) => string): Record<string, GroupStats> {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = key(r);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }
  const out: Record<string, GroupStats> = {};
  for (const [k, g] of groups) if (g.length >= MIN_GROUP) out[k] = summarize(g);
  return out;
}

async function main() {
  const preds = await prisma.prediction.findMany({
    where: {
      resolvedAt: { not: null },
      outcome: { in: ['occurred', 'not_occurred'] },
      probability: { not: null },
    },
    include: { brief: { select: { question: true, pipelineRunId: true } } },
    orderBy: { resolvedAt: 'desc' },
    take: 2000,
  });

  const runIds = [...new Set(preds.map(p => p.brief?.pipelineRunId).filter((x): x is string => !!x))];
  const runs = runIds.length
    ? await prisma.pipelineRun.findMany({ where: { id: { in: runIds } }, select: { id: true, totalCostUsd: true, durationMs: true } })
    : [];
  const runById = new Map(runs.map(r => [r.id, r]));

  const rows: Row[] = preds
    .filter(p => p.probability != null && (p.outcome === 'occurred' || p.outcome === 'not_occurred'))
    .map(p => {
      const prob = p.probability!;
      const actual = p.outcome === 'occurred' ? 1 : 0;
      const run = p.brief?.pipelineRunId ? runById.get(p.brief.pipelineRunId) : undefined;
      return {
        id: p.id,
        probability: prob,
        outcome: p.outcome as 'occurred' | 'not_occurred',
        brier: (prob - actual) ** 2,
        probabilitySource: p.probabilitySource ?? 'unlabeled',
        kind: p.kind ?? 'strategic',
        domain: p.domain ?? null,
        question: p.brief?.question ?? '(no brief)',
        costUsd: run?.totalCostUsd ?? null,
        durationMin: run?.durationMs ? run.durationMs / 60000 : null,
        createdAt: p.createdAt,
        resolvedAt: p.resolvedAt,
      };
    });

  const report = {
    generatedAt: new Date().toISOString(),
    resolvedPredictions: rows.length,
    minGroupSize: MIN_GROUP,
    overall: rows.length ? summarize(rows) : null,
    byProbabilitySource: groupBy(rows, r => r.probabilitySource),
    // Head-to-head the spec asks for: new engine (swarm/agentic votes) vs
    // the deterministic path, with the Brier gap's own bootstrap CI.
    engineComparison: (() => {
      const swarm = rows.filter(r => r.probabilitySource === 'swarm' || r.probabilitySource === 'agentic');
      const other = rows.filter(r => r.probabilitySource !== 'swarm' && r.probabilitySource !== 'agentic' && r.probabilitySource !== 'unlabeled');
      if (swarm.length < MIN_GROUP || other.length < MIN_GROUP) return null;
      const sB = swarm.map(r => r.brier), oB = other.map(r => r.brier);
      const rand = lcg(0x51ed270b);
      const diffs: number[] = [];
      for (let i = 0; i < 2000; i++) {
        // independent bootstrap resample of each group
        let ss = 0, so = 0;
        for (let j = 0; j < sB.length; j++) ss += sB[(rand() * sB.length) | 0];
        for (let j = 0; j < oB.length; j++) so += oB[(rand() * oB.length) | 0];
        diffs.push(ss / sB.length - so / oB.length);
      }
      diffs.sort((a, b) => a - b);
      return {
        newEngine: { source: 'swarm|agentic', n: swarm.length, brier: sB.reduce((a, b) => a + b, 0) / sB.length },
        baseline: { n: other.length, brier: oB.reduce((a, b) => a + b, 0) / oB.length },
        brierDiffCi95: [diffs[Math.floor(2000 * 0.025)], diffs[Math.floor(2000 * 0.975)]] as [number, number],
        betterAt95: diffs[Math.floor(2000 * 0.975)] < 0, // CI entirely below 0 → new engine better
      };
    })(),
    byKind: groupBy(rows, r => r.kind),
    byDomain: groupBy(rows, r => r.domain ?? 'unknown'),
    // Per-question cut: the spec's "coût par question" — Brier aggregates
    // predictions, cost attaches to the run that produced them.
    perQuestion: (() => {
      const qs = new Map<string, Row[]>();
      for (const r of rows) (qs.get(r.question) ?? qs.set(r.question, []).get(r.question)!).push(r);
      const out: Record<string, GroupStats & { question: string }> = {};
      for (const [q, g] of qs) {
        if (g.length < 3) continue;
        out[q.slice(0, 80)] = { question: q.slice(0, 200), ...summarize(g) };
      }
      return out;
    })(),
  };

  const jsonIdx = process.argv.indexOf('--json');
  const json = JSON.stringify(report, null, 2);
  if (jsonIdx >= 0 && process.argv[jsonIdx + 1]) {
    const { writeFileSync } = await import('fs');
    writeFileSync(process.argv[jsonIdx + 1], json);
    console.log(`BTF report written to ${process.argv[jsonIdx + 1]}`);
  } else {
    console.log(json);
  }

  // Human-readable summary
  console.log('\n=== BTF SUMMARY ===');
  console.log(`resolved predictions: ${rows.length}`);
  if (report.overall) {
    console.log(`overall Brier: ${report.overall.brier.toFixed(4)} (random=0.25, perfect=0)`);
    for (const [src, g] of Object.entries(report.byProbabilitySource)) {
      const ci = Number.isFinite(g.brierCi95[0]) ? ` CI95[${g.brierCi95[0].toFixed(3)},${g.brierCi95[1].toFixed(3)}]` : '';
      console.log(`  ${src}: n=${g.n} brier=${g.brier.toFixed(4)}${ci} cost=$${g.meanCostUsd?.toFixed(2) ?? '?'} ${g.meanDurationMin?.toFixed(0) ?? '?'}min`);
    }
    const cmp = report.engineComparison;
    if (cmp) {
      console.log(`engine comparison: new=${cmp.newEngine.brier.toFixed(4)} (n=${cmp.newEngine.n}) vs baseline=${cmp.baseline.brier.toFixed(4)} (n=${cmp.baseline.n})`);
      console.log(`  Brier diff CI95 [${cmp.brierDiffCi95[0].toFixed(4)}, ${cmp.brierDiffCi95[1].toFixed(4)}] — new engine better at 95%: ${cmp.betterAt95}`);
    }
  }
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
