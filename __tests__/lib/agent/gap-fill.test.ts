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

it('keeps unattempted gaps and uses each request provider set', async () => {
  const deps = setup();
  const requests = [
    { query: 'First missing evidence', providers: ['crossref'], agent: 'CRITIC' },
    { query: 'Second missing evidence', providers: ['openalex'], agent: 'CRITIC' },
    { query: 'Third missing evidence', providers: ['linkup'], requestedBy: 'DA', reason: 'Missing baseline', minResults: 5 },
  ];
  deps.ctx.getPendingGapRequests = () => requests;
  jest.mocked(reAnalyzeAfterGapFill).mockResolvedValue({ analysis: deps.state.analysis, reAnalyzed: false, improvementDelta: 0 });
  await createGapRequestProcessor(deps)('CRITIC');
  expect(deps.scout).toHaveBeenNthCalledWith(2, requests[1].query, ['openalex'], 10);
  expect(deps.ctx.requestSourceGap).toHaveBeenCalledWith(requests[2].query, requests[2].reason, 'DA', ['linkup'], 5);
});

it('does not discard pending research queries when no new evidence was retrieved', async () => {
  const deps = setup({ scout: jest.fn(async () => ({ sourceIds: [] })) });
  await createGapRequestProcessor(deps)('CRITIC');
  expect(deps.ctx.clearGapRequests).not.toHaveBeenCalled();
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

it('vetoes a re-analysis that rescored materially worse than the critic-judged original', async () => {
  // Live-run regression: a +6-citation candidate adopted on citation count
  // alone rescored 16 vs the original's 44 — terminal-rejecting a repairable
  // artifact. The critic floor must refuse the swap; the enriched pool stays.
  const deps = setup({
    stats: { critic: { overallScore: 44, verdict: 'repair' } },
    criticScoreFn: jest.fn().mockResolvedValue({ score: 16, verdict: 'reject', costUsd: 0.01 }),
  });
  jest.mocked(reAnalyzeAfterGapFill).mockResolvedValue({ analysis: { verdict: 'Worse but more cited [SRC-1] [SRC-3]' }, reAnalyzed: true, improvementDelta: 6, costUsd: 0.2 });
  await createGapRequestProcessor(deps)('CRITIC');
  expect(deps.state.analysis).toEqual({ verdict: 'Original [SRC-1]' });
  expect(deps.bumpAnalysisArtifact).not.toHaveBeenCalled();
  expect(deps.topSources.map(s => s.id)).toEqual(['a', 'b', 'c']);
  expect(deps.addCost).toHaveBeenCalledWith(0.01, 'GAPFILL_RESCORE');
  expect(deps.stats.gapFillReAnalysis).toMatchObject({ triggered: false, rejectedByRescore: true, criticRescore: 16, criticPrior: 44 });
});

it('adopts a re-analysis whose critic rescore does not regress beyond the floor', async () => {
  const deps = setup({
    stats: { critic: { overallScore: 44, verdict: 'repair' } },
    criticScoreFn: jest.fn().mockResolvedValue({ score: 47, verdict: 'repair', costUsd: 0.01 }),
  });
  jest.mocked(reAnalyzeAfterGapFill).mockResolvedValue({ analysis: { verdict: 'Improved [SRC-1] [SRC-3]' }, reAnalyzed: true, improvementDelta: 6, costUsd: 0.2 });
  await createGapRequestProcessor(deps)('CRITIC');
  expect(deps.state.analysis).toEqual({ verdict: 'Improved [SRC-1] [SRC-3]' });
  expect(deps.bumpAnalysisArtifact).toHaveBeenCalledTimes(1);
  expect(deps.stats.gapFillReAnalysis).toMatchObject({ triggered: true, criticRescore: 47, criticPrior: 44 });
});

it('adopts without a rescore when no prior critic verdict exists', async () => {
  const criticScoreFn = jest.fn();
  const deps = setup({ stats: {}, criticScoreFn });
  jest.mocked(reAnalyzeAfterGapFill).mockResolvedValue({ analysis: { verdict: 'Improved [SRC-1] [SRC-3]' }, reAnalyzed: true, improvementDelta: 1, costUsd: 0.2 });
  await createGapRequestProcessor(deps)('CRITIC');
  expect(criticScoreFn).not.toHaveBeenCalled();
  expect(deps.state.analysis).toEqual({ verdict: 'Improved [SRC-1] [SRC-3]' });
});

it('does not spend retrieval budget when there is no analysis budget to use it', async () => {
  const deps = setup();
  deps.state.reAnalysisBudget = 0;
  await createGapRequestProcessor(deps)('CRITIC');
  expect(deps.scout).not.toHaveBeenCalled();
  expect(deps.topSources.map(s => s.id)).toEqual(['a', 'b']);
  expect(deps.stats.deferredGapRequests).toMatchObject({ reason: 'reanalysis_budget_exhausted' });
});

it('producer phase cannot spend the repair reserve — requests stay pending for the post-critic call', async () => {
  const deps = setup();
  deps.state.reAnalysisBudget = 1; // == REPAIR_REANALYSIS_RESERVE
  await createGapRequestProcessor(deps)('ANALYST', 'producer');
  expect(deps.scout).not.toHaveBeenCalled();
  expect(deps.stats.deferredGapRequests).toMatchObject({ reason: 'reanalysis_budget_reserved' });
});

it('repair phase may spend the reserve — same budget proceeds', async () => {
  const deps = setup();
  deps.state.reAnalysisBudget = 1;
  jest.mocked(reAnalyzeAfterGapFill).mockResolvedValue({ analysis: { verdict: 'X [SRC-1]' }, reAnalyzed: false, improvementDelta: 0 });
  await createGapRequestProcessor(deps)('CRITIC', 'repair');
  expect(deps.scout).toHaveBeenCalled();
});

it('defers gap requests inside the deadline tail — a re-analysis could never land', async () => {
  // S34 regression: TTS + a late gap-fill re-analysis stacked past the 75min
  // deadline and the run died mid-pass. Inside the tail the requests drain
  // without scouting — the sources could never reach the analyst anyway.
  const deps = setup({ pipelineStart: Date.now() - 60 * 60_000, isStrategic: true });
  await createGapRequestProcessor(deps)('CRITIC');
  expect(deps.scout).not.toHaveBeenCalled();
  expect(reAnalyzeAfterGapFill).not.toHaveBeenCalled();
  expect(deps.stats.deferredGapRequests).toMatchObject({ reason: 'insufficient_headroom' });
  expect(deps.topSources.map(s => s.id)).toEqual(['a', 'b']);
});

it('drops off-topic gap-fill additions before they reach the analyst and corpus', async () => {
  // Gap-fill merges bypass the rank-phase topical screen — screenAdditions
  // is the only vetting these docs get before the reader/analyst.
  const screenAdditions = jest.fn().mockResolvedValue(new Set(['c']));
  const deps = setup({ screenAdditions });
  jest.mocked(reAnalyzeAfterGapFill).mockResolvedValue({ analysis: { verdict: 'X [SRC-1]' }, reAnalyzed: true, improvementDelta: 1 });
  await createGapRequestProcessor(deps)('CRITIC');
  expect(screenAdditions).toHaveBeenCalledWith('Question', [expect.objectContaining({ id: 'c' })]);
  expect(reAnalyzeAfterGapFill).not.toHaveBeenCalled();
  expect(deps.topSources.map(s => s.id)).toEqual(['a', 'b']);
});

it('keeps gap-fill additions when the relevance screen is unavailable', async () => {
  // Fail-open: a screening outage must not silently shrink the corpus —
  // the additions were already retrieved at real cost.
  const deps = setup({ screenAdditions: jest.fn().mockResolvedValue(null) });
  jest.mocked(reAnalyzeAfterGapFill).mockResolvedValue({ analysis: { verdict: 'Improved [SRC-1] [SRC-3]' }, reAnalyzed: true, improvementDelta: 1, costUsd: 0.2 });
  await createGapRequestProcessor(deps)('CRITIC');
  expect(deps.topSources.map(s => s.id)).toEqual(['a', 'b', 'c']);
});
