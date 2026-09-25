/**
 * Durable worker tests — claim semantics, retry/backoff, dead-letter,
 * stale-lock reclamation. Prisma is mocked; no DB required.
 */

import { claimNextJob, executeJob, registerJobHandler, runWorkerLoop } from '@/lib/worker/durable-worker';
import { enqueueThinkTankCycle } from '@/lib/worker/think-tank-queue';
import { prisma } from '@/lib/db';

jest.mock('@/lib/db', () => ({
  prisma: {
    job: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    jobDeadLetter: { create: jest.fn() },
  },
}));

const mocked = {
  findFirst: jest.mocked(prisma.job.findFirst),
  findUnique: jest.mocked(prisma.job.findUnique),
  create: jest.mocked(prisma.job.create),
  update: jest.mocked(prisma.job.update),
  updateMany: jest.mocked(prisma.job.updateMany),
  deadLetter: jest.mocked(prisma.jobDeadLetter.create),
};

function jobRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'j1', type: 'T', payload: { x: 1 }, correlationId: 'c1',
    status: 'PENDING', priority: 5, attempts: 1, maxRetries: 2,
    scheduledFor: new Date(0), startedAt: null, lockedBy: null, lockedUntil: null,
    movedToDeadLetter: false, ...over,
  } as never;
}

beforeEach(() => jest.clearAllMocks());

describe('claimNextJob', () => {
  test('atomically claims a pending job', async () => {
    mocked.findFirst.mockResolvedValue(jobRow());
    mocked.updateMany.mockResolvedValue({ count: 1 } as never);
    mocked.findUnique.mockResolvedValue(jobRow({ status: 'RUNNING', attempts: 2, lockedBy: 'w1' }));
    const job = await claimNextJob('w1');
    expect(job?.id).toBe('j1');
    expect(mocked.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'RUNNING', lockedBy: 'w1' }) })
    );
  });

  test('returns null when nothing claimable or race lost', async () => {
    mocked.findFirst.mockResolvedValue(null);
    expect(await claimNextJob('w1')).toBeNull();

    mocked.findFirst.mockResolvedValue(jobRow());
    mocked.updateMany.mockResolvedValue({ count: 0 } as never);
    expect(await claimNextJob('w1')).toBeNull();
  });

  test('claim query covers stale RUNNING jobs with expired locks', async () => {
    mocked.findFirst.mockResolvedValue(null);
    await claimNextJob('w1');
    const where = mocked.findFirst.mock.calls[0][0]?.where as { OR: unknown[] };
    expect(where.OR).toHaveLength(2);
    expect(JSON.stringify(where)).toContain('lockedUntil');
  });
});

describe('executeJob', () => {
  test('completes and clears the lock', async () => {
    registerJobHandler('T_OK', async () => ({ ok: true }));
    mocked.update.mockResolvedValue({} as never);
    const out = await executeJob({ id: 'j1', type: 'T_OK', payload: {}, correlationId: 'c', attempts: 1, maxRetries: 2 }, 'w1');
    expect(out).toBe('completed');
    expect(mocked.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED', lockedBy: null, lockedUntil: null }) })
    );
  });

  test('retries with backoff while attempts remain', async () => {
    registerJobHandler('T_FAIL', async () => { throw new Error('boom'); });
    mocked.update.mockResolvedValue({} as never);
    const out = await executeJob({ id: 'j1', type: 'T_FAIL', payload: {}, correlationId: 'c', attempts: 1, maxRetries: 2 }, 'w1');
    expect(out).toBe('retried');
    const data = mocked.update.mock.calls[0][0]?.data as Record<string, unknown>;
    expect(data.status).toBe('PENDING');
    expect(data.scheduledFor).toBeInstanceOf(Date);
    expect(data.lastError).toBe('boom');
  });

  test('dead-letters when attempts exhausted', async () => {
    mocked.update.mockResolvedValue({} as never);
    mocked.deadLetter.mockResolvedValue({} as never);
    const out = await executeJob({ id: 'j1', type: 'T_FAIL', payload: { p: 1 }, correlationId: 'c1', attempts: 2, maxRetries: 2 }, 'w1');
    expect(out).toBe('dead');
    expect(mocked.deadLetter).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ originalJobId: 'j1', type: 'T_FAIL', failureReason: 'boom' }) })
    );
  });

  test('missing handler fails the job', async () => {
    mocked.update.mockResolvedValue({} as never);
    mocked.deadLetter.mockResolvedValue({} as never);
    const out = await executeJob({ id: 'j1', type: 'T_UNKNOWN', payload: {}, correlationId: 'c', attempts: 3, maxRetries: 3 }, 'w1');
    expect(out).toBe('dead');
  });
});

describe('enqueueThinkTankCycle', () => {
  test('creates a durable job', async () => {
    mocked.findUnique.mockResolvedValue(null);
    mocked.findFirst.mockResolvedValue(null);
    mocked.create.mockResolvedValue({ id: 'new1' } as never);
    const r = await enqueueThinkTankCycle({ mode: 'weekly' });
    expect(r).toEqual({ enqueued: true, jobId: 'new1' });
    expect(mocked.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'THINK_TANK_CYCLE', maxRetries: 1 }) })
    );
  });

  test('dedupes when already queued or running', async () => {
    mocked.findUnique.mockResolvedValue(jobRow({ idempotencyKey: 'k', status: 'PENDING' }));
    expect((await enqueueThinkTankCycle({ mode: 'weekly' })).reason).toBe('already_queued');

    mocked.findUnique.mockResolvedValue(null);
    mocked.findFirst.mockResolvedValue(jobRow({ status: 'RUNNING', lockedUntil: new Date(Date.now() + 60000) }));
    expect((await enqueueThinkTankCycle({ mode: 'breaking' })).reason).toBe('cycle_in_progress');
  });
});

describe('runWorkerLoop', () => {
  test('--once exits after empty poll', async () => {
    mocked.findFirst.mockResolvedValue(null);
    const n = await runWorkerLoop({ once: true, workerId: 'w-test' });
    expect(n).toBe(0);
  });
});
