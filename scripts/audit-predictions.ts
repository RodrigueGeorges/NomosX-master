/**
 * AUDIT PREDICTIONS — Claude §6: deduplicate, tag by run outcome, and flag
 * invalid questions so calibration only learns from predictions that shipped
 * in published notes with resolvable, non-trivial questions.
 *
 * Run outcome is joined via prediction.briefId → Brief.publishedAt /
 * pipelineRun.status. Predictions from held/failed runs are EXCLUDED from
 * the calibration set but counted for visibility.
 *
 * Usage: npx tsx scripts/audit-predictions.ts [--json]
 */

import { prisma } from '../lib/db';

interface AuditRow {
  id: string;
  claim: string;
  horizon: string;
  probability: number | null;
  status: string;
  kind: string;
  domain: string | null;
  probabilitySource: string | null;
  createdAt: string;
  briefPublished: boolean;
  runStatus: string | null;
  /** Calibration eligibility flags. */
  dupOf?: string;
  noHorizon?: boolean;
  trivialQuestion?: boolean;
}

const STOP = new Set('the a an and or of to in for on at by with from as is are was were be been it its this that will would could should can may might do does did have has had'.split(' '));

function questionFlags(claim: string, horizon: string): { noHorizon: boolean; trivialQuestion: boolean } {
  // Horizon must carry a parseable time anchor (year, quarter, or relative).
  const noHorizon = !/(19|20)\d{2}|q[1-4]|\b\d+\s*(day|week|month|year)s?\b/i.test(`${claim} ${horizon}`);
  // Trivial: <6 content words or a bare yes/no current-affairs recap.
  const words = claim.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3 && !STOP.has(w));
  const trivialQuestion = words.length < 6;
  return { noHorizon, trivialQuestion };
}

async function main() {
  const json = process.argv.includes('--json');
  const preds = await prisma.prediction.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, claim: true, horizon: true, probability: true, status: true,
      kind: true, domain: true, probabilitySource: true, createdAt: true,
      briefId: true,
    },
  });

  // Join run outcome: brief.publishedAt marks shipped notes; pipelineRun
  // status distinguishes held/failed/completed for unpublished briefs.
  const briefIds = [...new Set(preds.map(p => p.briefId).filter((x): x is string => !!x))];
  const briefs = await prisma.brief.findMany({
    where: { id: { in: briefIds } },
    select: { id: true, publishedAt: true, pipelineRunId: true },
  });
  const briefById = new Map(briefs.map(b => [b.id, b]));
  const runIds = [...new Set(briefs.map(b => b.pipelineRunId).filter((x): x is string => !!x))];
  const runs = await prisma.pipelineRun.findMany({
    where: { id: { in: runIds } },
    select: { id: true, status: true },
  });
  const runById = new Map(runs.map(r => [r.id, r.status]));

  const rows: AuditRow[] = [];
  const seenClaims = new Map<string, string>(); // normalized claim → first id
  for (const p of preds) {
    const brief = p.briefId ? briefById.get(p.briefId) : undefined;
    const runStatus = brief?.pipelineRunId ? runById.get(brief.pipelineRunId) ?? null : null;
    const norm = p.claim.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 160);
    const dupOf = seenClaims.get(norm);
    if (!dupOf) seenClaims.set(norm, p.id);
    const flags = questionFlags(p.claim, p.horizon);
    rows.push({
      id: p.id,
      claim: p.claim.slice(0, 140),
      horizon: p.horizon,
      probability: p.probability,
      status: p.status,
      kind: p.kind,
      domain: p.domain,
      probabilitySource: p.probabilitySource,
      createdAt: p.createdAt.toISOString(),
      briefPublished: !!brief?.publishedAt,
      runStatus,
      ...(dupOf ? { dupOf } : {}),
      ...(flags.noHorizon ? { noHorizon: true } : {}),
      ...(flags.trivialQuestion ? { trivialQuestion: true } : {}),
    });
  }

  // Calibration set: OPEN or resolved predictions that shipped in a published
  // note, are not duplicates, and have a parseable horizon + non-trivial claim.
  const calibration = rows.filter(r =>
    !r.dupOf && !r.noHorizon && !r.trivialQuestion && r.briefPublished,
  );
  const excluded = {
    unpublished: rows.filter(r => !r.briefPublished).length,
    duplicates: rows.filter(r => r.dupOf).length,
    noHorizon: rows.filter(r => r.noHorizon).length,
    trivial: rows.filter(r => r.trivialQuestion).length,
    noBrief: rows.filter(r => !r.briefPublished && r.runStatus === null).length,
  };

  const byRunStatus: Record<string, number> = {};
  for (const r of rows) {
    const k = r.briefPublished ? 'PUBLISHED' : (r.runStatus ?? 'no_run');
    byRunStatus[k] = (byRunStatus[k] ?? 0) + 1;
  }

  const report = {
    total: rows.length,
    calibrationSet: calibration.length,
    byRunOutcome: byRunStatus,
    excluded,
    byStatus: rows.reduce<Record<string, number>>((m, r) => { m[r.status] = (m[r.status] ?? 0) + 1; return m; }, {}),
    byKind: rows.reduce<Record<string, number>>((m, r) => { m[r.kind] = (m[r.kind] ?? 0) + 1; return m; }, {}),
    quantified: rows.filter(r => typeof r.probability === 'number').length,
    swarmSourced: rows.filter(r => r.probabilitySource === 'swarm').length,
    sampleExcluded: rows.filter(r => r.dupOf || r.noHorizon || r.trivialQuestion || !r.briefPublished).slice(0, 20),
  };

  if (json) {
    console.log(JSON.stringify({ report, rows }, null, 2));
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
}

main().catch(err => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
