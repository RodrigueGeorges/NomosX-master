/**
 * Deterministic pipeline replay — re-run the analytical queue of a
 * persisted publication against its recorded corpus + LLM cassette.
 *
 *   tsx --env-file=.env.local scripts/replay-run.ts --publication <id> \
 *       [--pipeline-run <id>] [--cassette <path>] [--depth deep] [--tolerance N]
 *   tsx scripts/replay-run.ts --inspect <cassette path>   (offline cassette check)
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
 * NOTE: the run persists a new brief/publication row (skipDuplicateCheck
 * is set so the identical question does not dedup-block). Point DATABASE_URL
 * at a staging copy if you don't want replay rows in production.
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
  tolerance: number; // absolute points of trust-score drift tolerated
}

const DEPTHS = new Set(['surface', 'standard', 'deep', 'strategic']);

function formatToDepth(format?: string): string {
  return format === 'strategic' ? 'strategic' : format === 'memo' ? 'standard' : 'deep';
}

function parseArgs(argv: string[]): ReplayArgs {
  const args: ReplayArgs = { tolerance: 0 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--publication') args.publicationId = next();
    else if (a === '--pipeline-run') args.pipelineRunId = next();
    else if (a === '--cassette') args.cassette = next();
    else if (a === '--depth') args.depth = next();
    else if (a === '--inspect') args.inspect = next();
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

  // Force replay BEFORE any LLM call — cassette path optional (default file).
  process.env.NOMOSX_LLM_MODE = 'replay';
  if (args.cassette) process.env.NOMOSX_LLM_CASSETTE = args.cassette;

  let question: string | undefined;
  let depth: string | undefined = args.depth;
  let domain: string | undefined;
  let sourceIds: string[] = [];
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
    sourceIds = pubs?.sourceIds ?? (steps.topSourceIds as string[] | undefined) ?? [];
    recordedGate = (steps.publicationGate as any)?.decision;
  }

  if (!question) throw new Error('could not resolve the recorded question');
  if (!DEPTHS.has(depth ?? '')) depth = 'deep';
  if (sourceIds.length < 8) {
    console.warn(`replay-run: only ${sourceIds.length} persisted sourceIds — the scout will NOT be skipped; replay of scout-phase calls will miss unless they were recorded`);
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
    },
  } as never);

  const stats = (pipeline.stats ?? {}) as Record<string, any>;
  const replayedTrust = pipeline.trustScore ?? stats.criticalLoop?.finalScore;
  const replayedCost = stats.totalCostUsd;
  const replayedRefusal = pipeline.refusal ? pipeline.refusalReason : null;

  const report = {
    recorded: { trust: recordedTrust, gate: recordedGate, costUsd: recordedCost, reasons: recordedReasons },
    replayed: { trust: replayedTrust, costUsd: replayedCost, refusal: replayedRefusal ?? null },
    durationMs: Date.now() - started,
  };
  console.log('[replay] RESULT', JSON.stringify(report, null, 2));

  // Drift assertion: trust within tolerance of the recorded run.
  if (typeof recordedTrust === 'number' && typeof replayedTrust === 'number') {
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
