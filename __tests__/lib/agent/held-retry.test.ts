/**
 * HELD-retry loop — a held signal is a pending obligation, not a verdict.
 *
 *   collect  → HELD signals past cooldown, bounded by HOLD-decision count,
 *              carrying persisted failureFeedback
 *   dispatch → skipDuplicateCheck (the prior HELD artifact would dedup-block
 *              the retry) + priorFailureFeedback into pipelineOptions
 *   persist  → held AND failed results write an EditorialDecision(HOLD) —
 *              the count doubles as the retry budget; a silent failure would
 *              retry forever
 */

import { executeDispatchQueue, runThinkTankCycle, type ThinkTankDispatchItem, type CadenceState } from '@/lib/agent/think-tank-dispatcher';
import { runAndPublishInquiry } from '@/lib/agent/inquiry-orchestrator';
import { runTopicRadar } from '@/lib/agent/topic-radar';
import { prisma } from '@/lib/db';

jest.mock('@/lib/agent/inquiry-orchestrator', () => ({
  runAndPublishInquiry: jest.fn(),
}));
jest.mock('@/lib/agent/topic-radar', () => ({
  runTopicRadar: jest.fn(),
}));
jest.mock('@/lib/agent/prediction-watch', () => ({
  runPredictionWatch: jest.fn().mockResolvedValue({ items: [] }),
}));
jest.mock('@/lib/agent/budget-manager', () => ({
  checkBudgetGate: jest.fn().mockResolvedValue('ok'),
  recordSpend: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/lib/db', () => ({
  prisma: {
    vertical: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    signal: {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    editorialDecision: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    thinkTankPublication: {
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    systemMetric: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  },
}));

const run = jest.mocked(runAndPublishInquiry);
const radar = jest.mocked(runTopicRadar);
const sigFindMany = jest.mocked(prisma.signal.findMany);
const decCount = jest.mocked(prisma.editorialDecision.count);
const decFindFirst = jest.mocked(prisma.editorialDecision.findFirst);
const decCreate = jest.mocked(prisma.editorialDecision.create);
const sigUpdate = jest.mocked(prisma.signal.update);

const cadence: CadenceState = {
  weeklyMax: 10, publishedThisWeek: 0, remainingSlots: 5, verticalPubCounts: new Map(),
};

function result(over: Record<string, unknown>) {
  return {
    status: 'failed', trustScore: 0, qualityScore: 0, wordCount: 0,
    costUsd: 0, durationMs: 1, ...over,
  } as never;
}

const RESERVE_MISS = result({ status: 'failed', error: 'No fresh validated publication available in reserve' });

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NOMOSX_AUTONOMOUS_ENABLED = '1';
  radar.mockResolvedValue({ topics: [], costUsd: 0 } as never);
});
afterEach(() => { delete process.env.NOMOSX_AUTONOMOUS_ENABLED; });

describe('held-retry collection', () => {
  it('re-dispatches a cooled-down HELD signal with its persisted failure feedback', async () => {
    sigFindMany.mockResolvedValue([
      { id: 'sig-held', title: 'Can grid-scale batteries displace peaker plants?', verticalId: 'v1', signalType: 'TREND_BREAK', priorityScore: 78 },
    ] as never);
    decCount.mockResolvedValue(1); // one prior HOLD — retry budget remains
    decFindFirst.mockResolvedValue({
      checks: { failureFeedback: 'gate reasons: devils_advocate publishability 0; DA kill shot: no comparative dimension' },
      reasons: ['devils_advocate: publishability 0'],
    } as never);
    // Reserve releases miss; the pipeline run itself is held.
    run.mockImplementation((arg: unknown) => Promise.resolve(
      (arg as { releaseFromReserve?: unknown }).releaseFromReserve
        ? RESERVE_MISS
        : result({ status: 'held', trustScore: 70, qualityScore: 60, costUsd: 1 })
    ) as never);

    const out = await runThinkTankCycle({ mode: 'breaking', maxPublications: 1, bypassCadence: true });

    // Collection queried HELD signals past the cooldown
    expect(sigFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'HELD', updatedAt: expect.objectContaining({ lt: expect.any(Date) }) }),
    }));
    // The pipeline run received the persisted diagnosis + dedup bypass —
    // a retry would otherwise be skipped_duplicate on the prior HELD title
    const pipelineCall = run.mock.calls.find(c => !(c[0] as { releaseFromReserve?: unknown }).releaseFromReserve);
    expect(pipelineCall).toBeDefined();
    const arg = pipelineCall![0] as Record<string, unknown>;
    expect(arg.signalId).toBe('sig-held');
    expect(arg.skipDuplicateCheck).toBe(true);
    expect((arg.pipelineOptions as { priorFailureFeedback?: string }).priorFailureFeedback).toContain('kill shot');
    expect((arg.metadata as Record<string, unknown>).heldRetry).toBe(true);
    expect(out.held).toBe(1);
  });

  it('exhausts the retry budget — a signal with >2 prior HOLDs is not re-dispatched', async () => {
    sigFindMany.mockResolvedValue([
      { id: 'sig-dead', title: 'Retried twice already', verticalId: 'v1', signalType: 'ARTICLE', priorityScore: 80 },
    ] as never);
    decCount.mockResolvedValue(3); // budget spent

    const out = await runThinkTankCycle({ mode: 'breaking', maxPublications: 1, bypassCadence: true });

    expect(run).not.toHaveBeenCalled();
    expect(out.collected).toBe(0);
  });
});

describe('held diagnostic persistence', () => {
  const item: ThinkTankDispatchItem = {
    question: 'Held question', depth: 'standard', signalId: 'sig-x',
    verticalId: 'v-energy', strategy: 'signal',
  };

  it('persists the HOLD decision with gate reasons + DA kill shot for the next attempt', async () => {
    run
      .mockResolvedValueOnce(RESERVE_MISS)
      .mockResolvedValueOnce(result({
        status: 'held', trustScore: 72, qualityScore: 61,
        gate: { decision: 'HOLD', reasons: ['devils_advocate: publishability 0/100'], diagnoses: [{ check: 'da' }] },
        pipeline: { stats: { devilsAdvocate: { killShot: 'single-country evidence cannot support a global claim', topChallenges: [{ type: 'evidence_gap', text: 'no comparative cases' }] } } },
      }));

    const out = await executeDispatchQueue([item], cadence, 1, false);
    expect(out.held).toBe(1);
    expect(decCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        signalId: 'sig-x',
        verticalId: 'v-energy',
        decision: 'HOLD',
        checks: expect.objectContaining({
          failureFeedback: expect.stringContaining('kill shot'),
        }),
      }),
    }));
  });

  it('persists a HOLD on pipeline failure too — the decision count IS the retry budget', async () => {
    run
      .mockResolvedValueOnce(RESERVE_MISS)
      .mockResolvedValueOnce(result({ status: 'failed', error: 'timeout mid-render' }));

    const out = await executeDispatchQueue([item], cadence, 1, false);
    expect(out.failed).toBe(1);
    // Without this record the signal would retry forever (count stays 0)
    expect(decCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ signalId: 'sig-x', decision: 'HOLD' }),
    }));
  });

  it('a successful retry resolves the signal to PUBLISHED', async () => {
    const retryItem: ThinkTankDispatchItem = {
      question: 'Held question', depth: 'standard', signalId: 'sig-y',
      verticalId: 'v-energy', strategy: 'signal', retryAttempt: 2,
      priorFailureFeedback: 'fix the comparative dimension',
    };
    run.mockResolvedValue(result({
      status: 'published', publicationId: 'pub-9', signalId: 'sig-y',
      trustScore: 82, qualityScore: 79,
    }));

    const out = await executeDispatchQueue([retryItem], cadence, 1, false);
    expect(out.published).toBe(1);
    expect(sigUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sig-y' }, data: { status: 'PUBLISHED' } })
    );
  });
});
