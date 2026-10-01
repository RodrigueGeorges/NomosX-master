/**
 * Durable worker tests — claim semantics, retry/backoff, dead-letter,
 * stale-lock reclamation. Prisma is mocked; no DB required.
 */

import { claimNextJob, executeJob, registerJobHandler, runWorkerLoop, saveJobProgress, assertWorkerMemoryLimits } from '@/lib/worker/durable-worker';
import { getExecutionSignal } from '@/lib/worker/execution-scope';
import { enqueueThinkTankCycle } from '@/lib/worker/think-tank-queue';
import { prisma } from '@/lib/db';
import { registerAllJobHandlers } from '@/lib/worker/job-handlers';
import { runThinkTankCycle } from '@/lib/agent/think-tank-dispatcher';

jest.mock('@/lib/agent/think-tank-dispatcher', () => ({ runThinkTankCycle: jest.fn() }));

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
    pipelineRun: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
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
    status: 'PENDING', priority: 5, attempts: 1, reclaims: 0, maxRetries: 2,
    scheduledFor: new Date(0), startedAt: null, lockedBy: null, lockedUntil: null,
    movedToDeadLetter: false, ...over,
  } as never;
}

const savedAutonomy = process.env.NOMOSX_AUTONOMOUS_ENABLED;
beforeEach(() => {
  jest.clearAllMocks();
  process.env.NOMOSX_AUTONOMOUS_ENABLED = '1';
});
afterAll(() => {
  if (savedAutonomy === undefined) delete process.env.NOMOSX_AUTONOMOUS_ENABLED;
  else process.env.NOMOSX_AUTONOMOUS_ENABLED = savedAutonomy;
});

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

  test('reclaim increments reclaims, not the retry budget', async () => {
    mocked.findFirst.mockResolvedValue(
      jobRow({ status: 'RUNNING', lockedUntil: new Date(0), attempts: 1, reclaims: 0 })
    );
    mocked.updateMany.mockResolvedValue({ count: 1 } as never);
    mocked.findUnique.mockResolvedValue(
      jobRow({ status: 'RUNNING', attempts: 1, reclaims: 1, lockedBy: 'w1' })
    );
    const job = await claimNextJob('w1');
    expect(job?.reclaims).toBe(1);
    const data = mocked.updateMany.mock.calls[0][0]?.data as Record<string, unknown>;
    expect(data.reclaims).toEqual({ increment: 1 });
    expect(data.attempts).toBeUndefined();
  });

  test('fresh PENDING claim consumes the retry budget', async () => {
    mocked.findFirst.mockResolvedValue(jobRow());
    mocked.updateMany.mockResolvedValue({ count: 1 } as never);
    mocked.findUnique.mockResolvedValue(jobRow({ status: 'RUNNING', attempts: 2 }));
    await claimNextJob('w1');
    const data = mocked.updateMany.mock.calls[0][0]?.data as Record<string, unknown>;
    expect(data.attempts).toEqual({ increment: 1 });
    expect(data.reclaims).toBeUndefined();
  });

  test('dead-letters a poison job at the reclaim cap instead of reclaiming', async () => {
    mocked.findFirst.mockResolvedValue(
      jobRow({ status: 'RUNNING', lockedUntil: new Date(0), reclaims: 2 })
    );
    mocked.updateMany.mockResolvedValue({ count: 1 });
    mocked.deadLetter.mockResolvedValue({} as never);
    const job = await claimNextJob('w1');
    expect(job).toBeNull();
    expect(mocked.update).not.toHaveBeenCalled();
    expect(mocked.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED', movedToDeadLetter: true }),
      })
    );
    expect(mocked.deadLetter).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ originalJobId: 'j1' }) })
    );
  });

  test('graceful_shutdown reclaim is free and consumes the marker', async () => {
    // A SIGTERM'd worker (deploy) releases the lock with lastError =
    // 'graceful_shutdown'. The reclaim must NOT consume the poison-job
    // reclaims budget — even past the cap — and the marker is cleared so a
    // subsequent real crash counts normally.
    mocked.findFirst.mockResolvedValue(
      jobRow({ status: 'RUNNING', lockedUntil: new Date(0), reclaims: 5, lastError: 'graceful_shutdown' })
    );
    mocked.updateMany.mockResolvedValue({ count: 1 } as never);
    mocked.findUnique.mockResolvedValue(
      jobRow({ status: 'RUNNING', reclaims: 5, lockedBy: 'w1', lastError: null })
    );
    const job = await claimNextJob('w1');
    expect(job?.id).toBe('j1');
    const data = mocked.updateMany.mock.calls[0][0]?.data as Record<string, unknown>;
    expect(data.reclaims).toBeUndefined();
    expect(data.lastError).toBeNull();
    expect(mocked.deadLetter).not.toHaveBeenCalled();
  });
});

describe('executeJob', () => {
  test('completes and clears the lock', async () => {
    registerJobHandler('T_OK', async () => ({ ok: true }));
    mocked.updateMany.mockResolvedValue({ count: 1 } as never);
    const out = await executeJob({ id: 'j1', type: 'T_OK', payload: {}, correlationId: 'c', attempts: 1, reclaims: 0, maxRetries: 2 }, 'w1');
    expect(out).toBe('completed');
    expect(mocked.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'j1', status: 'RUNNING', lockedBy: 'w1' }),
        data: expect.objectContaining({ status: 'COMPLETED', lockedBy: null, lockedUntil: null }),
      })
    );
  });

  test('does not resurrect a job cancelled mid-run', async () => {
    registerJobHandler('T_OK', async () => ({ ok: true }));
    // Job was CANCELLED/reclaimed while the handler ran → guard matches 0 rows
    mocked.updateMany.mockResolvedValue({ count: 0 } as never);
    const out = await executeJob({ id: 'j1', type: 'T_OK', payload: {}, correlationId: 'c', attempts: 1, reclaims: 0, maxRetries: 2 }, 'w1');
    expect(out).toBe('lost');
    expect(mocked.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'RUNNING', lockedBy: 'w1' }) })
    );
  });

  test('retries with backoff while attempts remain', async () => {
    registerJobHandler('T_FAIL', async () => { throw new Error('boom'); });
    mocked.updateMany.mockResolvedValue({ count: 1 } as never);
    const out = await executeJob({ id: 'j1', type: 'T_FAIL', payload: {}, correlationId: 'c', attempts: 1, reclaims: 0, maxRetries: 2 }, 'w1');
    expect(out).toBe('retried');
    const data = mocked.updateMany.mock.calls[0][0]?.data as Record<string, unknown>;
    expect(data.status).toBe('PENDING');
    expect(data.scheduledFor).toBeInstanceOf(Date);
    expect(data.lastError).toBe('boom');
  });

  test('dead-letters when attempts exhausted', async () => {
    mocked.updateMany.mockResolvedValue({ count: 1 } as never);
    mocked.deadLetter.mockResolvedValue({} as never);
    const out = await executeJob({ id: 'j1', type: 'T_FAIL', payload: { p: 1 }, correlationId: 'c1', attempts: 2, reclaims: 0, maxRetries: 2 }, 'w1');
    expect(out).toBe('dead');
    expect(mocked.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', movedToDeadLetter: true }) })
    );
    expect(mocked.deadLetter).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ originalJobId: 'j1', type: 'T_FAIL', failureReason: 'boom' }) })
    );
  });

  test('a failing handler that lost its lease cannot create a dead-letter', async () => {
    registerJobHandler('T_LOST_FAIL', async () => { throw new Error('late failure'); });
    mocked.updateMany.mockResolvedValue({ count: 0 });
    expect(await executeJob({ id: 'j1', type: 'T_LOST_FAIL', payload: {}, correlationId: 'c', attempts: 1, reclaims: 0, maxRetries: 1 }, 'w1')).toBe('lost');
    expect(mocked.deadLetter).not.toHaveBeenCalled();
  });

  test('progress cannot overwrite a cancelled or reclaimed job', async () => {
    mocked.updateMany.mockResolvedValue({ count: 0 });
    await expect(saveJobProgress('j1', { doneKeys: [] }, 'w1')).rejects.toThrow('lease lost');
    expect(mocked.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'j1', status: 'RUNNING', lockedBy: 'w1' }),
    }));
  });

  test('lost heartbeat aborts the handler scope and cannot mark the job completed', async () => {
    let heartbeat!: () => Promise<void>;
    const timer = setInterval(() => {}, 1000000);
    const originalInterval = global.setInterval;
    global.setInterval = ((fn: () => Promise<void>) => {
      heartbeat = fn;
      return timer;
    }) as typeof setInterval;
    try {
      registerJobHandler('T_WAIT', async () => new Promise((_, reject) => {
        const signal = getExecutionSignal()!;
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      }));
      mocked.updateMany.mockResolvedValue({ count: 0 });
      const work = executeJob({ id: 'j1', type: 'T_WAIT', payload: {}, correlationId: 'c', attempts: 1, reclaims: 0, maxRetries: 1 }, 'w1');
      await heartbeat();
      expect(await work).toBe('lost');
      expect(mocked.updateMany).toHaveBeenCalledTimes(1);
      expect(mocked.deadLetter).not.toHaveBeenCalled();
    } finally {
      global.setInterval = originalInterval;
      clearInterval(timer);
    }
  });

  test('missing handler fails the job', async () => {
    mocked.updateMany.mockResolvedValue({ count: 1 } as never);
    mocked.deadLetter.mockResolvedValue({} as never);
    const out = await executeJob({ id: 'j1', type: 'T_UNKNOWN', payload: {}, correlationId: 'c', attempts: 3, reclaims: 0, maxRetries: 3 }, 'w1');
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

describe('cost containment', () => {
  test.each(['max', 'unreadable', '0', 'NaN'])('rejects an unknown memory ceiling: %s', (limit) => {
    expect(() => assertWorkerMemoryLimits(480 * 1024 * 1024, limit)).toThrow();
  });

  test('rejects the observed 6.4GB heap in a 1GB cgroup', () => {
    expect(() => assertWorkerMemoryLimits(6455e6, '999997440')).toThrow();
    expect(() => assertWorkerMemoryLimits(480 * 1024 * 1024, '999997440')).not.toThrow();
  });

  beforeAll(() => registerAllJobHandlers());

  test('disabled autonomy does not enqueue or read the database', async () => {
    delete process.env.NOMOSX_AUTONOMOUS_ENABLED;
    expect(await enqueueThinkTankCycle({ mode: 'weekly' })).toEqual({
      enqueued: false, jobId: '', reason: 'autonomy_disabled',
    });
    expect(mocked.findUnique).not.toHaveBeenCalled();
    expect(mocked.create).not.toHaveBeenCalled();
  });

  test('disabled autonomy filters think-tank claims', async () => {
    delete process.env.NOMOSX_AUTONOMOUS_ENABLED;
    mocked.findFirst.mockResolvedValue(null);
    await claimNextJob('w1');
    expect(mocked.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ type: { not: 'THINK_TANK_CYCLE' } }),
    }));
  });

  test.each(['CANCELLED', 'FAILED'])(
    'does not automatically requeue a %s job',
    async (status) => {
      mocked.findUnique.mockResolvedValue(jobRow({ status }));
      expect(await enqueueThinkTankCycle({ mode: 'weekly' })).toEqual({
        enqueued: false, jobId: 'j1', reason: 'requires_manual_review',
      });
      expect(mocked.update).not.toHaveBeenCalled();
      expect(mocked.create).not.toHaveBeenCalled();
    },
  );

  test.each([
    { mode: 'weekly', maxExecutions: 4 },
    { mode: 'weekly', maxPublications: 0 },
    { mode: 'weekly', maxPublications: 1.5 },
    { mode: 'weekly', budgetUsd: -1 },
    { mode: 'weekly', budgetUsd: Number.POSITIVE_INFINITY },
    { mode: 'invalid' },
    null,
  ])('rejects invalid cycle payload before dispatch: %j', async (payload) => {
    mocked.updateMany.mockResolvedValue({ count: 1 });
    mocked.deadLetter.mockResolvedValue({} as never);
    jest.mocked(runThinkTankCycle).mockClear();
    const outcome = await executeJob({
      id: 'j1', type: 'THINK_TANK_CYCLE', payload, correlationId: 'test',
      attempts: 1, reclaims: 0, maxRetries: 1,
    }, 'w1');
    expect(outcome).toBe('dead');
    expect(runThinkTankCycle).not.toHaveBeenCalled();
  });

  test('forwards the publication and budget limits to the dispatcher', async () => {
    mocked.updateMany.mockResolvedValue({ count: 1 });
    jest.mocked(runThinkTankCycle).mockResolvedValue({ success: true } as never);
    await executeJob({
      id: 'j1', type: 'THINK_TANK_CYCLE',
      payload: { mode: 'weekly', maxPublications: 1, budgetUsd: 0.5 },
      correlationId: 'test', attempts: 1, reclaims: 0, maxRetries: 1,
    }, 'w1');
    expect(runThinkTankCycle).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'weekly', maxPublications: 1, budgetUsd: 0.5,
    }));
  });

  test('persists an explicit cycle budget at enqueue', async () => {
    mocked.findUnique.mockResolvedValue(null);
    mocked.findFirst.mockResolvedValue(null);
    mocked.create.mockResolvedValue({ id: 'new1' } as never);
    const options = { mode: 'weekly' as const, maxPublications: 1, budgetUsd: 0.5 };
    await enqueueThinkTankCycle(options);
    expect(mocked.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ payload: options }),
    }));
  });
});

describe('runWorkerLoop', () => {
  test('--once exits after empty poll', async () => {
    mocked.findFirst.mockResolvedValue(null);
    const n = await runWorkerLoop({ once: true, workerId: 'w-test' });
    expect(n).toBe(0);
  });
});
