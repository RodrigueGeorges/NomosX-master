import { runPipeline } from '@/lib/agent/pipeline-v2';
import { runPipelineInit } from '@/lib/agent/pipeline-steps/pipeline-init';
import { getExecutionSignal } from '@/lib/worker/execution-scope';
import { prisma } from '@/lib/db';
import { runRankAndEnrichment } from '@/lib/agent/pipeline-steps/rank-enrichment';
import { runReaderBlock } from '@/lib/agent/pipeline-steps/reader-block';
import { buildAnalystContext } from '@/lib/agent/pipeline-steps/analyst-context';
import { runAnalystExecution } from '@/lib/agent/pipeline-steps/analyst-run';

jest.mock('@/lib/agent/pipeline-steps/pipeline-init', () => ({ runPipelineInit: jest.fn() }));
jest.mock('@/lib/db', () => ({ prisma: { pipelineRun: { findFirst: jest.fn(async () => null), update: jest.fn(async () => ({})) } } }));
jest.mock('@/lib/agent/context-primer', () => ({ primeContext: jest.fn(async () => ({ knownConcepts: [], priorBriefs: [] })) }));
jest.mock('@/lib/agent/episodic-memory', () => ({ retrieveEpisodes: jest.fn(async () => []) }));
jest.mock('@/lib/agent/orchestrator', () => ({ createPipelineState: jest.fn(() => ({})), loadCalibratedThresholds: jest.fn(async () => ({ MIN_TRUST_SCORE: 65 })) }));
jest.mock('@/lib/agent/pipeline-progress', () => ({ emitProgress: jest.fn() }));
jest.mock('@/lib/agent/pipeline-steps/scout-block', () => ({ runScoutBlock: jest.fn(async () => ({ allSourceIds: [], planNodesForAudit: [], scoutCkptRestored: false })) }));
jest.mock('@/lib/agent/pipeline-steps/scout-enrichment-index', () => ({ runScoutEnrichmentAndIndex: jest.fn(async () => []) }));
jest.mock('@/lib/agent/pipeline-steps/rank-enrichment', () => ({ runRankAndEnrichment: jest.fn() }));
jest.mock('@/lib/agent/pipeline-steps/classification-gates', () => ({ runClassificationGates: jest.fn(async () => ({ allSourceIds: [], detectedDomain: 'test' })) }));
jest.mock('@/lib/agent/pipeline-steps/reader-block', () => ({ runReaderBlock: jest.fn() }));
jest.mock('@/lib/agent/pipeline-steps/analyst-context', () => ({ buildAnalystContext: jest.fn(), buildRequiredCoverageBlock: jest.fn() }));
jest.mock('@/lib/agent/pipeline-steps/analyst-run', () => ({ runAnalystExecution: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

it('aborts the actual pipeline execution and scopes timeout cleanup to its own id', async () => {
  let signal: AbortSignal | undefined;
  jest.mocked(runPipelineInit).mockImplementation(() => {
    signal = getExecutionSignal();
    return new Promise(() => {});
  });
  const pending = runPipeline('A sufficiently detailed research question?', 'brief', { timeoutMs: 20, executionId: 'attempt-123' });
  const assertion = expect(pending).rejects.toThrow('timed out');
  await jest.advanceTimersByTimeAsync(21);
  await assertion;
  expect(signal?.aborted).toBe(true);
  expect(prisma.pipelineRun.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'attempt-123', status: 'RUNNING' } }));
  expect(jest.getTimerCount()).toBe(0);
});

it.each(['corpus_insufficient', 'thesis_insufficient', 'thesis_evaluation_unavailable'])('persists %s before any scenario/context or analyst spend', async reason => {
  const stats: any = {
    thesisBinding: reason === 'thesis_evaluation_unavailable' ? { unavailable: true } : { absent: 'no_supportable_thesis' },
  };
  const sources = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, abstract: 'Evidence '.repeat(30) }));
  jest.mocked(runPipelineInit).mockResolvedValue({
    isStrategic: false, label: 'Test', stats, pipelineStart: Date.now(), rejectionHandler: () => {},
    ctx: {}, providers: [], perProvider: 5, flags: {}, cost: { runningCostUsd: 0.042 },
    pipelineRun: { id: 'early-refusal', status: 'RUNNING' }, idempotencyKey: 'test',
  } as never);
  jest.mocked(runRankAndEnrichment).mockResolvedValue({ topSources: sources, allSourceIds: sources.map(s => s.id), refused: false, rankOpts: {} } as never);
  jest.mocked(runReaderBlock).mockResolvedValue({
    readings: reason === 'corpus_insufficient' ? [] : sources.map(s => ({ sourceId: s.id, claims: ['Documented evidence'] })),
  } as never);
  const result = await runPipeline('A sufficiently detailed research question?', 'brief', { executionId: 'early-refusal' });
  expect(buildAnalystContext).not.toHaveBeenCalled();
  expect(runAnalystExecution).not.toHaveBeenCalled();
  expect(result.stats.structuredRefusal?.reason).toContain(reason);
  expect(prisma.pipelineRun.update).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 'early-refusal' }, data: expect.objectContaining({
      status: 'FAILED', finishedAt: expect.any(Date), steps: expect.objectContaining({ totalCostUsd: 0.042 }),
    }),
  }));
  expect(result.briefId).toBeUndefined();
  expect(jest.getTimerCount()).toBe(0);
});
