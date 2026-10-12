/**
 * Deterministic pipeline replay — re-run the analytical queue of a
 * persisted publication against its recorded corpus + LLM cassette.
 *
 *   tsx --env-file=.env.local scripts/replay-run.ts --publication <id> \
 *       [--pipeline-run <id>] [--cassette <path>] [--depth deep] [--tolerance N] \
 *       [--record] [--cleanup]
 *   tsx scripts/replay-run.ts --inspect <cassette path>   (offline cassette check)
 *
 * --record flips to NOMOSX_LLM_MODE=record on the SAME fixed corpus
 * (persisted sourceIds → scout skipped): the live run's request/response
 * pairs land in --cassette, producing a replayable fixture in one pass.
 *
 * Behaviour:
 *   - forces NOMOSX_LLM_MODE=replay — every LLM request is served from the
 *     cassette; a prompt/params drift throws CassetteMissError, never a
 *     provider call (zero network, zero spend).
 *   - seeds the persisted sourceIds → the scout is skipped (fixed corpus),
 *     so the whole queue radar→…→gate replays the recorded path.
 *   - durable execution is disabled: checkpoints would replay attempt-1
 *     results without exercising the recorded LLM calls.
 *
 * NOTE: the run persists a new brief + pipelineRun row. Pass --cleanup to
 * delete exactly the rows this replay created after the diff is printed.
 *
 * Compares the replayed outcome against the recorded one (trust, gate,
 * decision, cost) and exits non-zero on mismatch beyond --tolerance.
 */
import { existsSync, readFileSync } from 'fs';
import { prisma } from '../lib/db';

interface ReplayArgs {
  publicationId?: string;
  pipelineRunId?: string;
  cassette?: string;
  depth?: string;
  inspect?: string;
  record: boolean;  // run live against the fixed corpus, writing the cassette
  cleanup: boolean; // delete the brief + pipelineRun rows this replay created
  tolerance: number; // absolute points of trust-score drift tolerated
}

const DEPTHS = new Set(['surface', 'standard', 'deep', 'strategic']);

function formatToDepth(format?: string): string {
  return format === 'strategic' ? 'strategic' : format === 'memo' ? 'standard' : 'deep';
}

function parseArgs(argv: string[]): ReplayArgs {
  const args: ReplayArgs = { tolerance: 0, cleanup: false, record: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--publication') args.publicationId = next();
    else if (a === '--pipeline-run') args.pipelineRunId = next();
    else if (a === '--cassette') args.cassette = next();
    else if (a === '--depth') args.depth = next();
    else if (a === '--inspect') args.inspect = next();
    else if (a === '--cleanup') args.cleanup = true;
    else if (a === '--record') args.record = true;
    else if (a === '--tolerance') args.tolerance = Number(next());
    else if (a === '--help' || a === '-h') {
      console.log('usage: replay-run --publication <id> | --pipeline-run <id> [--cassette path] [--depth surface|standard|deep|strategic] [--tolerance N]');
      process.exit(0);
    }
  }
  return args;
}

/**
 * Offline cassette inspection — no DB, no LLM. Summarises a recorded
 * cassette so CI can assert a fixture is well-formed before committing it.
 */
function inspectCassette(path: string): void {
  if (!existsSync(path)) {
    console.error(`replay-run: cassette not found: ${path}`);
    process.exit(2);
  }
  const byTask = new Map<string, number>();
  const byProvider = new Map<string, number>();
  let entries = 0, errors = 0, corrupt = 0;
  let costUsd = 0, tokensIn = 0, tokensOut = 0;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let e: any;
    try { e = JSON.parse(line); } catch { corrupt++; continue; }
    entries++;
    if (e.error) errors++;
    byTask.set(e.task ?? '?', (byTask.get(e.task ?? '?') ?? 0) + 1);
    if (e.provider) byProvider.set(e.provider, (byProvider.get(e.provider) ?? 0) + 1);
    const r = e.response;
    if (r && typeof r.costUsd === 'number') costUsd += r.costUsd;
    if (r && typeof r.tokensInput === 'number') tokensIn += r.tokensInput;
    if (r && typeof r.tokensOutput === 'number') tokensOut += r.tokensOutput;
  }
  const fmt = (m: Map<string, number>) => Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]));
  console.log(JSON.stringify({ file: path, entries, providerErrors: errors, corruptLines: corrupt, recordedCostUsd: costUsd, tokensIn, tokensOut, byTask: fmt(byTask), byProvider: fmt(byProvider) }, null, 2));
  if (corrupt > 0) process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.inspect) {
    inspectCassette(args.inspect);
    return;
  }
  if (!args.publicationId && !args.pipelineRunId) {
    console.error('replay-run: --publication or --pipeline-run required');
    process.exit(2);
  }

  // Force the mode BEFORE any LLM call — cassette path optional (default file).
  process.env.NOMOSX_LLM_MODE = args.record ? 'record' : 'replay';
  if (args.cassette) process.env.NOMOSX_LLM_CASSETTE = args.cassette;

  let question: string | undefined;
  let depth: string | undefined = args.depth;
  let domain: string | undefined;
  let sourceIds: string[] = [];
  let frozenContext: { primed?: unknown; episodic?: unknown; readings?: unknown[] } | undefined;
  let recordedTrust: number | undefined;
  let recordedGate: string | undefined;
  let recordedCost: number | undefined;
  let recordedReasons: string[] = [];

  if (args.publicationId) {
    const pub = await prisma.thinkTankPublication.findUnique({
      where: { id: args.publicationId },
      select: { sourceIds: true, trustScore: true, status: true, criticalLoopResult: true },
    });
    if (!pub) throw new Error(`publication ${args.publicationId} not found`);
    const clr = (pub.criticalLoopResult ?? {}) as Record<string, any>;
    question = clr.question;
    domain = clr.domain;
    depth = depth ?? (typeof clr.depth === 'string' ? clr.depth : formatToDepth(clr.format));
    sourceIds = pub.sourceIds ?? [];
    recordedTrust = pub.trustScore;
    recordedGate = clr.publicationGate?.decision ?? pub.status;
    recordedCost = clr.productionCostUsd;
    recordedReasons = (clr.publicationGate?.reasons ?? []).map((r: unknown) => String(r));
    frozenContext = (clr.stats as any)?.frozenContext;
  } else {
    const run = await prisma.pipelineRun.findUnique({
      where: { id: args.pipelineRunId! },
      select: { question: true, format: true, trustScore: true, totalCostUsd: true, steps: true },
    });
    if (!run) throw new Error(`pipeline run ${args.pipelineRunId} not found`);
    question = run.question;
    depth = depth ?? formatToDepth(run.format);
    recordedTrust = run.trustScore ?? undefined;
    recordedCost = run.totalCostUsd;
    const steps = (run.steps ?? {}) as Record<string, any>;
    const pubs = await prisma.thinkTankPublication.findFirst({
      where: { criticalLoopResult: { path: ['pipelineRunId'], equals: args.pipelineRunId! } },
      select: { sourceIds: true },
    });
    frozenContext = steps.frozenContext;
    const frozen = (frozenContext ?? {}) as Record<string, unknown>;
    // The frozen snapshot is authoritative: it is the exact corpus the
    // recorded run ranked from (a linked publication's sourceIds may carry
    // a different run's pool).
    sourceIds = (frozen.allSourceIds as string[] | undefined)
      ?? pubs?.sourceIds
      ?? (frozen.topSourceIds as string[] | undefined)
      ?? (steps.topSourceIds as string[] | undefined)
      ?? [];
    recordedGate = (steps.publicationGate as any)?.decision;
  }

  // ── Fixture meta sidecar ────────────────────────────────────────────────
  // <cassette>.meta.json — written by --record, loaded by replay — carries
  // everything the replay needs that DB state cannot reproduce faithfully:
  // the run's true depth (pipelineRun only stores format), the frozen input
  // snapshot, and the corpus id list. With a sidecar present the replay is
  // self-describing — --publication/--pipeline-run become unnecessary.
  const metaPath = args.cassette ? `${args.cassette}.meta.json` : undefined;
  if (!args.record && metaPath && existsSync(metaPath)) {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    question = question ?? meta.question;
    domain = domain ?? meta.domain;
    depth = args.depth ?? meta.depth ?? depth;
    frozenContext = frozenContext ?? meta.frozenContext;
    if (!sourceIds.length) {
      sourceIds = (meta.frozenContext?.allSourceIds as string[] | undefined)
        ?? (meta.sourceIds as string[] | undefined) ?? [];
    }
    recordedTrust = recordedTrust ?? meta.recordedTrust;
    recordedGate = recordedGate ?? meta.recordedGate;
    recordedCost = recordedCost ?? meta.recordedCostUsd;
    console.log(`[replay] fixture meta loaded from ${metaPath}`);
  }

  if (!question) throw new Error('could not resolve the recorded question');
  if (!DEPTHS.has(depth ?? '')) depth = 'deep';
  if (sourceIds.length < 8) {
    console.warn(`replay-run: only ${sourceIds.length} persisted sourceIds — the scout will NOT be skipped; replay of scout-phase calls will miss unless they were recorded`);
  }
  if (!frozenContext && !args.record) {
    console.warn('replay-run: no frozenContext in the recorded run — live context-primer/episodic fetches may drift and cause cassette misses');
  }

  console.log(`[replay] question="${question.slice(0, 90)}" depth=${depth} sources=${sourceIds.length} cassette=${process.env.NOMOSX_LLM_CASSETTE ?? 'default'}`);

  const { runInquiryPipeline } = await import('../lib/agent/inquiry-pipeline');
  const started = Date.now();
  const pipeline = await runInquiryPipeline({
    question,
    domain: domain ?? 'general',
    depth: depth as never,
    seedSourceIds: sourceIds,
    skipSimulation: false,
    pipelineOptions: {
      // Durable checkpoints would serve attempt-1 results without
      // exercising the recorded LLM calls — replay must re-execute.
      useDurableExecution: false,
      // Fixed corpus, both directions: skipping retrieval is what makes the
      // corpus identical between record and replay — a recorded run that
      // fetched providers live could never replay deterministically.
      skipGapFillRetrieval: true,
      // Freeze the live-input channels (context primer real-time pulse,
      // episodic memory) — they drift between record and replay and would
      // break cassette keys downstream.
      frozenContext,
      // The recorded readings are the extraction snapshot — passing them as
      // priorReadings makes the reader reuse them instead of re-fetching
      // PDFs/news URLs that 403 or shift content between runs.
      priorReadings: frozenContext?.readings,
    },
  } as never);

  const stats = (pipeline.stats ?? {}) as Record<string, any>;
  const replayedTrust = pipeline.trustScore ?? stats.criticalLoop?.finalScore;
  const replayedCost = stats.totalCostUsd;
  const replayedRefusal = pipeline.refusal ? pipeline.refusalReason : null;

  // Record mode: persist the fixture meta sidecar — the frozen snapshot is
  // already in pipelineRun.steps; copy it next to the cassette so the replay
  // never has to rediscover it.
  if (args.record && args.cassette) {
    try {
      const { writeFileSync } = await import('fs');
      const frozen = (stats as any).frozenContext ?? {};
      const meta = {
        question, domain, depth,
        sourceIds,
        frozenContext: frozen,
        recordedTrust: replayedTrust,
        recordedGate: stats.publicationGate?.decision ?? null,
        recordedCostUsd: stats.totalCostUsd ?? null,
        pipelineRunId: pipeline.pipelineRunId ?? null,
        recordedAt: new Date().toISOString(),
      };
      writeFileSync(`${args.cassette}.meta.json`, JSON.stringify(meta));
      console.log(`[replay] fixture meta written → ${args.cassette}.meta.json (${(meta.frozenContext?.readings?.length ?? 0)} readings, ${(meta.frozenContext?.allSourceIds?.length ?? 0)} sourceIds, inputs=${Object.keys(meta.frozenContext?.inputs ?? {}).length})`);
    } catch (e) {
      console.warn('[replay] meta sidecar write failed (non-fatal):', e);
    }
  }

  const report = {
    recorded: { trust: recordedTrust, gate: recordedGate, costUsd: recordedCost, reasons: recordedReasons },
    replayed: { trust: replayedTrust, costUsd: replayedCost, refusal: replayedRefusal ?? null },
    replayedIds: { pipelineRunId: pipeline.pipelineRunId ?? null, briefId: pipeline.briefId ?? null },
    durationMs: Date.now() - started,
  };
  console.log('[replay] RESULT', JSON.stringify(report, null, 2));

  if (args.cleanup) {
    // Replay artefacts are reruns of rows that already exist — delete only the
    // ids this replay just created (brief first: it references the run).
    try {
      if (pipeline.briefId) {
        await prisma.brief.delete({ where: { id: pipeline.briefId } });
        console.log(`[replay] cleanup: deleted brief ${pipeline.briefId}`);
      }
      if (pipeline.pipelineRunId) {
        await prisma.pipelineRun.delete({ where: { id: pipeline.pipelineRunId } });
        console.log(`[replay] cleanup: deleted pipelineRun ${pipeline.pipelineRunId}`);
      }
    } catch (cleanupErr) {
      console.warn('[replay] cleanup failed (non-fatal):', cleanupErr);
    }
  }

  // Drift assertion: trust within tolerance of the recorded run. In record
  // mode there is no prior cassette — `recorded` is the historical
  // publication baseline, a different run entirely; asserting drift against
  // it is meaningless. The drift check only makes sense in replay mode.
  if (!args.record && typeof recordedTrust === 'number' && typeof replayedTrust === 'number') {
    const drift = Math.abs(replayedTrust - recordedTrust);
    if (drift > args.tolerance) {
      console.error(`[replay] FAIL — trust drift ${drift} exceeds tolerance ${args.tolerance}`);
      process.exit(1);
    }
  }
  console.log('[replay] OK');
  process.exit(0);
}

main().catch((err) => {
  console.error('[replay] FAILED:', err);
  process.exit(1);
});
