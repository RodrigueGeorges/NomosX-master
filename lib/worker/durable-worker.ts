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

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ClaimedJob {
  id: string;
  type: string;
  payload: unknown;
  correlationId: string;
  attempts: number;
  maxRetries: number;
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
      OR: [
        { status: 'PENDING', scheduledFor: { lte: now } },
        { status: 'RUNNING', lockedUntil: { lt: now } },
      ],
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  });
  if (!candidate) return null;

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
      attempts: { increment: 1 },
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
    maxRetries: fresh.maxRetries,
  };
}

// ─── Execution ──────────────────────────────────────────────────────────────

function startHeartbeat(jobId: string, workerId: string, lockMs: number): NodeJS.Timeout {
  const timer = setInterval(() => {
    prisma.job
      .updateMany({
        where: { id: jobId, lockedBy: workerId, status: 'RUNNING' },
        data: { lockedUntil: new Date(Date.now() + lockMs) },
      })
      .catch((err) => console.warn(`[Worker] heartbeat failed for ${jobId}:`, err));
  }, HEARTBEAT_MS);
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

export async function executeJob(
  job: ClaimedJob,
  workerId: string,
  lockMs = DEFAULT_LOCK_MS
): Promise<'completed' | 'retried' | 'dead'> {
  const handler = handlers.get(job.type);
  const heartbeat = startHeartbeat(job.id, workerId, lockMs);

  try {
    if (!handler) throw new Error(`No handler registered for job type "${job.type}"`);
    const result = await handler(job.payload, job);
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        result: result === undefined ? undefined : (result as object),
        finishedAt: new Date(),
        lockedBy: null,
        lockedUntil: null,
      },
    });
    return 'completed';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    const willRetry = job.attempts < job.maxRetries;

    if (willRetry) {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'PENDING',
          scheduledFor: new Date(Date.now() + backoffMs(job.attempts)),
          lockedBy: null,
          lockedUntil: null,
          lastError: message,
          errorStack: stack,
        },
      });
      return 'retried';
    }

    await prisma.job.update({
      where: { id: job.id },
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
    clearInterval(heartbeat);
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
  for (;;) {
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
      `[Worker ${workerId}] claimed ${job.type} ${job.id} (attempt ${job.attempts}/${job.maxRetries})`
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
