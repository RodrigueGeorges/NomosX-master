/**
 * Reserve dispatch flow — the slot loop in executeDispatchQueue:
 *   0. topic-matched release ($0) → 1. pipeline delivery:'reserve'
 *   2. immediate release of the fresh artifact → 3. cross-topic drain.
 * Prisma + the orchestrator are mocked; no DB, no LLM.
 */

import { executeDispatchQueue, type ThinkTankDispatchItem, type CadenceState } from '@/lib/agent/think-tank-dispatcher';
import { runAndPublishInquiry } from '@/lib/agent/inquiry-orchestrator';
import { prisma } from '@/lib/db';

jest.mock('@/lib/agent/inquiry-orchestrator', () => ({
  runAndPublishInquiry: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  prisma: {
    vertical: { findUnique: jest.fn() },
    signal: { update: jest.fn().mockResolvedValue({}) },
  },
}));
jest.mock('@/lib/agent/budget-manager', () => ({
  checkBudgetGate: jest.fn().mockResolvedValue('ok'),
  recordSpend: jest.fn().mockResolvedValue(undefined),
}));

const run = jest.mocked(runAndPublishInquiry);
const signalUpdate = jest.mocked(prisma.signal.update);

const cadence: CadenceState = {
  weeklyMax: 10, publishedThisWeek: 0, remainingSlots: 5, verticalPubCounts: new Map(),
};

const item: ThinkTankDispatchItem = {
  question: 'How does LNG supply reshape transatlantic energy security?',
  depth: 'standard',
  signalId: 'sig-1',
  strategy: 'signal',
};

function result(over: Record<string, unknown>) {
  return {
    status: 'failed', trustScore: 0, qualityScore: 0, wordCount: 0,
    costUsd: 0, durationMs: 1, ...over,
  } as never;
}

const RESERVE_MISS = result({ status: 'failed', error: 'No fresh validated publication available in reserve' });

beforeEach(() => jest.clearAllMocks());

describe('reserve-first dispatch', () => {
  it('fills the slot from a topic-matched certified artifact for $0 — no pipeline run', async () => {
    run.mockResolvedValueOnce(result({
      status: 'published', publicationId: 'pub-1', signalId: 'sig-1',
      trustScore: 80, qualityScore: 78,
    }));

    const out = await executeDispatchQueue([item], cadence, 1, false);
    expect(out.published).toBe(1);
    expect(out.totalCostUsd).toBe(0);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0].releaseFromReserve).toBeDefined();
    // Topic covered → the item's signal is resolved
    expect(signalUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sig-1' }, data: { status: 'PUBLISHED' } })
    );
  });

  it('produces → certifies → releases the fresh artifact when the reserve is empty', async () => {
    run
      .mockResolvedValueOnce(RESERVE_MISS)
      .mockResolvedValueOnce(result({ status: 'ready', publicationId: 'pub-2', costUsd: 0.5 }))
      .mockResolvedValueOnce(result({
        status: 'published', publicationId: 'pub-2', signalId: 'sig-1',
        trustScore: 82, qualityScore: 80,
      }));

    const out = await executeDispatchQueue([item], cadence, 1, false);
    expect(out.published).toBe(1);
    expect(out.totalCostUsd).toBeCloseTo(0.5);
    expect(run).toHaveBeenCalledTimes(3);
    // The pipeline ran with delivery:'reserve'
    expect(run.mock.calls[1][0].delivery).toBe('reserve');
    // Release by publicationId — topic-faithful
    expect(run.mock.calls[2][0].releaseFromReserve?.publicationId).toBe('pub-2');
  });

  it('drains cross-topic stock on hold — slot fills, item signal stays open', async () => {
    run
      .mockResolvedValueOnce(RESERVE_MISS)
      .mockResolvedValueOnce(result({ status: 'held', costUsd: 0.4 }))
      .mockResolvedValueOnce(result({
        status: 'published', publicationId: 'pub-9', signalId: 'sig-other',
        trustScore: 90, qualityScore: 88,
      }));

    const out = await executeDispatchQueue([item], cadence, 1, false);
    expect(out.published).toBe(1);
    // The drain call is unmatched: question '' → no topic filter
    expect(run.mock.calls[2][0].question).toBe('');
    // The published artifact belongs to another signal → item signal NOT resolved
    expect(signalUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sig-1' }, data: { status: 'PUBLISHED' } })
    );
  });

  it('leaves the slot held when nothing is validated anywhere', async () => {
    run
      .mockResolvedValueOnce(RESERVE_MISS)
      .mockResolvedValueOnce(result({ status: 'held', costUsd: 0.4 }))
      .mockResolvedValueOnce(RESERVE_MISS);

    const out = await executeDispatchQueue([item], cadence, 1, false);
    expect(out.published).toBe(0);
    expect(out.held).toBe(1);
  });

  it('treats an already-released slot as idempotent skip — reclaim safety', async () => {
    run.mockResolvedValueOnce(result({ status: 'skipped_duplicate', publicationId: 'pub-1' }));

    const out = await executeDispatchQueue([item], cadence, 1, false);
    expect(out.published).toBe(0);
    expect(out.skipped).toBe(1);
    expect(run).toHaveBeenCalledTimes(1); // pipeline never ran
  });
});
