/**
 * EXPORT FORECASTBENCH — resolved predictions → ForecastBench-compatible JSONL.
 *
 * ForecastBench (Metaculus forecasting-tools, MIT) scores probabilistic
 * forecasts with an independent harness. This script exports every RESOLVED
 * quantified prediction so an external scorer — or a manual Brier audit —
 * can verify our track record without trusting our own arithmetic.
 *
 * Output: one JSON object per line (JSONL) to stdout or --out <file>.
 *
 * Fields follow the forecasting-tools question/resolution conventions where
 * they map; NomosX-specific lineage (briefId, probabilitySource, domain,
 * sentinel/strategic kind) is preserved for slice analysis.
 *
 * Usage:
 *   tsx scripts/export-forecastbench.ts [--out predictions.jsonl] [--since 2026-01-01]
 */

import { prisma } from '../lib/db';

interface Args {
  out?: string;
  since?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out' && argv[i + 1]) args.out = argv[++i];
    else if (argv[i] === '--since' && argv[i + 1]) args.since = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const where: Record<string, unknown> = {
    status: { in: ['CONFIRMED', 'REFUTED'] },
    resolvedAt: { not: null },
    probability: { not: null },
  };
  if (args.since) where.resolvedAt = { gte: new Date(args.since) };

  const rows = await prisma.prediction.findMany({
    where,
    select: {
      id: true, claim: true, horizon: true, probability: true,
      resolutionCriteria: true, outcome: true, resolvedAt: true,
      probabilitySource: true, kind: true, domain: true, briefId: true,
      dueAt: true, linkId: true,
    },
    orderBy: { resolvedAt: 'asc' },
  });

  const lines: string[] = [];
  let scored = 0;
  for (const p of rows) {
    // outcome: 'occurred' | 'not_occurred' | 'partially_occurred' | 'unclear'
    // ForecastBench needs a binary resolution — 'partially'/'unclear' are
    // exported with resolved=false-equivalent null so external scorers can
    // exclude them rather than us silently binarizing.
    const binary = p.outcome === 'occurred' ? 1 : p.outcome === 'not_occurred' ? 0 : null;
    const prob = p.probability!;
    const brier = binary !== null ? (prob - binary) ** 2 : null;
    if (brier !== null) scored++;
    lines.push(JSON.stringify({
      // ForecastBench question identity
      question_id: p.id,
      question: p.claim,
      resolution_criteria: p.resolutionCriteria,
      // Our forecast at registration time
      forecast_probability: prob,
      // Resolution
      resolved: binary !== null,
      outcome: binary,
      resolved_at: p.resolvedAt?.toISOString() ?? null,
      // Scoring (computed here for convenience; external scorer recomputes)
      brier_score: brier,
      // Lineage — slice analysis without joining back
      probability_source: p.probabilitySource ?? null,
      kind: p.kind,
      domain: p.domain ?? null,
      horizon: p.horizon,
      due_at: p.dueAt?.toISOString() ?? null,
      link_id: p.linkId ?? null,
      brief_id: p.briefId ?? null,
    }));
  }

  const payload = lines.join('\n') + (lines.length ? '\n' : '');
  if (args.out) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(args.out, payload);
    console.error(`wrote ${lines.length} predictions (${scored} binary-resolved) → ${args.out}`);
  } else {
    process.stdout.write(payload);
  }
  console.error(`total=${lines.length} binary_resolved=${scored}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
