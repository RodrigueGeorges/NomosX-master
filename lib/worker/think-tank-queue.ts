/**
 * Think-tank cycle enqueue — turns the cron-triggered long pipeline into a
 * durable Job row so cron routes return 202 immediately and a worker executes
 * the cycle without HTTP timeout constraints.
 */

import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import type { ThinkTankCycleMode } from '@/lib/agent/think-tank-dispatcher';

export const THINK_TANK_JOB_TYPE = 'THINK_TANK_CYCLE';

export interface EnqueueResult {
  enqueued: boolean;
  jobId: string;
  reason?: string;
}

/** ISO week stamp — one weekly cycle per calendar week. */
function weekStamp(d = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function idempotencyKeyFor(mode: ThinkTankCycleMode): string {
  if (mode === 'weekly') return `thinktank:weekly:${weekStamp()}`;
  // breaking runs 2×/day — key per 12h window to dedupe retries, not blocks
  const now = new Date();
  const half = now.getUTCHours() < 12 ? 'AM' : 'PM';
  return `thinktank:breaking:${now.toISOString().slice(0, 10)}-${half}`;
}

export async function enqueueThinkTankCycle(options: {
  mode: ThinkTankCycleMode;
  maxPublications?: number;
  idempotencyKey?: string;
  priority?: number;
}): Promise<EnqueueResult> {
  const key = options.idempotencyKey ?? idempotencyKeyFor(options.mode);

  const existing = await prisma.job.findUnique({ where: { idempotencyKey: key } });
  if (existing && ['PENDING', 'RUNNING'].includes(existing.status)) {
    return { enqueued: false, jobId: existing.id, reason: 'already_queued' };
  }
  if (existing?.status === 'COMPLETED') {
    return { enqueued: false, jobId: existing.id, reason: 'already_done' };
  }
  // FAILED / dead-lettered row with the same key: reset it instead of creating
  // a duplicate (idempotencyKey is unique — create would crash).
  if (existing) {
    const job = await prisma.job.update({
      where: { id: existing.id },
      data: {
        status: 'PENDING',
        payload: { mode: options.mode, maxPublications: options.maxPublications },
        attempts: 0,
        lastError: null,
        result: Prisma.JsonNull,
        startedAt: null,
        finishedAt: null,
        lockedUntil: null,
        lockedBy: null,
        scheduledFor: new Date(),
        priority: options.priority ?? 7,
      },
    });
    return { enqueued: true, jobId: job.id };
  }

  // Cross-key guard: never run two think-tank cycles concurrently.
  const running = await prisma.job.findFirst({
    where: {
      type: THINK_TANK_JOB_TYPE,
      status: 'RUNNING',
      lockedUntil: { gt: new Date() },
    },
  });
  if (running) {
    return { enqueued: false, jobId: running.id, reason: 'cycle_in_progress' };
  }

  const job = await prisma.job.create({
    data: {
      type: THINK_TANK_JOB_TYPE,
      payload: { mode: options.mode, maxPublications: options.maxPublications },
      correlationId: key,
      idempotencyKey: key,
      priority: options.priority ?? 7,
      maxRetries: 1, // a full cycle re-run costs ~$1+ — retry once only
    },
  });
  return { enqueued: true, jobId: job.id };
}

export async function getThinkTankJobStatus(jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    attempts: job.attempts,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    lastError: job.lastError,
    result: job.result,
  };
}
