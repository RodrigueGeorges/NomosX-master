import { runRankAndEnrichment, type RankEnrichmentDeps } from '@/lib/agent/pipeline-steps/rank-enrichment';
import { runScoutEnrichmentAndIndex, type ScoutEnrichmentIndexDeps } from '@/lib/agent/pipeline-steps/scout-enrichment-index';
import { assessEvidenceSufficiency } from '@/lib/agent/enrichment-reasoner';
import { callLLM } from '@/lib/llm/unified-llm';
import { withExecutionSignal } from '@/lib/worker/execution-scope';
import { embedSourcesBatch } from '@/lib/agent/semantic-engine';
import { deduplicateSources } from '@/lib/agent/index-agent';
import { runClassificationGates, type ClassificationGatesDeps } from '@/lib/agent/pipeline-steps/classification-gates';

jest.mock('@/lib/db', () => ({ prisma: {} }));
jest.mock('@/lib/llm/unified-llm', () => ({ callLLM: jest.fn() }));
jest.mock('@/lib/agent/enrichment-reasoner', () => ({ assessEvidenceSufficiency: jest.fn() }));
jest.mock('@/lib/agent/source-quality', () => ({ rankSourcesByQuality: jest.fn(async () => []) }));
jest.mock('@/lib/agent/semantic-engine', () => ({ embedSourcesBatch: jest.fn() }));
jest.mock('@/lib/agent/index-agent', () => ({ deduplicateSources: jest.fn() }));
jest.mock('@/lib/agent/topic-classifier', () => ({ classifyTopic: jest.fn(async () => ({ primaryDomain: 'test', domains: [], dimensions: [], confidence: 1 })) }));
jest.mock('@/lib/agent/gap-filler', () => ({ getRelevantGaps: jest.fn(async () => ({ gapsAddressed: 1, gapQueries: ['Missing evidence'], gapContext: 'Known gap' })) }));
jest.mock('@/lib/agent/researcher-kb/index', () => ({ RESEARCHER_KBS: {} }));
jest.mock('@/lib/providers/openalex-snowball', () => ({ snowballFromSeeds: jest.fn(async () => ({ addedIds: [], seedsUsed: 0, candidatesFetched: 0 })) }));

import { snowballFromSeeds } from '@/lib/providers/openalex-snowball';

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it.each(['index', 'embed'])('does not advance to another enrichment phase after cancellation during %s', async phase => {
  const controller = new AbortController();
  const deps = {
    allSourceIds: ['a', 'b', 'c', 'd', 'e'], stats: {}, scoutCkpt: true, label: 'Test',
    index: jest.fn(async () => {
      if (phase === 'index') controller.abort(new Error('lease lost'));
      return {};
    }),
  } as unknown as ScoutEnrichmentIndexDeps;
  jest.mocked(embedSourcesBatch).mockImplementationOnce(async () => {
    controller.abort(new Error('lease lost'));
    return { embedded: 0, skipped: 0 } as never;
  });
  await expect(withExecutionSignal(controller.signal, () => runScoutEnrichmentAndIndex(deps))).rejects.toThrow('lease lost');
  if (phase === 'index') expect(embedSourcesBatch).not.toHaveBeenCalled();
  expect(deduplicateSources).not.toHaveBeenCalled();
  jest.mocked(embedSourcesBatch).mockReset();
});

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

it.each([true, false])('fixed-corpus rank keeps the full seeded corpus (skipRetrieval=%s)', async skipRetrieval => {
  // Regen seeds are the attempt-1 curated topSources — the pertinence cut is
  // designed for raw scout pools. Re-applying it to a seeded corpus shrank a
  // 49-source corpus to 25 (live run) and the rewrite scored worse (critic
  // 68→26). Fixed-corpus mode must keep every seed.
  const ranked = Array.from({ length: 30 }, (_, i) => ({
    id: `s${i}`, title: `Source ${i}`, provider: 'test',
    qualityScore: 70, compositeScore: i === 0 ? 100 : 40, // tail below the 55% bar
  }));
  const deps = {
    query: 'Research question', allSourceIds: ranked.map(s => s.id), isStrategic: false, stats: {}, providers: [], label: 'Test',
    pipelineStart: Date.now(), runningCostUsd: 0, pipelineRunId: 'run', skipRetrieval,
    rank: jest.fn(async () => ranked),
    scout: jest.fn(), emitProgress: jest.fn(), addCost: jest.fn(),
    ctx: { setRankedSources: jest.fn(), recordAgentTiming: jest.fn(), getSummary: jest.fn(), addFinding: jest.fn() },
    orchState: { sourcesFound: 0, avgQualityScore: 0 },
  } as RankEnrichmentDeps;
  jest.mocked(assessEvidenceSufficiency).mockResolvedValue({ verdict: 'proceed', sufficiencyScore: 80, gaps: [], enrichmentQueries: [], costUsd: 0 } as never);
  const result = await runRankAndEnrichment(deps);
  if (skipRetrieval) {
    expect(result.topSources).toHaveLength(30); // full curated corpus preserved
  } else {
    expect(result.topSources.length).toBeLessThan(30); // pertinence cut applies to raw pools
  }
});

it('trims the low-quality tail on abundant raw pools but keeps ≥20 sources', async () => {
  // 30 candidates, 10 of them low-quality — the tail drags the pool average
  // (50% of the quality blend) and hands the critic weak-evidence targets.
  const ranked = Array.from({ length: 30 }, (_, i) => ({
    id: `s${i}`, title: `Source ${i}`, provider: 'test',
    qualityScore: i < 20 ? 75 : 30, compositeScore: 80 - i,
  }));
  const stats: any = {};
  const deps = {
    query: 'Research question', allSourceIds: ranked.map(s => s.id), isStrategic: false, stats, providers: [], label: 'Test',
    pipelineStart: Date.now(), runningCostUsd: 0, pipelineRunId: 'run', skipRetrieval: false,
    rank: jest.fn(async () => ranked),
    scout: jest.fn(), emitProgress: jest.fn(), addCost: jest.fn(),
    ctx: { setRankedSources: jest.fn(), recordAgentTiming: jest.fn(), getSummary: jest.fn(), addFinding: jest.fn() },
    orchState: { sourcesFound: 0, avgQualityScore: 0 },
  } as RankEnrichmentDeps;
  jest.mocked(assessEvidenceSufficiency).mockResolvedValue({ verdict: 'proceed', sufficiencyScore: 80, gaps: [], enrichmentQueries: [], costUsd: 0 } as never);
  const result = await runRankAndEnrichment(deps);
  expect(result.topSources).toHaveLength(20);
  expect(result.topSources.every((s: any) => s.qualityScore >= 40)).toBe(true);
  expect(stats.qualityTailTrim).toMatchObject({ dropped: 10, floor: 40 });
});

it('keeps a low-quality source when it is the sole representative of its provider', async () => {
  // Provider diversity is a trust term — a weak source that is the ONLY one
  // from its provider still carries contrarian/minority evidence. Dropping
  // it would shrink providerDiversity and hand the critic a confirmation-
  // bias finding. The trim must spare provider singletons.
  const ranked = [
    ...Array.from({ length: 29 }, (_, i) => ({
      id: `s${i}`, title: `Source ${i}`, provider: 'mainstream',
      qualityScore: i < 20 ? 75 : 30, compositeScore: 80 - i,
    })),
    { id: 'lone', title: 'Lone dissenting source', provider: 'niche-journal', qualityScore: 25, compositeScore: 60 },
  ];
  const deps = {
    query: 'Research question', allSourceIds: ranked.map(s => s.id), isStrategic: false, stats: {}, providers: [], label: 'Test',
    pipelineStart: Date.now(), runningCostUsd: 0, pipelineRunId: 'run', skipRetrieval: false,
    rank: jest.fn(async () => ranked),
    scout: jest.fn(), emitProgress: jest.fn(), addCost: jest.fn(),
    ctx: { setRankedSources: jest.fn(), recordAgentTiming: jest.fn(), getSummary: jest.fn(), addFinding: jest.fn() },
    orchState: { sourcesFound: 0, avgQualityScore: 0 },
  } as RankEnrichmentDeps;
  jest.mocked(assessEvidenceSufficiency).mockResolvedValue({ verdict: 'proceed', sufficiencyScore: 80, gaps: [], enrichmentQueries: [], costUsd: 0 } as never);
  const result = await runRankAndEnrichment(deps);
  // 9 mainstream tail sources dropped; the niche-journal singleton survives
  expect(result.topSources.some((s: any) => s.id === 'lone')).toBe(true);
  expect(result.topSources).toHaveLength(21); // 20 mainstream + 1 singleton
});

it('does not trim a pool at the abundance boundary (≤25 sources)', async () => {
  const ranked = Array.from({ length: 25 }, (_, i) => ({
    id: `s${i}`, title: `Source ${i}`, provider: 'test',
    qualityScore: i < 5 ? 30 : 70, compositeScore: 80 - i,
  }));
  const deps = {
    query: 'Research question', allSourceIds: ranked.map(s => s.id), isStrategic: false, stats: {}, providers: [], label: 'Test',
    pipelineStart: Date.now(), runningCostUsd: 0, pipelineRunId: 'run', skipRetrieval: false,
    rank: jest.fn(async () => ranked),
    scout: jest.fn(), emitProgress: jest.fn(), addCost: jest.fn(),
    ctx: { setRankedSources: jest.fn(), recordAgentTiming: jest.fn(), getSummary: jest.fn(), addFinding: jest.fn() },
    orchState: { sourcesFound: 0, avgQualityScore: 0 },
  } as RankEnrichmentDeps;
  jest.mocked(assessEvidenceSufficiency).mockResolvedValue({ verdict: 'proceed', sufficiencyScore: 80, gaps: [], enrichmentQueries: [], costUsd: 0 } as never);
  const result = await runRankAndEnrichment(deps);
  expect(result.topSources).toHaveLength(25);
});

it('does not trim the tail in fixed-corpus mode (curated seeds are not a raw pool)', async () => {
  const ranked = Array.from({ length: 30 }, (_, i) => ({
    id: `s${i}`, title: `Source ${i}`, provider: 'test',
    qualityScore: i < 20 ? 75 : 30, compositeScore: 80 - i,
  }));
  const deps = {
    query: 'Research question', allSourceIds: ranked.map(s => s.id), isStrategic: false, stats: {}, providers: [], label: 'Test',
    pipelineStart: Date.now(), runningCostUsd: 0, pipelineRunId: 'run', skipRetrieval: true,
    rank: jest.fn(async () => ranked),
    scout: jest.fn(), emitProgress: jest.fn(), addCost: jest.fn(),
    ctx: { setRankedSources: jest.fn(), recordAgentTiming: jest.fn(), getSummary: jest.fn(), addFinding: jest.fn() },
    orchState: { sourcesFound: 0, avgQualityScore: 0 },
  } as RankEnrichmentDeps;
  jest.mocked(assessEvidenceSufficiency).mockResolvedValue({ verdict: 'proceed', sufficiencyScore: 80, gaps: [], enrichmentQueries: [], costUsd: 0 } as never);
  const result = await runRankAndEnrichment(deps);
  expect(result.topSources).toHaveLength(30);
});

it('never restores explicitly off-topic documents to meet a quantity floor, even after enrichment', async () => {
  const ranked = Array.from({ length: 30 }, (_, i) => ({
    id: `s${i}`, title: `Source ${i}`, provider: 'test', qualityScore: 70, compositeScore: 80,
  }));
  jest.mocked(callLLM).mockResolvedValueOnce({ content: JSON.stringify({ scores: Object.fromEntries(ranked.map((_, i) => [String(i), i < 5 ? 3 : 0])) }), costUsd: 0 } as never);
  jest.mocked(assessEvidenceSufficiency).mockResolvedValueOnce({ verdict: 'enrich', sufficiencyScore: 40, gaps: ['Missing evidence'], enrichmentQueries: ['A targeted search'], suggestedProviders: [], costUsd: 0 } as never);
  const deps = {
    query: 'Research question', allSourceIds: ranked.map(s => s.id), isStrategic: false, stats: {}, providers: [], label: 'Test',
    pipelineStart: Date.now(), runningCostUsd: 0, pipelineRunId: 'run', skipRetrieval: false,
    rank: jest.fn().mockResolvedValueOnce(ranked).mockResolvedValueOnce([...ranked, { id: 'new', title: 'New source', qualityScore: 70, provider: 'test' }]),
    scout: jest.fn(async () => ({ sourceIds: ['new'] })), emitProgress: jest.fn(), addCost: jest.fn(),
    ctx: { setRankedSources: jest.fn(), recordAgentTiming: jest.fn(), getSummary: jest.fn(), addFinding: jest.fn() },
    orchState: { sourcesFound: 0, avgQualityScore: 0 },
  } as RankEnrichmentDeps;
  const result = await runRankAndEnrichment(deps);
  expect(result.topSources.map(s => s.id)).toEqual(['s0', 's1', 's2', 's3', 's4', 'new']);
});

it('expands the pool by citation snowball on a live corpus and merges the re-rank', async () => {
  const ranked = Array.from({ length: 25 }, (_, i) => ({
    id: `s${i}`, title: `Source ${i}`, provider: 'test', doi: `10.1/${i}`,
    qualityScore: 70, compositeScore: 80 - i,
  }));
  jest.mocked(assessEvidenceSufficiency).mockResolvedValue({ verdict: 'proceed', sufficiencyScore: 80, gaps: [], enrichmentQueries: [], costUsd: 0 } as never);
  jest.mocked(snowballFromSeeds).mockResolvedValue({ addedIds: ['openalex:10-2-cited-x', 'openalex:10-2-cites-y'], seedsUsed: 5, candidatesFetched: 20 } as never);
  const stats: any = {};
  const deps = {
    query: 'Research question', allSourceIds: ranked.map(s => s.id), isStrategic: false, stats, providers: [], label: 'Test',
    pipelineStart: Date.now(), runningCostUsd: 0, pipelineRunId: 'run', skipRetrieval: false,
    rank: jest.fn()
      .mockResolvedValueOnce(ranked)
      .mockResolvedValueOnce([...ranked, { id: 'openalex:10-2-cited-x', title: 'Cited work', provider: 'openalex', qualityScore: 75, compositeScore: 70 }]),
    scout: jest.fn(), emitProgress: jest.fn(), addCost: jest.fn(),
    ctx: { setRankedSources: jest.fn(), recordAgentTiming: jest.fn(), getSummary: jest.fn(), addFinding: jest.fn() },
    orchState: { sourcesFound: 0, avgQualityScore: 0 },
  } as RankEnrichmentDeps;
  const result = await runRankAndEnrichment(deps);
  expect(snowballFromSeeds).toHaveBeenCalled();
  expect(result.allSourceIds).toContain('openalex:10-2-cited-x');
  expect(result.topSources.some((s: any) => s.id === 'openalex:10-2-cited-x')).toBe(true);
  expect(stats.snowball).toMatchObject({ seedsUsed: 5, newSourcesAdded: 2 });
});

it('never snowballs a fixed corpus, and snowballed ids respect the off-topic exclusion', async () => {
  const ranked = Array.from({ length: 25 }, (_, i) => ({
    id: `s${i}`, title: `Source ${i}`, provider: 'test', qualityScore: 70, compositeScore: 80 - i,
  }));
  jest.mocked(assessEvidenceSufficiency).mockResolvedValue({ verdict: 'proceed', sufficiencyScore: 80, gaps: [], enrichmentQueries: [], costUsd: 0 } as never);

  // fixed corpus — no traversal at all
  jest.mocked(snowballFromSeeds).mockClear();
  const fixedDeps = {
    query: 'q', allSourceIds: ranked.map(s => s.id), isStrategic: false, stats: {}, providers: [], label: 'Test',
    pipelineStart: Date.now(), runningCostUsd: 0, pipelineRunId: 'run', skipRetrieval: true,
    rank: jest.fn(async () => ranked), scout: jest.fn(), emitProgress: jest.fn(), addCost: jest.fn(),
    ctx: { setRankedSources: jest.fn(), recordAgentTiming: jest.fn(), getSummary: jest.fn(), addFinding: jest.fn() },
    orchState: { sourcesFound: 0, avgQualityScore: 0 },
  } as RankEnrichmentDeps;
  await runRankAndEnrichment(fixedDeps);
  expect(snowballFromSeeds).not.toHaveBeenCalled();

  // live corpus — a doc the relevance screen judged off-topic stays excluded:
  // snowball may resurface it (it was scouted, so it lives in allSourceIds)
  // but it must never re-enter topSources nor count as new evidence.
  // (>25 sources: the screen only runs above that threshold)
  const bigRanked = Array.from({ length: 30 }, (_, i) => ({
    id: `s${i}`, title: `Source ${i}`, provider: 'test', qualityScore: 70, compositeScore: 80 - i,
  }));
  const withRejected = bigRanked.map((s, i) => (i === 0 ? { ...s, id: 'rejected-doc' } : s));
  jest.mocked(snowballFromSeeds).mockResolvedValue({ addedIds: ['rejected-doc'], seedsUsed: 3, candidatesFetched: 9 } as never);
  jest.mocked(callLLM).mockResolvedValueOnce({ content: JSON.stringify({ scores: { '0': 0 } }), costUsd: 0 } as never);
  const stats: any = {};
  const liveDeps = {
    query: 'q', allSourceIds: withRejected.map(s => s.id), isStrategic: false, stats, providers: [], label: 'Test',
    pipelineStart: Date.now(), runningCostUsd: 0, pipelineRunId: 'run', skipRetrieval: false,
    rank: jest.fn()
      .mockResolvedValueOnce(withRejected)
      .mockResolvedValueOnce([...withRejected.slice(1), { id: 'rejected-doc', title: 'x', provider: 'openalex', qualityScore: 90 }]),
    scout: jest.fn(), emitProgress: jest.fn(), addCost: jest.fn(),
    ctx: { setRankedSources: jest.fn(), recordAgentTiming: jest.fn(), getSummary: jest.fn(), addFinding: jest.fn() },
    orchState: { sourcesFound: 0, avgQualityScore: 0 },
  } as RankEnrichmentDeps;
  const result = await runRankAndEnrichment(liveDeps);
  expect(result.topSources.every((s: any) => s.id !== 'rejected-doc')).toBe(true);
  expect(stats.snowball.newSourcesAdded).toBe(0);
});

it('re-scouts once for core evidence when the corpus is dominated by tangential sources', async () => {
  // CRAG gradation: 8 correct / 10 ambiguous / 12 incorrect — ambiguous
  // dominance must trigger refinement, not silent acceptance.
  const ranked = Array.from({ length: 30 }, (_, i) => ({
    id: `s${i}`, title: `Source ${i}`, provider: 'test', qualityScore: 70, compositeScore: 80,
  }));
  const scores: Record<string, number> = {};
  for (let i = 0; i < 30; i++) scores[String(i)] = i < 8 ? 2 : i < 18 ? 1 : 0;
  jest.mocked(callLLM).mockResolvedValueOnce({ content: JSON.stringify({ scores }), costUsd: 0 } as never);
  jest.mocked(assessEvidenceSufficiency).mockResolvedValue({ verdict: 'proceed', sufficiencyScore: 80, gaps: [], enrichmentQueries: [], costUsd: 0 } as never);
  const stats: any = {};
  const deps = {
    query: 'Research question', allSourceIds: ranked.map(s => s.id), isStrategic: false, stats, providers: [], label: 'Test',
    pipelineStart: Date.now(), runningCostUsd: 0, pipelineRunId: 'run', skipRetrieval: false,
    rank: jest.fn()
      .mockResolvedValueOnce(ranked)
      .mockResolvedValueOnce([...ranked, { id: 'core1', title: 'Core evidence', provider: 'test', qualityScore: 90, compositeScore: 95 }]),
    scout: jest.fn(async () => ({ sourceIds: ['core1'] })),
    emitProgress: jest.fn(), addCost: jest.fn(),
    ctx: { setRankedSources: jest.fn(), recordAgentTiming: jest.fn(), getSummary: jest.fn(), addFinding: jest.fn() },
    orchState: { sourcesFound: 0, avgQualityScore: 0 },
  } as RankEnrichmentDeps;
  const result = await runRankAndEnrichment(deps);
  expect(deps.scout).toHaveBeenCalledTimes(1);
  expect(deps.scout.mock.calls[0][0]).toContain('primary evidence');
  expect(stats.relevanceScreen).toMatchObject({ correct: 8, ambiguous: 10, cragRescout: { added: 1 } });
  expect(result.topSources.some((s: any) => s.id === 'core1')).toBe(true);
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
