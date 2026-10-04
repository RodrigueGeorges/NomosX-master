import { createGapRequestProcessor, type GapFillDeps } from '@/lib/agent/pipeline-steps/gap-fill';
import { reAnalyzeAfterGapFill } from '@/lib/agent/self-correction-integration';

jest.mock('@/lib/agent/self-correction-integration', () => ({ reAnalyzeAfterGapFill: jest.fn() }));
jest.mock('@/lib/agent/reader-agent-v3', () => ({ readerAgentV3: jest.fn(async () => [{ sourceId: 'c', claims: ['New evidence'] }]) }));

function setup(over: Partial<GapFillDeps> = {}) {
  const deps = {
    state: { analysis: { verdict: 'Original [SRC-1]' }, allSourceIds: ['a', 'b'], reAnalysisBudget: 1 },
    query: 'Question', topSources: [{ id: 'a' }, { id: 'b' }], readings: [], slimReadings: [],
    detectedDomain: 'technology', isStrategic: false, providers: [], rankOpts: { limit: 2 }, stats: {},
    label: 'Test', pipelineRunId: 'run', analystDecision: {}, orchState: { iteration: 0, maxIterations: 1 },
    emitProgress: jest.fn(), addCost: jest.fn(), isBudgetConstrained: () => false,
    bumpAnalysisArtifact: jest.fn(), analystMultipass: jest.fn(),
    rank: jest.fn().mockResolvedValue([{ id: 'b' }, { id: 'c' }, { id: 'a' }]),
    scout: jest.fn().mockResolvedValue({ sourceIds: ['c'] }),
    ctx: {
      hasGapRequests: () => true, getPendingGapRequests: () => [{ query: 'Missing evidence' }],
      clearGapRequests: jest.fn(), requestSourceGap: jest.fn(), addFinding: jest.fn(), setAnalystOutput: jest.fn(),
      signals: { resolveSignalsByType: jest.fn() },
    },
    ...over,
  } as GapFillDeps;
  return deps;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('does not resolve missing evidence when retrieval is deliberately skipped', async () => {
  const deps = setup({ skipRetrieval: true });
  await createGapRequestProcessor(deps)('CRITIC');
  expect(deps.scout).not.toHaveBeenCalled();
  expect(deps.ctx.signals.resolveSignalsByType).not.toHaveBeenCalled();
});

it('does not resolve missing evidence when all retrieval fails', async () => {
  const deps = setup({ scout: jest.fn().mockRejectedValue(new Error('provider unavailable')) });
  await createGapRequestProcessor(deps)('CRITIC');
  expect(deps.ctx.signals.resolveSignalsByType).not.toHaveBeenCalled();
});

it('preserves the citation source order when enriched analysis is rejected', async () => {
  const deps = setup();
  jest.mocked(reAnalyzeAfterGapFill).mockResolvedValue({ analysis: deps.state.analysis, reAnalyzed: false, improvementDelta: 0 });
  await createGapRequestProcessor(deps)('CRITIC');
  expect(deps.topSources.map(s => s.id)).toEqual(['a', 'b']);
  expect(deps.ctx.signals.resolveSignalsByType).not.toHaveBeenCalled();
});

it('appends sources only with the adopted analysis and its new readings', async () => {
  const deps = setup();
  jest.mocked(reAnalyzeAfterGapFill).mockResolvedValue({ analysis: { verdict: 'Improved [SRC-1] [SRC-3]' }, reAnalyzed: true, improvementDelta: 1, costUsd: 0.2 });
  await createGapRequestProcessor(deps)('CRITIC');
  expect(deps.topSources.map(s => s.id)).toEqual(['a', 'b', 'c']);
  expect(deps.readings).toEqual([expect.objectContaining({ sourceId: 'c' })]);
  expect(deps.addCost).toHaveBeenCalledWith(0.2, 'GAP-FILL RE-ANALYSIS');
  expect(deps.bumpAnalysisArtifact).toHaveBeenCalledTimes(1);
  expect(deps.ctx.signals.resolveSignalsByType).not.toHaveBeenCalled();
});

it('does not spend retrieval budget when there is no analysis budget to use it', async () => {
  const deps = setup();
  deps.state.reAnalysisBudget = 0;
  await createGapRequestProcessor(deps)('CRITIC');
  expect(deps.scout).not.toHaveBeenCalled();
  expect(deps.topSources.map(s => s.id)).toEqual(['a', 'b']);
});
