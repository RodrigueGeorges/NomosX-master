/**
 * Durable Worker — NomosX
 *
 * DB-backed job runner for jobs that outlive any single HTTP request or
 * serverless invocation (think-tank cycles take 45–75 min; Netlify functions
 * cap at 15 min). The Job row is the source of truth: a worker crash leaves a
 * stale lock that the next worker reclaims — no run is silently lost.
 *
 * Flow:
 *   cron/API → enqueue Job (PENDING) → 202
 *   worker (any always-on host with DATABASE_URL) → claim → heartbeat →
 *   handler → COMPLETED | retry w/ backoff | FAILED + JobDeadLetter
 *
 * Recovery semantics:
 *   - Claim is atomic (updateMany guard) → safe for multiple workers.
 *   - RUNNING jobs whose `lockedUntil` expired are reclaimed — the lock IS
 *     the liveness proof; handlers must be idempotent at the run level
 *     (the think-tank cycle is: dedup happens inside runThinkTankCycle).
 *   - attempts increments per claim; exhausted attempts → dead-letter.
 */

import { prisma } from '@/lib/db';
import { isThinkTankEnabled, THINK_TANK_JOB_TYPE } from './think-tank-queue';
import { assertExecutionActive, withExecutionSignal } from './execution-scope';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ClaimedJob {
  id: string;
  type: string;
  payload: unknown;
  correlationId: string;
  attempts: number;
  /** Lock-expiry reclaims — a crashed worker's job resumed by another worker.
   *  Separate from `attempts` (the retry budget): a reclaim is not a failure. */
  reclaims: number;
  maxRetries: number;
  /** Mid-run progress written by the handler — also the resume state after a
   * reclaim (e.g. the think-tank dispatch list + done keys survive a crash). */
  result?: unknown;
  workerId?: string;
}

export type JobHandler = (payload: unknown, job: ClaimedJob) => Promise<unknown>;

export interface WorkerOptions {
  workerId?: string;
  pollMs?: number;
  lockMs?: number;
  /** Process at most N jobs then exit (0 = unlimited). */
  maxJobs?: number;
  /** Exit after the first empty poll — for scheduled "worker tick" invocations. */
  once?: boolean;
}

const handlers = new Map<string, JobHandler>();

export function registerJobHandler(type: string, handler: JobHandler): void {
  handlers.set(type, handler);
}

export function getRegisteredJobTypes(): string[] {
  return [...handlers.keys()];
}

// ─── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_LOCK_MS = 15 * 60 * 1000; // 15 min, renewed by heartbeat
const HEARTBEAT_MS = 120_000; // 2 min
const DEFAULT_POLL_MS = 10_000;
const MAX_BACKOFF_MS = 30 * 60 * 1000;
/** A job that outlives this many worker locks is poison (it kills every worker
 *  that touches it) — dead-letter instead of reclaiming forever. Sized for a
 *  crash-loop environment: kills every ~15min through a ~4h cycle legitimately
 *  cost ~16 reclaims; sub-step checkpoints let a converging job still finish. */
const MAX_RECLAIMS = Number(process.env.NOMOSX_MAX_RECLAIMS ?? 2);
if (!Number.isInteger(MAX_RECLAIMS) || MAX_RECLAIMS < 0 || MAX_RECLAIMS > 3) {
  throw new Error('NOMOSX_MAX_RECLAIMS must be an integer between 0 and 3');
}

function backoffMs(attempts: number): number {
  return Math.min(MAX_BACKOFF_MS, 60_000 * 2 ** Math.max(0, attempts - 1));
}

// ─── Claim ──────────────────────────────────────────────────────────────────

/**
 * Atomically claim the next runnable job: PENDING & due, or RUNNING with an
 * expired lock (dead worker). Returns null when nothing is claimable or the
 * race was lost.
 */
export async function claimNextJob(
  workerId: string,
  lockMs = DEFAULT_LOCK_MS
): Promise<ClaimedJob | null> {
  const now = new Date();

  const candidate = await prisma.job.findFirst({
    where: {
      movedToDeadLetter: false,
      ...(!isThinkTankEnabled() ? { type: { not: THINK_TANK_JOB_TYPE } } : {}),
      OR: [
        { status: 'PENDING', scheduledFor: { lte: now } },
        { status: 'RUNNING', lockedUntil: { lt: now } },
      ],
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  });
  if (!candidate) return null;

  // A RUNNING claim is a lock-expiry reclaim (the previous worker died mid-job),
  // not a fresh attempt — it consumes `reclaims`, not the retry budget.
  const isReclaim = candidate.status === 'RUNNING';
  // A worker that released its lock on SIGTERM writes the 'graceful_shutdown'
  // marker into lastError — an operator deploy is not a poison event. Graceful
  // reclaims don't consume the reclaims budget; the marker is cleared on claim
  // so a subsequent REAL crash still counts against it.
  const isGracefulReclaim = isReclaim && candidate.lastError === 'graceful_shutdown';

  // Poison-job guard: a job that keeps outliving every worker's lock loops
  // forever and starves the queue — bound the reclaims, then dead-letter.
  if (isReclaim && !isGracefulReclaim && candidate.reclaims >= MAX_RECLAIMS) {
    console.error(
      `[Worker ${workerId}] dead-lettering ${candidate.type} ${candidate.id}: reclaims exhausted (${candidate.reclaims}/${MAX_RECLAIMS})`
    );
    const stopped = await prisma.job.updateMany({
      where: { id: candidate.id, status: 'RUNNING', lockedBy: candidate.lockedBy, lockedUntil: { lt: now }, reclaims: candidate.reclaims },
      data: {
        status: 'FAILED',
        finishedAt: now,
        lockedBy: null,
        lockedUntil: null,
        lastError: `Job outlived ${candidate.reclaims} worker locks — likely poison`,
        movedToDeadLetter: true,
        deadLetterReason: `reclaims_exhausted:${candidate.reclaims}/${MAX_RECLAIMS}`,
      },
    });
    if (stopped.count !== 1) return null;
    await prisma.jobDeadLetter
      .create({
        data: {
          originalJobId: candidate.id,
          type: candidate.type,
          payload: candidate.payload as object,
          correlationId: candidate.correlationId,
          failureReason: `Job outlived ${candidate.reclaims} worker locks — likely poison`,
          attempts: candidate.attempts,
          lastAttemptAt: now,
        },
      })
      .catch((e) => console.warn('[Worker] dead-letter write failed:', e));
    return null;
  }

  const claimed = await prisma.job.updateMany({
    where: {
      id: candidate.id,
      OR: [
        { status: 'PENDING' },
        { status: 'RUNNING', lockedUntil: { lt: now } },
      ],
    },
    data: {
      status: 'RUNNING',
      lockedBy: workerId,
      lockedUntil: new Date(now.getTime() + lockMs),
      startedAt: candidate.startedAt ?? now,
      ...(isReclaim
        ? isGracefulReclaim
          ? { lastError: null } // graceful release — free reclaim, consume the marker
          : { reclaims: { increment: 1 } }
        : { attempts: { increment: 1 } }),
    },
  });
  if (claimed.count === 0) return null;

  const fresh = await prisma.job.findUnique({ where: { id: candidate.id } });
  if (!fresh) return null;
  return {
    id: fresh.id,
    type: fresh.type,
    payload: fresh.payload,
    correlationId: fresh.correlationId,
    attempts: fresh.attempts,
    reclaims: fresh.reclaims,
    maxRetries: fresh.maxRetries,
    result: fresh.result ?? undefined,
  };
}

/**
 * Persist mid-run progress on the Job row (`result` field). On a crash the
 * next worker's claim sees this state in `job.result` — a handler that stores
 * its dispatch list + done keys here resumes mid-cycle instead of restarting.
 * Overwritten by the final result at completion — while RUNNING it reads as
 * live progress (observability bonus).
 */
export async function saveJobProgress(jobId: string, progress: unknown, workerId: string): Promise<void> {
  assertExecutionActive();
  const updated = await prisma.job.updateMany({
    where: { id: jobId, status: 'RUNNING', lockedBy: workerId, lockedUntil: { gt: new Date() } },
    data: { result: progress as object },
  });
  if (updated.count !== 1) throw new Error('Job progress rejected: execution lease lost');
}

// ─── Execution ──────────────────────────────────────────────────────────────

function startHeartbeat(jobId: string, workerId: string, lockMs: number, controller: AbortController): { stop: () => void; assertLeaseActive: () => void } {
  let busy = false;
  let lastTick = Date.now();
  let leaseExpiresAt = lastTick + lockMs;
  const assertLeaseActive = () => {
    if (Date.now() >= leaseExpiresAt) controller.abort(new Error('Job lease expired'));
    controller.signal.throwIfAborted();
  };
  let expiry = setTimeout(() => controller.abort(new Error('Job lease expired')), lockMs);
  expiry.unref();
  const timer = setInterval(async () => {
    // Suspend/resume detection: after a machine sleep every wall-clock
    // deadline fires at once and the run's durations become meaningless
    // (observed live: a 19.4h cycle with a 17.3h scout phase). Log loudly so
    // post-mortems can separate sleep corruption from real slowness.
    const tickGap = Date.now() - lastTick;
    lastTick = Date.now();
    if (tickGap > HEARTBEAT_MS * 3) {
      console.error(
        `[Worker ${workerId}] HEARTBEAT GAP ${Math.round(tickGap / 60000)}min — probable host suspend; ` +
        `all wall-clock deadlines fired simultaneously, run timings are unreliable`
      );
    }
    if (Date.now() >= leaseExpiresAt) controller.abort(new Error('Job lease expired'));
    if (busy || controller.signal.aborted) return;
    busy = true;
    const mem = process.memoryUsage();
    console.log(
      `[Worker ${workerId}] heartbeat job=${jobId.slice(-10)} rss=${Math.round(mem.rss / 1e6)}MB heap=${Math.round(mem.heapUsed / 1e6)}/${Math.round(mem.heapTotal / 1e6)}MB`
    );
    try {
      const renewedUntil = Date.now() + lockMs;
      const renewed = await prisma.job.updateMany({
        where: { id: jobId, lockedBy: workerId, status: 'RUNNING', lockedUntil: { gt: new Date() } },
        data: { lockedUntil: new Date(renewedUntil) },
      });
      if (renewed.count !== 1) throw new Error('Job execution lease lost');
      assertLeaseActive();
      leaseExpiresAt = renewedUntil;
      assertLeaseActive();
      clearTimeout(expiry);
      expiry = setTimeout(() => controller.abort(new Error('Job lease expired')), Math.max(0, leaseExpiresAt - Date.now()));
      expiry.unref();
    } catch (err) {
      controller.abort(err);
      console.warn(`[Worker] heartbeat failed for ${jobId}:`, err);
      return;
    } finally {
      busy = false;
    }
    // Durable telemetry — Railway drops log lines under bursts (the scout
    // fan-out emits hundreds/sec), so a memory curve written to the DB is the
    // only post-mortem that survives a silent SIGKILL. Tiny rows, ~25/run.
    prisma.agentAuditLog
      .create({
        data: {
          action: 'WORKER_MEM',
          agent: 'durable_worker',
          resource: jobId,
          metadata: JSON.stringify({
            workerId,
            rssMb: Math.round(mem.rss / 1e6),
            heapUsedMb: Math.round(mem.heapUsed / 1e6),
            heapTotalMb: Math.round(mem.heapTotal / 1e6),
            externalMb: Math.round((mem.external ?? 0) / 1e6),
            t: Date.now(),
          }),
          timestamp: new Date(),
        },
      })
      .catch(() => undefined);
  }, HEARTBEAT_MS);
  if (typeof timer.unref === 'function') timer.unref();
  return { stop: () => { clearInterval(timer); clearTimeout(expiry); }, assertLeaseActive };
}

let activeJob: { id: string; workerId: string } | null = null;
let activeController: AbortController | null = null;

export function assertWorkerMemoryLimits(heapLimitBytes: number, cgroupLimit: string): void {
  const limit = Number(cgroupLimit);
  if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(heapLimitBytes) || heapLimitBytes <= 0 || heapLimitBytes > limit * 0.65) {
    throw new Error('Worker memory configuration is unsafe or unknown; refusing to claim jobs');
  }
}

export function cancelActiveJob(reason = 'Worker shutting down'): void {
  activeController?.abort(new Error(reason));
}

/** The job currently executing in this process — used by SIGTERM handlers to
 *  release the lock early so a replacement worker can reclaim instantly. */
export function getActiveJob(): { id: string; workerId: string } | null {
  return activeJob;
}

export async function executeJob(
  job: ClaimedJob,
  workerId: string,
  lockMs = DEFAULT_LOCK_MS
): Promise<'completed' | 'retried' | 'dead' | 'lost'> {
  const handler = handlers.get(job.type);
  const controller = new AbortController();
  const { stop: stopHeartbeat, assertLeaseActive } = startHeartbeat(job.id, workerId, lockMs, controller);
  activeJob = { id: job.id, workerId };
  activeController = controller;

  try {
    if (!handler) throw new Error(`No handler registered for job type "${job.type}"`);
    const result = await withExecutionSignal(controller.signal, () => handler(job.payload, { ...job, workerId }));
    assertLeaseActive();
    // Guard on our own lock: if the job was cancelled or reclaimed while the
    // handler ran, don't resurrect it as COMPLETED.
    const updated = await prisma.job.updateMany({
      where: { id: job.id, status: 'RUNNING', lockedBy: workerId, lockedUntil: { gt: new Date() } },
      data: {
        status: 'COMPLETED',
        result: result === undefined ? undefined : (result as object),
        finishedAt: new Date(),
        lockedBy: null,
        lockedUntil: null,
      },
    });
    return updated.count === 1 ? 'completed' : 'lost';
  } catch (err) {
    try { assertLeaseActive(); } catch { return 'lost'; }
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    const willRetry = job.attempts < job.maxRetries;

    if (willRetry) {
      const updated = await prisma.job.updateMany({
        where: { id: job.id, status: 'RUNNING', lockedBy: workerId, lockedUntil: { gt: new Date() } },
        data: {
          status: 'PENDING',
          scheduledFor: new Date(Date.now() + backoffMs(job.attempts)),
          lockedBy: null,
          lockedUntil: null,
          lastError: message,
          errorStack: stack,
        },
      });
      return updated.count === 1 ? 'retried' : 'lost';
    }

    const updated = await prisma.job.updateMany({
      where: { id: job.id, status: 'RUNNING', lockedBy: workerId, lockedUntil: { gt: new Date() } },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        lockedBy: null,
        lockedUntil: null,
        lastError: message,
        errorStack: stack,
        movedToDeadLetter: true,
        deadLetterReason: `attempts_exhausted:${job.attempts}/${job.maxRetries}`,
      },
    });
    if (updated.count !== 1) return 'lost';
    await prisma.jobDeadLetter
      .create({
        data: {
          originalJobId: job.id,
          type: job.type,
          payload: job.payload as object,
          correlationId: job.correlationId,
          failureReason: message,
          errorStack: stack,
          attempts: job.attempts,
          lastAttemptAt: new Date(),
        },
      })
      .catch((e) => console.warn('[Worker] dead-letter write failed:', e));
    return 'dead';
  } finally {
    stopHeartbeat();
    controller.abort(new Error('Job execution scope closed'));
    activeJob = null;
    activeController = null;
  }
}

// ─── Loop ───────────────────────────────────────────────────────────────────

export async function runWorkerLoop(options: WorkerOptions = {}): Promise<number> {
  const workerId = options.workerId ?? `worker-${process.pid}-${Date.now().toString(36)}`;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const lockMs = options.lockMs ?? DEFAULT_LOCK_MS;
  const maxJobs = options.maxJobs ?? 0;

  console.log(
    `[Worker ${workerId}] starting — handlers: ${getRegisteredJobTypes().join(', ') || '(none)'}`
  );

  let processed = 0;
  let lastSweep = 0;
  for (;;) {
    // Stale-run sweep: pipelineRuns still RUNNING long after their last write
    // were orphaned by a killed process (serverless timeout, crash). They
    // would otherwise read as "running" forever — mark them FAILED so the
    // funnel metrics and the dossier/watch layer see the truth.
    if (Date.now() - lastSweep > SWEEP_INTERVAL_MS) {
      lastSweep = Date.now();
      const mem = process.memoryUsage();
      console.log(
        `[Worker ${workerId}] sweep mem rss=${Math.round(mem.rss / 1e6)}MB heap=${Math.round(mem.heapUsed / 1e6)}/${Math.round(mem.heapTotal / 1e6)}MB activeJob=${activeJob?.id ?? 'none'}`
      );
      await sweepStalePipelineRuns(workerId);
      // Prediction resolver: due OPEN predictions get one bounded LLM
      // verdict each — closes the prospective-learning loop that was dead
      // code (813 OPEN / 0 resolved live). 5 per sweep ≈ $0.005, never
      // throws, failures expire honestly.
      try {
        const { resolveDuePredictions } = await import('../agent/prediction-tracker');
        await resolveDuePredictions(5);
      } catch { /* non-blocking */ }
    }

    let job: ClaimedJob | null = null;
    try {
      job = await claimNextJob(workerId, lockMs);
    } catch (err) {
      console.error(`[Worker ${workerId}] claim error:`, err);
      await sleep(pollMs);
      continue;
    }

    if (!job) {
      if (options.once) break;
      await sleep(pollMs);
      continue;
    }

    console.log(
      `[Worker ${workerId}] claimed ${job.type} ${job.id} (attempt ${job.attempts}/${job.maxRetries}, reclaim ${job.reclaims}/${MAX_RECLAIMS})`
    );
    const outcome = await executeJob(job, workerId, lockMs);
    processed++;
    console.log(`[Worker ${workerId}] ${job.type} ${job.id} → ${outcome}`);

    if (maxJobs > 0 && processed >= maxJobs) break;
  }

  console.log(`[Worker ${workerId}] done — ${processed} job(s) processed`);
  return processed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Stale pipeline-run sweep ───────────────────────────────────────────────

const SWEEP_INTERVAL_MS = 10 * 60 * 1000; // every 10 min
/** A RUNNING pipelineRun that hasn't written for this long is dead. */
const STALE_RUN_MS = 45 * 60 * 1000;

async function sweepStalePipelineRuns(workerId: string): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - STALE_RUN_MS);
    const stale = await prisma.pipelineRun.updateMany({
      where: { status: 'RUNNING', updatedAt: { lt: cutoff } },
      data: { status: 'FAILED', finishedAt: new Date() },
    });
    if (stale.count > 0) {
      console.log(`[Worker ${workerId}] swept ${stale.count} stale RUNNING pipeline run(s) → FAILED`);
    }
  } catch (err) {
    console.warn(`[Worker ${workerId}] stale-run sweep failed (non-blocking):`, err instanceof Error ? err.message : err);
  }
}
