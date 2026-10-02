/**
 * inquiry-orchestrator — Integration coverage for the full publication funnel:
 * pipeline → assess → revision → regeneration → persist → classify.
 *
 * These paths previously only ran inside paid live cycles (S27/S32 findings:
 * regen eating the persist deadline, held artifacts counted as failed, gate
 * verdicts discarded by timeout). All external effects are mocked; the gate,
 * score extraction, regen decision and anti-regression witness run REAL.
 */

const mockTxPubCreate = jest.fn(async () => ({ id: 'pub-1', publicId: 'pub-slug' }));
const mockTxBriefUpdate = jest.fn(async () => ({}));

jest.mock('@/lib/db', () => ({
  prisma: {
    vertical: {
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => ({ id: 'v1', slug: 'geopolitics' })),
    },
    signal: { findUnique: jest.fn(async () => ({ id: 'sig-1', sourceIds: [] })) },
    thinkTankPublication: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      update: jest.fn(async () => ({})),
    },
    brief: { findFirst: jest.fn(async () => null) },
    pipelineRun: {
      findUnique: jest.fn(async () => null),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    source: { findMany: jest.fn(async () => []) },
    thinkTankQualityCheck: { createMany: jest.fn(async () => ({ count: 0 })) },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        thinkTankPublication: { create: mockTxPubCreate },
        brief: { update: mockTxBriefUpdate },
      })
    ),
  },
  withDbRetry: jest.fn((fn: () => Promise<unknown>) => fn()),
}));

const mockRunPipeline = jest.fn();
jest.mock('@/lib/agent/inquiry-pipeline', () => ({
  runInquiryPipeline: (...args: unknown[]) => mockRunPipeline(...args),
}));

jest.mock('@/lib/agent/publication-reserve', () => ({
  certifyForReserve: jest.fn(async () => {}),
  releaseReservedPublication: jest.fn(async () => null),
}));

jest.mock('@/lib/foresight', () => ({
  buildForesightPersistPayload: jest.fn(() => ({})),
  persistForesightRun: jest.fn(async () => {}),
}));

// Fire-and-forget learning tail — keep it inert in unit tests.
jest.mock('@/lib/agent/playbook', () => ({ curatePlaybook: jest.fn(async () => {}) }));
jest.mock('@/lib/agent/phd-researcher', () => ({ detectRelevantExperts: jest.fn(() => []) }));

// Keep the REAL revision-controller decision logic (shouldRegenerate,
// attemptScore, buildFailureFeedback) — only the deterministic repair
// executor is stubbed to a no-op so the gate's verdict is what we exercise.
jest.mock('@/lib/agent/revision-controller', () => {
  const actual = jest.requireActual('@/lib/agent/revision-controller');
  return {
    ...actual,
    reviseForGate: jest.fn(async (input: { html: string }) => ({
      html: input.html,
      changed: false,
      actions: [],
      costUsd: 0,
    })),
  };
});

import { runAndPublishInquiry } from '@/lib/agent/inquiry-orchestrator';
import { prisma } from '@/lib/db';

const words = (n: number) => Array(n).fill('evidence').join(' ');
const WORDS_3200 = `<p>${words(3200)}</p>`;

/** S32-realistic stats: trust passes (71), quality lands ~62 (<70 advisory),
 *  central scenario required but absent → hard-fail → gate 'hold'. */
const makeStats = (over: Record<string, unknown> = {}) => ({
  critic: { overallScore: 30, verdict: 'reject' },
  rank: { avgQuality: 61 },
  citationFilter: { coverageAfter: 99 },
  structuralEditor: { overallStructure: 66 },
  devilsAdvocate: { publishabilityScore: 42, verdict: 'major_revision', fatalChallenges: 0, topChallenges: [] },
  criticalLoop: { finalScore: 71 },
  centralScenarioRequired: true,
  evaluationFreshness: { verdictStale: [] },
  totalCostUsd: 0.4,
  ...over,
});

const makePipelineResult = (stats: Record<string, unknown>, id = 'a') => ({
  inquiry: {
    id: `inq-${id}`, slug: `inq-${id}-slug`, title: 'Test inquiry', question: 'Q?',
    depth: 'standard', status: 'reviewing', sections: [],
    sources: Array.from({ length: 20 }, (_, i) => ({
      id: `s${id}-${i}`, title: `Source ${i}`, provider: 'openalex', authors: [],
    })),
    publishedAt: new Date(), updatedAt: new Date(),
  },
  briefId: `brief-${id}`,
  pipelineRunId: `run-${id}`,
  html: WORDS_3200,
  stats,
  lineage: stats,
  trustScore: 71,
  qualityScore: 62,
  format: 'brief',
  readerClaims: Array.from({ length: 6 }, (_, i) => ({ text: `claim ${i}`, sourceRef: i + 1 })),
  refusal: false,
});

const REQ = {
  question: 'Will unrecognized states gain recognition by 2030?',
  source: 'auto-scan' as const,
  depth: 'standard' as const,
  skipDuplicateCheck: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  // clearAllMocks keeps implementations — reset the per-test mock values.
  (prisma.brief.findFirst as jest.Mock).mockResolvedValue(null);
  (prisma.pipelineRun.findUnique as jest.Mock).mockResolvedValue(null);
  (prisma.source.findMany as jest.Mock).mockResolvedValue([]);
});

describe('runAndPublishInquiry — full funnel', () => {
  it('S32 repro: gate hold → regen runs worse → original HELD still persists', async () => {
    mockRunPipeline
      .mockResolvedValueOnce(makePipelineResult(makeStats(), 'a'))
      .mockResolvedValueOnce(makePipelineResult(makeStats({
        critic: { overallScore: 20, verdict: 'reject' },
        rank: { avgQuality: 40 },
        devilsAdvocate: { publishabilityScore: 15, verdict: 'reject', fatalChallenges: 1 },
        criticalLoop: { finalScore: 50 },
      }), 'b'));

    const result = await runAndPublishInquiry(REQ);

    // Regen ran once, seeded from the original corpus, with gate feedback.
    expect(mockRunPipeline).toHaveBeenCalledTimes(2);
    const regenArgs = mockRunPipeline.mock.calls[1][0] as {
      seedSourceIds?: string[];
      pipelineOptions?: { priorFailureFeedback?: string };
    };
    expect(regenArgs.seedSourceIds).toHaveLength(20);
    expect(regenArgs.pipelineOptions?.priorFailureFeedback).toBeTruthy();

    // Anti-regression: the worse artifact was discarded; the ORIGINAL
    // assessment held and was persisted as HELD — not lost, not 'failed'.
    expect(result.status).toBe('held');
    expect(result.briefId).toBe('brief-a');
    expect(result.publicationId).toBe('pub-1');
    expect(mockTxPubCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'HELD' }) })
    );
  });

  it('regen abort (deadline) does not lose the assessed artifact', async () => {
    mockRunPipeline
      .mockResolvedValueOnce(makePipelineResult(makeStats(), 'a'))
      .mockRejectedValueOnce(new Error('Execution aborted: regen child deadline exceeded'));

    const result = await runAndPublishInquiry(REQ);

    // A regen that dies mid-flight must not poison the completed original:
    // the gate verdict on attempt 1 is persisted as HELD.
    expect(result.status).toBe('held');
    expect(result.publicationId).toBe('pub-1');
    expect(mockTxPubCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'HELD' }) })
    );
  });

  it('pipeline timeout: salvages persisted brief, gates it, persists HELD — no regen on evidence-bound failure', async () => {
    mockRunPipeline.mockRejectedValue(new Error('runPipeline(brief) timed out after 3900000s'));
    (prisma.brief.findFirst as jest.Mock).mockResolvedValue({
      id: 'brief-salv', pipelineRunId: 'run-salv',
      trustScore: 60, qualityScore: 50,
      sources: ['s1', 's2'],
      lineage: {}, html: '<p>recovered artifact</p>',
      publicId: 'salv-slug', createdAt: new Date(), updatedAt: new Date(),
    });
    (prisma.pipelineRun.findUnique as jest.Mock).mockResolvedValue({
      finishedAt: new Date(), steps: makeStats(),
    });
    (prisma.source.findMany as jest.Mock).mockResolvedValue([
      { id: 's1', title: 't1', provider: 'openalex', authors: [] },
      { id: 's2', title: 't2', provider: 'crossref', authors: [] },
    ]);

    const result = await runAndPublishInquiry(REQ);

    // Salvaged artifact has only 2 sources → source_depth hard-fails →
    // regen is refused (evidence-bound, not a writing failure).
    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('held');
    expect(result.briefId).toBe('brief-salv');
    expect(mockTxPubCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'HELD' }) })
    );
  });

  it('pipeline timeout with no persisted brief → failed (nothing trustworthy to salvage)', async () => {
    mockRunPipeline.mockRejectedValue(new Error('runPipeline(brief) timed out after 3900000s'));
    // brief.findFirst returns null → the 10min salvage poll exhausts.
    // Fake timers compress it — runAllTimersAsync advances the clock past the
    // deadline and flushes the promise chain.
    jest.useFakeTimers();
    try {
      const promise = runAndPublishInquiry(REQ);
      await jest.runAllTimersAsync();
      const result = await promise;
      expect(result.status).toBe('failed');
      expect(mockTxPubCreate).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  }, 60_000);

  it('clean artifact → gate publish → persisted PUBLISHED, no regen', async () => {
    mockRunPipeline.mockResolvedValueOnce(makePipelineResult(makeStats({
      critic: { overallScore: 80, verdict: 'publish' },
      rank: { avgQuality: 70 },
      structuralEditor: { overallStructure: 75 },
      devilsAdvocate: { publishabilityScore: 70, verdict: 'publish', fatalChallenges: 0, topChallenges: [] },
      criticalLoop: { finalScore: 85 },
      centralScenarioRequired: false,
    }), 'a'));

    const result = await runAndPublishInquiry(REQ);

    expect(mockRunPipeline).toHaveBeenCalledTimes(1); // no regen on clean gate
    expect(['published', 'ready']).toContain(result.status);
    expect(mockTxPubCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: expect.stringMatching(/PUBLISHED|READY/),
        }),
      })
    );
  });
});
