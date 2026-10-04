import { runRankAndEnrichment, type RankEnrichmentDeps } from '@/lib/agent/pipeline-steps/rank-enrichment';
import { runScoutEnrichmentAndIndex, type ScoutEnrichmentIndexDeps } from '@/lib/agent/pipeline-steps/scout-enrichment-index';
import { assessEvidenceSufficiency } from '@/lib/agent/enrichment-reasoner';
import { runClassificationGates, type ClassificationGatesDeps } from '@/lib/agent/pipeline-steps/classification-gates';

jest.mock('@/lib/db', () => ({ prisma: {} }));
jest.mock('@/lib/agent/enrichment-reasoner', () => ({ assessEvidenceSufficiency: jest.fn() }));
jest.mock('@/lib/agent/source-quality', () => ({ rankSourcesByQuality: jest.fn(async () => []) }));
jest.mock('@/lib/agent/semantic-engine', () => ({ embedSourcesBatch: jest.fn() }));
jest.mock('@/lib/agent/index-agent', () => ({ deduplicateSources: jest.fn() }));
jest.mock('@/lib/agent/topic-classifier', () => ({ classifyTopic: jest.fn(async () => ({ primaryDomain: 'test', domains: [], dimensions: [], confidence: 1 })) }));
jest.mock('@/lib/agent/gap-filler', () => ({ getRelevantGaps: jest.fn(async () => ({ gapsAddressed: 1, gapQueries: ['Missing evidence'], gapContext: 'Known gap' })) }));
jest.mock('@/lib/agent/researcher-kb/index', () => ({ RESEARCHER_KBS: {} }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('skips upstream enrichment and reindexing for a fixed corpus', async () => {
  const deps = { allSourceIds: ['a'], stats: {}, scout: jest.fn(), index: jest.fn(), skipRetrieval: true } as unknown as ScoutEnrichmentIndexDeps;
  expect(await runScoutEnrichmentAndIndex(deps)).toEqual(['a']);
  expect(deps.scout).not.toHaveBeenCalled();
  expect(deps.index).not.toHaveBeenCalled();
});

it.each(['enrich', 'refuse'] as const)('does not re-scout a fixed corpus on an enrichment verdict of %s', async verdict => {
  jest.mocked(assessEvidenceSufficiency).mockResolvedValue({ verdict, sufficiencyScore: 50, gaps: [], enrichmentQueries: ['Missing evidence'], costUsd: 0.01 } as never);
  const deps = {
    query: 'Research question', allSourceIds: ['a'], isStrategic: false, stats: {}, providers: [], label: 'Test',
    pipelineStart: Date.now(), runningCostUsd: 0, pipelineRunId: 'run', skipRetrieval: true,
    rank: jest.fn(async () => [{ id: 'a', title: 'Source', qualityScore: 70, compositeScore: 70, provider: 'test' }]),
    scout: jest.fn(), emitProgress: jest.fn(), addCost: jest.fn(),
    ctx: { setRankedSources: jest.fn(), recordAgentTiming: jest.fn(), getSummary: jest.fn(), addFinding: jest.fn() },
    orchState: { sourcesFound: 0, avgQualityScore: 0 },
  } as RankEnrichmentDeps;
  const result = await runRankAndEnrichment(deps);
  expect(deps.scout).not.toHaveBeenCalled();
  expect(result.refused).toBe(verdict === 'refuse');
  expect(result.allSourceIds).toEqual(['a']);
});

it('keeps prior-gap context without executing supplementary scouts in fixed-corpus mode', async () => {
  const deps = {
    query: 'Research question', allSourceIds: ['a'], topSources: [{ id: 'a', provider: 'test' }], providers: [],
    scout: jest.fn(), stats: {}, label: 'Test', skipRetrieval: true, isStrategic: false,
    useThinkTankPack: false, editorialV2: false, runMetaAnalysisStep: false, runDeliberationStep: false,
    runDebateStep: false, runDevilsAdvocateStep: true,
    ctx: { setDomain: jest.fn(), setComplexity: jest.fn(), skipStep: jest.fn(), addFinding: jest.fn() },
  } as ClassificationGatesDeps;
  const result = await runClassificationGates(deps);
  expect(deps.scout).not.toHaveBeenCalled();
  expect(result.gapContextBlock).toBe('Known gap');
});
