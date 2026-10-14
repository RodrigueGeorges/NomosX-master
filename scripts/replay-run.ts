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
import { existsSync, readFileSync, unlinkSync } from 'fs';
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
  allowMisses: number; // replay-mode cassette misses tolerated (default 0)
}

const DEPTHS = new Set(['surface', 'standard', 'deep', 'strategic']);

function formatToDepth(format?: string): string {
  return format === 'strategic' ? 'strategic' : format === 'memo' ? 'standard' : 'deep';
}

function parseArgs(argv: string[]): ReplayArgs {
  const args: ReplayArgs = { tolerance: 0, cleanup: false, record: false, allowMisses: 0 };
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
    else if (a === '--allow-misses') args.allowMisses = Number(next());
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
  // A self-describing fixture (--cassette with a .meta.json sidecar) needs no
  // DB loader — question/depth/corpus/frozenContext all come from the meta.
  const metaPath = args.cassette ? `${args.cassette}.meta.json` : undefined;
  if (!args.publicationId && !args.pipelineRunId && !(metaPath && existsSync(metaPath))) {
    console.error('replay-run: --publication, --pipeline-run, or a --cassette with meta sidecar required');
    process.exit(2);
  }

  // Force the mode BEFORE any LLM call — cassette path optional (default file).
  process.env.NOMOSX_LLM_MODE = args.record ? 'record' : 'replay';
  if (args.cassette) process.env.NOMOSX_LLM_CASSETTE = args.cassette;

  // Deterministic RNG: bootstrapCI (foresight-delphi, simulation-agent),
  // ts-setrank shuffles and the persistence-tail sampling gate all call
  // Math.random — an unseeded sequence drifts confidence intervals that land
  // inside elenchus/simulation prompts, and their key drift cascades. Seeding
  // in BOTH record and replay makes the random stream part of the fixture.
  {
    let s = 0xC0FFEE;
    Math.random = () => {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Misses append to <cassette>.misses.jsonl across runs — start fresh so the
  // post-run count reflects THIS run only.
  if (args.cassette && existsSync(`${args.cassette}.misses.jsonl`)) {
    try { unlinkSync(`${args.cassette}.misses.jsonl`); } catch { /* diagnostic only */ }
  }
  // Cassette run token: record tags every entry with a fresh run id so the
  // same file can hold multiple runs without FIFO cross-contamination —
  // identical prompts across runs (framing, judge) MUST serve this run's
  // response, not whichever was appended first. Replay sets the token from
  // the meta sidecar below.
  const cassetteRun = args.record ? crypto.randomUUID() : undefined;
  if (cassetteRun) process.env.NOMOSX_CASSETTE_RUN = cassetteRun;

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
  } else if (args.pipelineRunId) {
    const run = await prisma.pipelineRun.findUnique({
      where: { id: args.pipelineRunId },
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
  if (metaPath && existsSync(metaPath)) {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    // Both modes take the corpus descriptor (question/depth/sourceIds) —
    // a re-record must run the SAME fixed corpus to stay comparable.
    question = question ?? meta.question;
    domain = domain ?? meta.domain;
    depth = args.depth ?? meta.depth ?? depth;
    if (!sourceIds.length) {
      sourceIds = (meta.frozenContext?.allSourceIds as string[] | undefined)
        ?? (meta.sourceIds as string[] | undefined) ?? [];
    }
    if (!args.record) {
      // Replay-only: frozen inputs + recorded outcomes. A record must
      // compute every channel live and capture its own snapshot.
      frozenContext = frozenContext ?? meta.frozenContext;
      recordedTrust = recordedTrust ?? meta.recordedTrust;
      recordedGate = recordedGate ?? meta.recordedGate;
      recordedCost = recordedCost ?? meta.recordedCostUsd;
      if (meta.cassetteRun) process.env.NOMOSX_CASSETTE_RUN = meta.cassetteRun;
    }
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

  // Replay through the full publication funnel — runAndPublishInquiry
  // exercises the publication gate the plain pipeline call skipped, so the
  // recorded gate decision is actually reproduced (and diffed) below.
  const { runAndPublishInquiry } = await import('../lib/agent/inquiry-orchestrator');
  const started = Date.now();
  const result = await runAndPublishInquiry({
    question,
    domain: domain ?? 'general',
    depth: depth as never,
    seedSourceIds: sourceIds,
    source: 'replay',
    skipDuplicateCheck: true,
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
  });
  const pipeline = result.pipeline;

  const stats = (pipeline?.stats ?? {}) as Record<string, any>;
  const replayedTrust = result.trustScore ?? stats.criticalLoop?.finalScore;
  const replayedCost = result.costUsd ?? stats.totalCostUsd;
  const replayedGate = result.gate?.decision ?? null;
  const replayedStatus = result.status;
  const replayedRefusal = pipeline?.refusal ? pipeline.refusalReason : null;

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
        cassetteRun,
        frozenContext: frozen,
        recordedTrust: replayedTrust,
        recordedGate: result.gate?.decision ?? null,
        recordedStatus: result.status,
        recordedCostUsd: stats.totalCostUsd ?? result.costUsd ?? null,
        pipelineRunId: pipeline?.pipelineRunId ?? null,
        recordedAt: new Date().toISOString(),
      };
      writeFileSync(`${args.cassette}.meta.json`, JSON.stringify(meta));
      // Compact: a cassette file may accumulate entries from several record
      // runs (record appends). Keep only this run's entries so the committed
      // fixture is exactly one run — replay filtering is belt-and-suspenders
      // on top of this.
      if (cassetteRun && existsSync(args.cassette)) {
        const kept = readFileSync(args.cassette, 'utf8')
          .split('\n').filter(l => l.trim())
          .filter(l => { try { return JSON.parse(l).run === cassetteRun; } catch { return false; } });
        writeFileSync(args.cassette, kept.join('\n') + (kept.length ? '\n' : ''));
        console.log(`[replay] cassette compacted to run ${cassetteRun.slice(0, 8)}… — ${kept.length} entries kept`);
      }
      console.log(`[replay] fixture meta written → ${args.cassette}.meta.json (${(meta.frozenContext?.readings?.length ?? 0)} readings, ${(meta.frozenContext?.allSourceIds?.length ?? 0)} sourceIds, inputs=${Object.keys(meta.frozenContext?.inputs ?? {}).length})`);
    } catch (e) {
      console.warn('[replay] meta sidecar write failed (non-fatal):', e);
    }
  }

  const { getCassetteMissCount } = await import('../lib/llm/cassette');
  const cassetteMisses = args.record ? 0 : getCassetteMissCount();

  const report = {
    recorded: { trust: recordedTrust, gate: recordedGate, costUsd: recordedCost, reasons: recordedReasons },
    replayed: { trust: replayedTrust, gate: replayedGate, status: replayedStatus, costUsd: replayedCost, refusal: replayedRefusal ?? null },
    replayedIds: { pipelineRunId: pipeline?.pipelineRunId ?? null, briefId: result.briefId ?? null, publicationId: result.publicationId ?? null },
    cassetteMisses,
    durationMs: Date.now() - started,
  };
  console.log('[replay] RESULT', JSON.stringify(report, null, 2));
  console.log(`[replay] cassette misses: ${cassetteMisses}`);

  if (args.cleanup) {
    // Replay artefacts are reruns of rows that already exist — delete only
    // the rows this replay just created, in FK-safe order: publication
    // children cascade on the ThinkTankPublication delete; EditorialDecision
    // has no publication FK (linked via signalId/draftId) so it is removed by
    // the run's signal + time window; brief before pipelineRun (brief
    // references the run).
    try {
      if (result.signalId) {
        const decDel = await prisma.editorialDecision.deleteMany({
          where: { signalId: result.signalId, createdAt: { gte: new Date(started) } },
        });
        if (decDel.count > 0) console.log(`[replay] cleanup: deleted ${decDel.count} editorialDecision row(s) for signal ${result.signalId}`);
      }
      if (result.publicationId) {
        await prisma.thinkTankPublication.delete({ where: { id: result.publicationId } });
        console.log(`[replay] cleanup: deleted thinkTankPublication ${result.publicationId}`);
      }
      if (result.briefId) {
        await prisma.brief.delete({ where: { id: result.briefId } });
        console.log(`[replay] cleanup: deleted brief ${result.briefId}`);
      }
      if (pipeline?.pipelineRunId) {
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
  // Gate drift is a hard fail regardless of tolerance — the funnel now
  // replays the gate, so a divergent verdict is the signal this exists for.
  if (!args.record && recordedGate && replayedGate && replayedGate !== recordedGate) {
    console.error(`[replay] FAIL — gate drift: recorded=${recordedGate} replayed=${replayedGate}`);
    process.exit(1);
  }
  // A cassette miss means the replay silently took a different path than the
  // recording (fallbacks run, downstream prompts drift). Hard-fail on any
  // miss beyond --allow-misses, even when trust/gate still match.
  if (!args.record && cassetteMisses > args.allowMisses) {
    console.error(`[replay] FAIL — ${cassetteMisses} cassette miss(es) exceed --allow-misses ${args.allowMisses} (see ${args.cassette}.misses.jsonl)`);
    process.exit(1);
  }
  console.log('[replay] OK');
  process.exit(0);
}

main().catch((err) => {
  console.error('[replay] FAILED:', err);
  process.exit(1);
});
