/**
 * Step marginal-value report — AGENTS.md P1/5 A/B protocol.
 *
 * Replays persisted `stats.*` from the last N publications — no paid runs.
 * For each flag-gated pipeline step it answers two questions:
 *
 *   1. Did the step actually DO something? (fires, interventions, output size)
 *   2. Do runs where it fired differ on outcomes? (publishRate / trust / cost)
 *
 * CAVEAT — flags auto-gate on strategic/complexity, so "step ran" is
 * CONFOUNDED with run difficulty. A cohort difference is correlation,
 * not causation. Causal evidence requires one `eval:runs` batch with the
 * flag forced off on comparable queries — the verdict column marks what
 * is safe to act on now vs what needs the controlled run.
 *
 * Usage: npm run eval:steps [-- --limit=50]
 */
import { prisma } from '../lib/db';

const limit = Number(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? 50);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

interface StepSpec {
  key: string;            // stats key
  flag: string;           // PipelineCoreOptions flag
  gates: string;          // when the flag fires
  valueOf: (s: any) => { fired: boolean; signal: string }; // did it do work, compact signal
}

const STEPS: StepSpec[] = [
  { key: 'contextPrimer',  flag: '(always on)',        gates: 'every run',
    valueOf: s => ({ fired: true, signal: `${Math.round((s.durationMs ?? 0) / 1000)}s, ${s.knownConcepts ?? 0} concepts` }) },
  { key: 'episodicMemory', flag: '(always on)',        gates: 'every run',
    valueOf: s => ({ fired: true, signal: `${s.episodes ?? s.retrieved ?? 0} episodes` }) },
  { key: 'knowledgeGraph', flag: '(always on)',        gates: 'every run',
    valueOf: s => ({ fired: true, signal: `${s.entities ?? 0} ent / ${s.relations ?? 0} rel` }) },
  { key: 'moa',            flag: 'useMixtureOfAgents', gates: 'opt-in (was auto — dead spend fixed)',
    valueOf: s => ({ fired: !!s.consensus, signal: `consensus ${s.consensus ?? '?'}, insights ${s.uniqueInsights ?? 0}` }) },
  { key: 'witness',        flag: 'useWitness',         gates: 'strategic + budget>$2',
    valueOf: s => ({ fired: (s.totalInterventions ?? 0) > 0, signal: `${s.totalInterventions ?? 0} interventions, ${s.totalAnomalies ?? 0} anomalies` }) },
  { key: 'prm',            flag: 'usePRM',             gates: 'strategic + budget>$3',
    valueOf: s => ({ fired: s.analystScore != null, signal: `score ${s.analystScore ?? '—'}, rec ${s.recommendation ?? '—'}` }) },
  { key: 'selfPlay',       flag: 'useSelfPlay',        gates: 'strategic + budget>$3',
    valueOf: s => ({ fired: true, signal: JSON.stringify(s).slice(0, 60) }) },
  { key: 'selfEvolution',  flag: 'useSelfEvolution',   gates: 'strategic + budget>$3',
    valueOf: s => ({ fired: Array.isArray(s) ? s.length > 0 : true, signal: Array.isArray(s) ? `${s.length} improved prompts` : 'ran' }) },
  { key: 'peerReview',     flag: 'usePeerReview',      gates: 'opt-in',
    valueOf: s => ({ fired: true, signal: JSON.stringify(s).slice(0, 60) }) },
  { key: 'thinkTankPack',  flag: 'useThinkTankPack',   gates: 'opt-in',
    valueOf: s => ({ fired: true, signal: JSON.stringify(s).slice(0, 60) }) },
  { key: 'ragas',          flag: 'useRagasEval',       gates: 'opt-in',
    valueOf: s => ({ fired: true, signal: JSON.stringify(s).slice(0, 60) }) },
];

function cohortStats(runs: Array<{ status: string; trustScore: number | null; stats: any }>) {
  return {
    n: runs.length,
    publishRate: runs.length ? runs.filter(r => r.status === 'PUBLISHED').length / runs.length : 0,
    trust: mean(runs.map(r => r.trustScore).filter((x): x is number => typeof x === 'number')),
    cost: mean(runs.map(r => r.stats.totalCostUsd).filter((x): x is number => typeof x === 'number')),
  };
}

async function main() {
  const pubs = await prisma.thinkTankPublication.findMany({
    orderBy: { createdAt: 'desc' }, take: limit,
    select: { id: true, status: true, trustScore: true, criticalLoopResult: true, createdAt: true },
  });
  const runs = pubs.map(p => ({
    status: p.status as string,
    trustScore: p.trustScore,
    stats: ((p.criticalLoopResult as any)?.stats ?? {}) as Record<string, any>,
  }));

  console.log(`\n=== Step marginal value — ${runs.length} runs ===\n`);
  console.log(`${'step'.padEnd(16)} ${'flag'.padEnd(19)} ${'fired'.padStart(5)} ${'pubRate'.padStart(8)} ${'trust'.padStart(6)} ${'cost'.padStart(6)}  verdict`);
  console.log('-'.repeat(96));

  for (const step of STEPS) {
    const withStep: typeof runs = [];
    const without: typeof runs = [];
    const signals: string[] = [];
    for (const r of runs) {
      const s = r.stats[step.key];
      if (s != null) { withStep.push(r); signals.push(step.valueOf(s).signal); }
      else without.push(r);
    }

    const a = cohortStats(withStep);
    const verdict =
      withStep.length === 0 ? 'NEVER FIRED — deletion candidate or opt-in stub'
      : withStep.length === runs.length ? 'always on'
      : withStep.length < 3 ? `sparse (n=${withStep.length}) — needs controlled run`
      : 'cohort Δ below — confounded, verify with flag-off batch';

    const delta = withStep.length > 0 && without.length > 0
      ? `${(a.publishRate * 100).toFixed(0)}%/${(cohortStats(without).publishRate * 100).toFixed(0)}%`
      : '—';
    console.log(
      `${step.key.padEnd(16)} ${step.flag.padEnd(19)} ${String(withStep.length).padStart(5)} ${delta.padStart(8)} ${(a.trust ? a.trust.toFixed(1) : '—').padStart(6)} ${(a.cost ? '$' + a.cost.toFixed(2) : '—').padStart(6)}  ${verdict}`,
    );
    if (withStep.length > 0) {
      const uniq = [...new Set(signals)].slice(0, 2);
      for (const s of uniq) console.log(`${''.padEnd(46)}↳ ${s}`);
    }
  }

  // P1/5 rule: a flag-enabled step that never produced a measurable signal
  // across replays is a deletion candidate, not a keep.
  const neverFired = STEPS.filter(s => !runs.some(r => r.stats[s.key] != null));
  const deadSignal = STEPS.filter(s => {
    const fired = runs.filter(r => r.stats[s.key] != null);
    return fired.length >= 3 && fired.every(r => !s.valueOf(r.stats[s.key]).fired);
  });
  if (neverFired.length || deadSignal.length) {
    console.log('-'.repeat(96));
    for (const s of neverFired) console.log(`DELETE?  ${s.key} (${s.flag}) — zero fires in ${runs.length} runs, gates: ${s.gates}`);
    for (const s of deadSignal) console.log(`REVIEW   ${s.key} (${s.flag}) — fires but produces no signal`);
    console.log('');
  }

  const all = cohortStats(runs);
  console.log('-'.repeat(96));
  console.log(`overall: publishRate ${(all.publishRate * 100).toFixed(0)}% | trust ${all.trust.toFixed(1)} | cost/run $${all.cost.toFixed(2)}\n`);
  console.log('To turn a correlation into a decision: run `eval:runs` on a batch with the flag');
  console.log('forced off (env override in runPipelineCore opts) on comparable queries.\n');
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
