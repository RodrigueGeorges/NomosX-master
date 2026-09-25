/**
 * Durable execution tests — stable-key resume, checkpoint cache hit,
 * file-backed payload fallback, staleness guard, generation isolation.
 * Prisma agentAuditLog is mocked as an in-memory store; no DB required.
 */

import { promises as fs } from 'fs';
import {
  initDurableRun,
  runDurableStep,
  durableResume,
  saveDurableStep,
  markDurableComplete,
  durableKeyFor,
} from '@/lib/agent/durable-execution';

// In-memory audit log rows, shared across the mocked prisma client.
const auditRows: Array<{ action: string; agent: string; resource: string; metadata: string; timestamp: Date }> = [];

jest.mock('@/lib/db', () => ({
  prisma: {
    agentAuditLog: {
      create: jest.fn(async ({ data }: any) => {
        auditRows.push({ ...data, timestamp: data.timestamp ?? new Date() });
        return data;
      }),
      findMany: jest.fn(async ({ where }: any) =>
        auditRows
          .filter(r => r.agent === where.agent && r.resource === where.resource)
          .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      ),
    },
  },
}));

beforeEach(() => {
  auditRows.length = 0;
  jest.clearAllMocks();
});

const STEP_SMALL = { value: 'hello' };
const STEP_BIG = { blob: 'x'.repeat(600 * 1024) }; // >512KB → file fallback

describe('durableKeyFor', () => {
  test('is stable across calls and normalizes the query', () => {
    const a = durableKeyFor('Will AI Governance FRAGMENT?!', 'strategic');
    const b = durableKeyFor('will ai governance fragment', 'strategic');
    expect(a).toBe(b);
    expect(a).toMatch(/^durable:strategic:/);
    // Different format → different key (no cross-format resume)
    expect(durableKeyFor('q', 'memo')).not.toBe(durableKeyFor('q', 'strategic'));
  });
});

describe('runDurableStep', () => {
  test('executes and persists on first call, returns cached on second', async () => {
    const runId = durableKeyFor('test query', 'brief');
    await initDurableRun(runId, 'test query');

    const fn = jest.fn(async () => STEP_SMALL);
    const first = await runDurableStep(runId, 'reader', fn);
    expect(first).toEqual(STEP_SMALL);
    expect(fn).toHaveBeenCalledTimes(1);

    const second = await runDurableStep(runId, 'reader', fn);
    expect(second).toEqual(STEP_SMALL);
    expect(fn).toHaveBeenCalledTimes(1); // cache hit — no re-execution
  });

  test('stable key: a NEW attempt (new INIT is skipped while running+fresh) resumes checkpoints', async () => {
    const runId = durableKeyFor('resumable query', 'strategic');
    await initDurableRun(runId, 'resumable query');
    await runDurableStep(runId, 'scout', async () => ({ ids: ['a', 'b'] }));

    // Simulate a new attempt after crash: init must NOT wipe completed steps
    await initDurableRun(runId, 'resumable query');
    const restored = await durableResume<{ ids: string[] }>(runId, 'scout');
    expect(restored).toEqual({ ids: ['a', 'b'] });
  });

  test('file fallback: >512KB payloads go to disk and reload transparently', async () => {
    const runId = durableKeyFor('big payload', 'brief');
    await initDurableRun(runId, 'big payload');
    await runDurableStep(runId, 'reader', async () => STEP_BIG);

    // The audit row must NOT contain the blob inline
    const stepRow = auditRows.find(r => r.action === 'DURABLE_STEP');
    const meta = JSON.parse(stepRow!.metadata);
    expect(meta.fileRef).toBeTruthy();
    expect(meta.output).toBeUndefined();
    expect(await fs.stat(meta.fileRef)).toBeTruthy();

    // And it still resolves to the full payload
    const cached = await runDurableStep(runId, 'reader', jest.fn());
    expect(cached).toEqual(STEP_BIG);
  });

  test('missing checkpoint file → cache miss → re-executes', async () => {
    const runId = durableKeyFor('purged tmp', 'brief');
    await initDurableRun(runId, 'purged tmp');
    await runDurableStep(runId, 'reader', async () => STEP_BIG);
    const meta = JSON.parse(auditRows.find(r => r.action === 'DURABLE_STEP')!.metadata);
    await fs.rm(meta.fileRef, { force: true });

    const fn = jest.fn(async () => ({ value: 'recomputed' }));
    const result = await runDurableStep(runId, 'reader', fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ value: 'recomputed' });
  });

  test('stale checkpoint (>resume window) is not reused', async () => {
    const runId = durableKeyFor('old query', 'brief');
    await initDurableRun(runId, 'old query');
    await runDurableStep(runId, 'scout', async () => ({ ids: ['old'] }));

    // Age every audit row beyond the 12h window
    for (const r of auditRows) r.timestamp = new Date(Date.now() - 13 * 60 * 60 * 1000);
    // Also age the completedAt inside the DURABLE_STEP metadata
    for (const r of auditRows) {
      if (r.action === 'DURABLE_STEP' || r.action === 'DURABLE_INIT') {
        const m = JSON.parse(r.metadata);
        if (m.completedAt) m.completedAt = Date.now() - 13 * 60 * 60 * 1000;
        if (m.createdAt) m.createdAt = Date.now() - 13 * 60 * 60 * 1000;
        r.metadata = JSON.stringify(m);
      }
    }

    const ckpt = await durableResume(runId, 'scout');
    expect(ckpt).toBeNull();

    const fn = jest.fn(async () => ({ ids: ['fresh'] }));
    const out = await runDurableStep(runId, 'scout', fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ ids: ['fresh'] });
  });

  test('markDurableComplete seals the run — later same-key runs start fresh', async () => {
    const runId = durableKeyFor('done query', 'brief');
    await initDurableRun(runId, 'done query');
    await runDurableStep(runId, 'scout', async () => ({ ids: ['s1'] }));
    await markDurableComplete(runId);

    // A new attempt on the same key: init opens a new generation
    await initDurableRun(runId, 'done query');
    const ckpt = await durableResume(runId, 'scout');
    expect(ckpt).toBeNull();

    const fn = jest.fn(async () => ({ ids: ['new-run'] }));
    expect(await runDurableStep(runId, 'scout', fn)).toEqual({ ids: ['new-run'] });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('saveDurableStep persists outside a closure (scout pattern)', async () => {
    const runId = durableKeyFor('save-outside', 'strategic');
    await initDurableRun(runId, 'save-outside');
    await saveDurableStep(runId, 'scout', { allSourceIds: ['x', 'y', 'z'] });
    const ckpt = await durableResume<{ allSourceIds: string[] }>(runId, 'scout');
    expect(ckpt?.allSourceIds).toEqual(['x', 'y', 'z']);
  });

  test('step failure does not persist — retry re-executes', async () => {
    const runId = durableKeyFor('flaky', 'brief');
    await initDurableRun(runId, 'flaky');
    let calls = 0;
    const fn = jest.fn(async () => {
      calls++;
      if (calls === 1) throw new Error('transient');
      return { ok: true };
    });
    await expect(runDurableStep(runId, 'analyst', fn)).rejects.toThrow('transient');
    expect(await runDurableStep(runId, 'analyst', fn)).toEqual({ ok: true });
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
