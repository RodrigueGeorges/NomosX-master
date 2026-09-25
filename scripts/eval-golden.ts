/**
 * Golden-Set Eval Harness — regression measurement for the editorial pipeline.
 *
 * Runs every case in evals/golden-set.json through the REAL quality stack:
 *   - claim decomposition + NLI grounding (groundClaimsWithNLI)
 *   - SAFE live-search verification on the doubtful tail
 *   - 4-dimension critic panel
 *
 * Then compares aggregate scores against evals/baseline.json and exits
 * non-zero on regression (> 5 points on any tracked metric). This is the
 * missing measurement layer: every pipeline change gets scored, not guessed.
 *
 * Usage:
 *   tsx --env-file=.env.local scripts/eval-golden.ts            # full eval
 *   tsx --env-file=.env.local scripts/eval-golden.ts --update   # write new baseline
 *   tsx --env-file=.env.local scripts/eval-golden.ts --case=id  # single case
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const GOLDEN_PATH = join(ROOT, 'evals', 'golden-set.json');
const BASELINE_PATH = join(ROOT, 'evals', 'baseline.json');
const RESULTS_DIR = join(ROOT, 'evals', 'results');

interface GoldenCase {
  id: string;
  title: string;
  topic: string;
  htmlFile?: string;          // path under evals/corpus/
  publicationId?: string;     // fetch from DB instead of file
  sources?: Array<{ title: string; abstract: string; fullText?: string }>;
  expectations: {
    minGroundedness?: number; // 0-1
    minPanelScore?: number;   // 0-100
    minDifferentiation?: number; // 1-10, only scored when the stored pub has stats.positioning
    maxContradicted?: number;
  };
}

interface CaseScore {
  id: string;
  groundedness: number;
  citationRate: number;
  panelScore: number;
  panelVeto: boolean;
  differentiation: number | null; // 1-10, null when no fieldContext available
  safeSupported: number;
  safeContradicted: number;
  durationMs: number;
  error?: string;
}

async function loadCaseHtml(c: GoldenCase): Promise<{ html: string; sources: any[]; positioning: any | null }> {
  if (c.htmlFile) {
    const html = readFileSync(join(ROOT, c.htmlFile), 'utf-8');
    return { html, sources: c.sources ?? [], positioning: null };
  }
  if (c.publicationId) {
    const { prisma } = await import('../lib/db');
    const pub = await prisma.thinkTankPublication.findUnique({ where: { id: c.publicationId } });
    if (!pub) throw new Error(`publication ${c.publicationId} not found`);
    const dbSources = pub.sourceIds?.length
      ? await prisma.source.findMany({ where: { id: { in: pub.sourceIds } } })
      : [];
    const sources = dbSources.map((s: any) => ({
      title: s.title, abstract: s.abstract, fullText: s.fullText, provider: s.provider,
    }));
    const positioning = (pub.stats as any)?.positioning ?? null;
    return { html: pub.html, sources, positioning };
  }
  throw new Error(`case ${c.id}: needs htmlFile or publicationId`);
}

async function scoreCase(c: GoldenCase): Promise<CaseScore> {
  const start = Date.now();
  const { html, sources, positioning } = await loadCaseHtml(c);

  // Real stack: NLI grounding (includes SAFE escalation since Sprint integration)
  const { groundClaimsWithNLI } = await import('../lib/agent/claim-grounding');
  const grounding = await groundClaimsWithNLI(html, sources, { mode: 'flag' });

  // Critic panel — 5th "differentiation" dimension activates when the stored
  // publication carries positioning stats (field coverage + gaps + weak claims)
  const { runCriticPanel } = await import('../lib/agent/critic-panel');
  const fieldContext = positioning ? {
    fieldCoverage: positioning.fieldCoverage ?? [],
    uncoveredDimensions: positioning.gaps ?? positioning.uncoveredDimensions ?? [],
    weakClaims: positioning.weakClaims ?? [],
    strongestPiece: positioning.strongestPiece ?? null,
  } : undefined;
  const panel = await runCriticPanel(html, c.topic, { fieldContext });
  const diffDim = panel.dimensions.find(d => d.dimension === 'differentiation');

  return {
    id: c.id,
    groundedness: grounding.groundedness,
    citationRate: grounding.total > 0 ? (grounding.supported + grounding.partial + grounding.unsupported + grounding.contradicted) / grounding.total : 0,
    panelScore: panel.overallScore,
    panelVeto: panel.veto,
    differentiation: diffDim ? diffDim.score : null,
    safeSupported: 0, // SAFE runs inside grounding; reported in details
    safeContradicted: 0,
    durationMs: Date.now() - start,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const updateBaseline = args.includes('--update');
  const singleCase = args.find(a => a.startsWith('--case='))?.split('=')[1];

  if (!existsSync(GOLDEN_PATH)) {
    console.error(`Golden set not found: ${GOLDEN_PATH}`);
    process.exit(1);
  }
  const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf-8')) as { cases: GoldenCase[] };
  let cases = golden.cases;
  if (singleCase) cases = cases.filter(c => c.id === singleCase);
  if (cases.length === 0) {
    console.error('No cases to evaluate');
    process.exit(1);
  }

  console.log(`[GOLDEN-EVAL] ${cases.length} case(s)`);
  const scores: CaseScore[] = [];

  for (const c of cases) {
    process.stdout.write(`  ${c.id} ... `);
    try {
      const s = await scoreCase(c);
      scores.push(s);
      const expOk =
        (c.expectations.minGroundedness === undefined || s.groundedness >= c.expectations.minGroundedness) &&
        (c.expectations.minPanelScore === undefined || s.panelScore >= c.expectations.minPanelScore) &&
        (c.expectations.minDifferentiation === undefined || s.differentiation === null || s.differentiation >= c.expectations.minDifferentiation);
      console.log(`ground=${(s.groundedness * 100).toFixed(0)}% panel=${s.panelScore}${s.differentiation !== null ? ` diff=${s.differentiation}/10` : ''} veto=${s.panelVeto} ${expOk ? 'OK' : 'BELOW EXPECTATIONS'} (${(s.durationMs / 1000).toFixed(0)}s)`);
    } catch (err) {
      scores.push({
        id: c.id, groundedness: 0, citationRate: 0, panelScore: 0,
        panelVeto: true, differentiation: null, safeSupported: 0, safeContradicted: 0,
        durationMs: 0, error: String(err).slice(0, 200),
      });
      console.log(`ERROR: ${String(err).slice(0, 120)}`);
    }
  }

  // Aggregate
  const n = scores.length;
  const diffScored = scores.filter(s => s.differentiation !== null);
  const agg = {
    groundedness: scores.reduce((s, x) => s + x.groundedness, 0) / n,
    citationRate: scores.reduce((s, x) => s + x.citationRate, 0) / n,
    panelScore: scores.reduce((s, x) => s + x.panelScore, 0) / n,
    differentiation: diffScored.length > 0
      ? diffScored.reduce((s, x) => s + (x.differentiation ?? 0), 0) / diffScored.length
      : null,
    errors: scores.filter(s => s.error).length,
    evaluatedAt: new Date().toISOString(),
    cases: scores,
  };

  console.log(`\n[GOLDEN-EVAL] AGGREGATE: groundedness=${(agg.groundedness * 100).toFixed(1)}% citations=${(agg.citationRate * 100).toFixed(1)}% panel=${agg.panelScore.toFixed(1)}${agg.differentiation !== null ? ` differentiation=${agg.differentiation.toFixed(1)}/10 (${diffScored.length} cases)` : ''} errors=${agg.errors}`);

  // Persist results
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(join(RESULTS_DIR, 'latest.json'), JSON.stringify(agg, null, 2));

  // Baseline comparison / update
  if (updateBaseline) {
    writeFileSync(BASELINE_PATH, JSON.stringify(agg, null, 2));
    console.log('[GOLDEN-EVAL] Baseline updated.');
    process.exit(0);
  }

  if (existsSync(BASELINE_PATH)) {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
    const TOLERANCE = 5; // points
    const regressions: string[] = [];
    const check = (name: string, now: number, before: number) => {
      const delta = (now - before) * (name === 'panelScore' ? 1 : 100);
      if (delta < -TOLERANCE) regressions.push(`${name}: ${(before * (name === 'panelScore' ? 1 : 100)).toFixed(1)} → ${(now * (name === 'panelScore' ? 1 : 100)).toFixed(1)} (${delta.toFixed(1)})`);
    };
    check('groundedness', agg.groundedness, baseline.groundedness ?? 0);
    check('citationRate', agg.citationRate, baseline.citationRate ?? 0);
    check('panelScore', agg.panelScore, baseline.panelScore ?? 0);
    if (agg.differentiation !== null && typeof baseline.differentiation === 'number') {
      const delta = agg.differentiation - baseline.differentiation;
      if (delta < -1.5) regressions.push(`differentiation: ${baseline.differentiation.toFixed(1)} → ${agg.differentiation.toFixed(1)}`);
    }
    if (agg.errors > (baseline.errors ?? 0)) regressions.push(`errors: ${baseline.errors} → ${agg.errors}`);

    if (regressions.length > 0) {
      console.error(`\n[GOLDEN-EVAL] ❌ REGRESSION vs baseline:\n  ${regressions.join('\n  ')}`);
      process.exit(1);
    }
    console.log('\n[GOLDEN-EVAL] ✅ No regression vs baseline.');
  } else {
    console.log('\n[GOLDEN-EVAL] No baseline found — run with --update to create one.');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('[GOLDEN-EVAL] Fatal:', err);
  process.exit(1);
});
