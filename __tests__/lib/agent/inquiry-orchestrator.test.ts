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
// Post-gate extractExperience is detached fire-and-forget — the real one calls
// callLLM and keeps running after the suite ends, hitting torn-down dynamic
// imports (redis-simple) → Jest flags an after-teardown error and exits 1.
jest.mock('@/lib/agent/knowledge-infrastructure', () => {
  const actual = jest.requireActual('@/lib/agent/knowledge-infrastructure');
  return { ...actual, extractExperience: jest.fn(async () => ({ experiences: [], guidelines: [] })) };
});

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
import { withExecutionDeadline, withExecutionSignal } from '@/lib/worker/execution-scope';

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
  it('preserves the original artifact instead of regenerating without parent headroom', async () => {
    mockRunPipeline.mockResolvedValueOnce(makePipelineResult(makeStats(), 'a'));
    const result = await withExecutionDeadline(39 * 60_000, 'short-dispatch', () => runAndPublishInquiry(REQ));
    expect(result.status).toBe('held');
    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
    expect(mockTxPubCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'HELD' }) }));
  });
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

  it('regen timeout after brief persist → salvages the winning artifact instead of discarding it', async () => {
    // Paid-run finding: the regen persisted a brief (trust=86/quality=80) then
    // died in the non-critical tail at the 25min cap — the orchestrator
    // discarded it and persisted the worse attempt-1 as HELD.
    mockRunPipeline
      .mockResolvedValueOnce(makePipelineResult(makeStats(), 'a'))
      .mockRejectedValueOnce(new Error('regen timed out after 1500000ms'));
    // The regen brief + its run row with verdict evals are already durable.
    const regenStats = makeStats({
      critic: { overallScore: 80, verdict: 'publish' },
      rank: { avgQuality: 72 },
      structuralEditor: { overallStructure: 76 },
      devilsAdvocate: { publishabilityScore: 100, verdict: 'publish', fatalChallenges: 0, topChallenges: [] },
      criticalLoop: { finalScore: 85 },
      centralScenarioRequired: false,
    });
    (prisma.brief.findFirst as jest.Mock).mockResolvedValue({
      id: 'brief-regen', pipelineRunId: 'run-regen',
      trustScore: 86, qualityScore: 80,
      sources: Array.from({ length: 20 }, (_, i) => `sr-${i}`),
      lineage: regenStats, html: WORDS_3200,
      publicId: 'regen-slug', createdAt: new Date(), updatedAt: new Date(),
    });
    (prisma.pipelineRun.findUnique as jest.Mock).mockResolvedValue({
      finishedAt: new Date(), steps: regenStats,
    });
    (prisma.source.findMany as jest.Mock).mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({ id: `sr-${i}`, title: `S${i}`, provider: 'openalex', authors: [] }))
    );

    const result = await runAndPublishInquiry(REQ);

    // The salvaged regen artifact is assessed and adopted — the publication
    // reflects the BETTER artifact, not the timed-out orchestration.
    expect(result.status).toBe('published');
    expect(result.briefId).toBe('brief-regen');
    const regenOptions = mockRunPipeline.mock.calls[1][0].pipelineOptions;
    expect(regenOptions.executionId).toBeTruthy();
    expect(regenOptions.executionId).not.toBe(mockRunPipeline.mock.calls[0][0].pipelineOptions.executionId);
    expect(prisma.brief.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ pipelineRunId: regenOptions.executionId }),
    }));
    expect(mockTxPubCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PUBLISHED' }) })
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

  it('pipeline failure banks the spend attached to the thrown error', async () => {
    // runPipelineCore attaches cost.runningCostUsd to its FATAL error — a
    // crashed pipeline must still report its spend to the cycle budget.
    const err = new Error('provider cascade exhausted');
    (err as unknown as { costUsd: number }).costUsd = 0.87;
    mockRunPipeline.mockRejectedValue(err);
    const result = await runAndPublishInquiry(REQ);
    expect(result.status).toBe('failed');
    expect(result.costUsd).toBe(0.87);
    expect(mockTxPubCreate).not.toHaveBeenCalled();
  });

  it('pipeline timeout with no brief recovers spend persisted in PipelineRun.steps', async () => {
    // The deadline error carries no cost — the unwinding core wrote
    // stats.totalCostUsd into the run row; recover it for budget accounting.
    mockRunPipeline.mockRejectedValue(new Error('runPipeline(brief) timed out after 3900000s'));
    (prisma.pipelineRun.findUnique as jest.Mock).mockResolvedValue({
      finishedAt: new Date(), steps: { totalCostUsd: 1.23 },
    });
    jest.useFakeTimers();
    try {
      const promise = runAndPublishInquiry(REQ);
      await jest.runAllTimersAsync();
      const result = await promise;
      expect(result.status).toBe('failed');
      expect(result.costUsd).toBe(1.23);
    } finally {
      jest.useRealTimers();
    }
  }, 60_000);

  it('dispatch deadline firing mid-flow must not roll back the artifact commit (S32)', async () => {
    // The pipeline resolves, then the dispatch scope aborts — every step after
    // the artifact is complete (assess, gate, regen, persist) runs under an
    // aborted signal. The commit is detached: the HELD row is still written.
    const controller = new AbortController();
    mockRunPipeline.mockImplementation(async () => {
      const p = makePipelineResult(makeStats(), 'a');
      controller.abort(new Error('dispatch deadline fired'));
      return p;
    });

    const result = await withExecutionSignal(controller.signal, () => runAndPublishInquiry(REQ));
    expect(result.status).toBe('held');
    expect(mockTxPubCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'HELD' }) })
    );
  });

  it.each([{ error: 'provider unavailable' }, { evaluationComplete: false }])('holds an unavailable adversarial review without paying for regeneration: %j', async failure => {
    mockRunPipeline.mockResolvedValueOnce(makePipelineResult(makeStats({
      critic: { overallScore: 90, verdict: 'publish' }, rank: { avgQuality: 90 },
      structuralEditor: { overallStructure: 90 }, criticalLoop: { finalScore: 90 },
      devilsAdvocate: { publishabilityScore: 100, verdict: 'publish', ...failure },
      centralScenarioRequired: false,
    }), 'a'));
    const result = await runAndPublishInquiry(REQ);
    expect(result.status).toBe('held');
    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
    expect(result.gate?.checks).toContainEqual(expect.objectContaining({ checkType: 'evaluation_availability', passed: false }));
  });

  it('an explicitly optional skipped review contributes neither a score nor a verdict', async () => {
    // Deliberate skips (LAS thin pool, 80% budget guard, free-tier option)
    // must not hard-fail evaluation_availability — previously every run that
    // hit the DA budget guard was structurally condemned to HELD.
    mockRunPipeline.mockResolvedValueOnce(makePipelineResult(makeStats({
      critic: { overallScore: 90, verdict: 'publish' }, rank: { avgQuality: 90 },
      structuralEditor: { overallStructure: 90 }, criticalLoop: { finalScore: 90 },
      devilsAdvocate: { reason: 'disabled by LAS gate', skipped: true },
      centralScenarioRequired: false,
    }), 'a'));
    const result = await runAndPublishInquiry({ ...REQ, pipelineOptions: { enableDevilsAdvocate: false } });
    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
    expect(['published', 'ready']).toContain(result.status);
    expect(result.gate?.checks ?? []).not.toContainEqual(expect.objectContaining({ checkType: 'evaluation_availability', passed: false }));
    expect(result.gate?.checks ?? []).not.toContainEqual(expect.objectContaining({ checkType: 'devils_advocate' }));
  });

  it.each([
    { skipped: true, reason: 'disabled by LAS gate' },
    { skipped: true, publishabilityScore: 100, verdict: 'publish' },
    { publishabilityScore: NaN, verdict: 'publish' },
    { publishabilityScore: 100 },
    undefined,
  ])('holds when the required adversarial review has no valid verdict: %j', async devilsAdvocate => {
    mockRunPipeline.mockResolvedValueOnce(makePipelineResult(makeStats({
      critic: { overallScore: 90, verdict: 'publish' }, rank: { avgQuality: 90 },
      structuralEditor: { overallStructure: 90 }, criticalLoop: { finalScore: 90 },
      devilsAdvocate, centralScenarioRequired: false,
    }), 'a'));
    const result = await runAndPublishInquiry(REQ);
    expect(result.status).toBe('held');
    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
    expect(result.gate?.checks).toContainEqual(expect.objectContaining({ checkType: 'evaluation_availability', passed: false }));
  });

  it('does not let an old lineage verdict hide the current failed review', async () => {
    const pipeline = makePipelineResult(makeStats({
      critic: { overallScore: 90, verdict: 'publish' }, rank: { avgQuality: 90 },
      structuralEditor: { overallStructure: 90 }, criticalLoop: { finalScore: 90 },
      devilsAdvocate: { evaluationComplete: false }, centralScenarioRequired: false,
    }));
    pipeline.lineage = { ...pipeline.stats, devilsAdvocate: { publishabilityScore: 100, verdict: 'publish' } };
    mockRunPipeline.mockResolvedValueOnce(pipeline);
    const result = await runAndPublishInquiry(REQ);
    expect(result.status).toBe('held');
    expect(result.gate?.checks ?? []).not.toContainEqual(expect.objectContaining({ checkType: 'devils_advocate', score: 100 }));
  });

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
