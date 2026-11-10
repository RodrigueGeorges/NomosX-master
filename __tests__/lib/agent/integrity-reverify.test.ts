/**
 * Stale integrity evals before persist — the sweep's revision editor and the
 * pack can bump html AFTER the integrity verifiers ran; the gate only
 * hard-fails on verdictStale (critic/panel/DA), so stale claimGrounding /
 * citationVerifier / factChecker / symbolicVerifier verdicts were silently
 * consumed and the trust composite described a replaced artifact. The tail
 * now re-runs the free verifiers on the final html, re-tags them, and
 * recomputes trust via the canonical rescore before the freshness assert.
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    brief: { create: jest.fn(async () => ({ id: 'brief-1' })), update: jest.fn(async () => ({})) },
    pipelineRun: { update: jest.fn(async () => ({})) },
    $executeRawUnsafe: jest.fn(async () => 0),
  },
  withDbRetry: (fn: () => any) => fn(),
}));
jest.mock('@/lib/worker/execution-scope', () => ({
  assertExecutionActive: jest.fn(),
  withExecutionDetached: (fn: () => any) => fn(),
}));
jest.mock('@/lib/agent/knowledge-graph', () => ({ extractAndStoreConcepts: jest.fn(async () => ({ concepts: [], relations: [], costUsd: 0 })) }));
jest.mock('@/lib/agent/gap-filler', () => ({ extractAndStoreGaps: jest.fn(async () => ({ gaps: [] })), markGapsFilled: jest.fn(async () => undefined) }));
jest.mock('@/lib/agent/source-reputation-agent', () => ({ recordSourceUsage: jest.fn(() => Promise.resolve()) }));
jest.mock('@/lib/agent/prediction-registration', () => ({ registerPredictions: jest.fn(async () => ({ registered: 0 })) }));
jest.mock('@/lib/agent/agent-memory', () => ({
  recordAgentPerformance: jest.fn(async () => ({})),
  extractLessons: jest.fn(async () => ({ lessons: [] })),
  storeLesson: jest.fn(async () => ({})),
  recordLearningCycle: jest.fn(async () => ({})),
}));
jest.mock('@/lib/agent/durable-execution', () => ({ markDurableComplete: jest.fn(async () => undefined) }));
jest.mock('@/lib/agent/moa/mixture-of-agents', () => ({ updateAgentWeights: jest.fn(async () => undefined) }));
jest.mock('@/lib/agent/world-model/world-model', () => ({ updateWorldModel: jest.fn(async () => undefined) }));
jest.mock('@/lib/agent/self-evolver', () => ({ runEvolutionCycle: jest.fn(async () => []) }));
jest.mock('@/lib/agent/prm/process-reward-model', () => ({ retrainPRM: jest.fn(async () => null) }));
jest.mock('@/lib/agent/ragas-eval', () => ({ evaluateBriefRAG: jest.fn() }));
jest.mock('@/lib/agent/episodic-memory', () => ({ storeEpisode: jest.fn(async () => undefined) }));
jest.mock('@/lib/agent/prediction-tracker', () => ({ storePredictionsFromHypotheses: jest.fn(async () => undefined) }));
jest.mock('@/lib/agent/prediction-auditor', () => ({ runPredictionAuditor: jest.fn(async () => ({ audited: 0 })) }));
jest.mock('@/lib/agent/frozen-inputs', () => ({
  ...jest.requireActual('@/lib/agent/frozen-inputs'),
  mergeInputsIntoStats: jest.fn(),
}));
jest.mock('@/lib/agent/nli-verifier', () => ({ verifyCitationsNLI: jest.fn() }));
jest.mock('@/lib/agent/symbolic-verifier', () => ({ verifySymbolically: jest.fn() }));
jest.mock('@/lib/agent/claim-grounding', () => ({ groundClaimsWithNLI: jest.fn() }));
jest.mock('@/lib/agent/fact-checker', () => ({ factChecker: jest.fn() }));

import { runPersistenceTail } from '@/lib/agent/pipeline-steps/persistence-tail';
import { verifyCitationsNLI } from '@/lib/agent/nli-verifier';
import { verifySymbolically } from '@/lib/agent/symbolic-verifier';
import { groundClaimsWithNLI } from '@/lib/agent/claim-grounding';
import { factChecker } from '@/lib/agent/fact-checker';

const nliMock = verifyCitationsNLI as jest.Mock;
const symMock = verifySymbolically as jest.Mock;
const groundMock = groundClaimsWithNLI as jest.Mock;
const factMock = factChecker as jest.Mock;

const HTML = '<article><p>Some analysis text.</p></article>';

function makeDeps(stats: Record<string, any>, htmlVersion = 1) {
  const orchState = { trustScore: 0 as number | null | undefined, decisions: [] as unknown[] };
  const EVAL_KEYS = ['critic', 'criticPanel', 'devilsAdvocate', 'claimGrounding', 'citationVerifier', 'factChecker', 'symbolicVerifier'];
  const collectStaleEvaluations = () => {
    const stale: string[] = [];
    for (const k of EVAL_KEYS) {
      const e = stats[k];
      if (e && typeof e === 'object' && !e.skipped && !e.error
        && typeof e.artifactVersion === 'number'
        && e.artifactVersion !== (e.evaluatedArtifact === 'html' ? htmlVersion : 0)) {
        e.stale = true;
        stale.push(k);
      }
    }
    return stale;
  };
  const tagEval = <T extends Record<string, any>>(entry: T, artifact: 'analysis' | 'html'): T => {
    entry.evaluatedArtifact = artifact;
    entry.artifactVersion = artifact === 'html' ? htmlVersion : 0;
    return entry;
  };
  const deps: any = {
    label: '[TEST]',
    isStrategic: false,
    query: 'test question?',
    html: HTML,
    stats,
    topSources: [{ id: 's1', provider: 'openalex', qualityScore: 70 }],
    analysis: {},
    detectedDomain: 'general',
    foundationalSources: [],
    pipelineRun: { id: 'run-1' },
    orchState,
    episodicContext: [],
    pipelineStart: Date.now(),
    runningCostUsd: 0,
    savedScatterResult: null,
    useTemporalMemory: false,
    ctx: { getSummary: () => ({}) },
    emitProgress: jest.fn(),
    collectStaleEvaluations,
    analysisArtifactVersion: 0,
    htmlArtifactVersion: htmlVersion,
    durableKey: null,
    memoryBlock: undefined,
    readerMemoryBlock: undefined,
    readings: [],
    witnessCtx: null,
    useWorldModel: false,
    worldModelControversies: [],
    usePRM: false,
    prmModel: null,
    useRagasEval: false,
    useSelfEvolution: false,
    useMixtureOfAgents: false,
    addCost: jest.fn(),
    isBudgetConstrained: () => false,
    tagEval,
  };
  return { deps, orchState, stats };
}

const staleHtmlEval = (extra: Record<string, any> = {}) => ({
  evaluatedArtifact: 'html', artifactVersion: 0, ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  nliMock.mockResolvedValue({ overallIntegrity: 92, supported: 5, flaggedClaims: [] });
  symMock.mockReturnValue({ score: 100, passed: 2, failed: 0, flagged: [] });
  groundMock.mockResolvedValue({ supported: 6, partial: 1, unsupported: 0, uncited: 0, contradicted: 0, groundedness: 0.95, removedClaims: 0 });
  factMock.mockResolvedValue({ totalClaims: 10, verified: 9, majorIssues: 1, fatalIssues: 0, integrityScore: 88, results: [], costUsd: 0.002 });
});

describe('integrity re-verify before the freshness assert', () => {
  it('stale claimGrounding + citationVerifier are re-run, re-tagged, and trust recomputed', async () => {
    const stats: Record<string, any> = {
      criticalLoop: { finalScore: 20, needsHumanReview: true },
      claimGrounding: staleHtmlEval({ supported: 2, partial: 0, unsupported: 4, uncited: 0, contradicted: 0, groundedness: 33, flagged: 4 }),
      citationVerifier: staleHtmlEval({ integrity: 50, supported: 2, flagged: 4 }),
    };
    const { deps, orchState } = makeDeps(stats);
    await runPersistenceTail(deps);

    expect(groundMock).toHaveBeenCalledTimes(1);
    // non-mutating mode — the tail never adopts a rewritten html at persist time
    expect(groundMock.mock.calls[0][2]).toMatchObject({ mode: 'flag' });
    expect(nliMock).toHaveBeenCalledTimes(1);
    expect(factMock).not.toHaveBeenCalled(); // factChecker was not stale
    expect(stats.claimGrounding.artifactVersion).toBe(1);
    expect(stats.claimGrounding.groundedness).toBe(95);
    expect(stats.citationVerifier.artifactVersion).toBe(1);
    expect(stats.citationVerifier.integrity).toBe(92);
    // Freshness assert no longer lists them
    expect(stats.evaluationFreshness.stale).not.toContain('claimGrounding');
    expect(stats.evaluationFreshness.stale).not.toContain('citationVerifier');
    // Trust recomputed through the canonical rescore — the stale-eval score
    // (20, tanked by 33% groundedness) is replaced by the refreshed composite.
    expect(stats.integrityReverity ?? stats.integrityReverify).toBeDefined();
    expect(stats.integrityReverify.stale).toEqual(expect.arrayContaining(['claimGrounding', 'citationVerifier']));
    expect(stats.integrityReverify.rechecked).toEqual(expect.arrayContaining(['claimGrounding', 'citationVerifier']));
    expect(stats.integrityReverify.trustBefore).toBe(20);
    expect(stats.criticalLoop.finalScore).not.toBe(20);
    expect(orchState.trustScore).toBe(stats.criticalLoop.finalScore);
  });

  it('NLI verifier throwing keeps citationVerifier stale — others still refresh, no throw', async () => {
    nliMock.mockRejectedValue(new Error('NLI down'));
    const stats: Record<string, any> = {
      criticalLoop: { finalScore: 50 },
      claimGrounding: staleHtmlEval({ groundedness: 30, supported: 1 }),
      citationVerifier: staleHtmlEval({ integrity: 55 }),
    };
    const { deps } = makeDeps(stats);
    await expect(runPersistenceTail(deps)).resolves.toBeDefined();

    expect(stats.citationVerifier.artifactVersion).toBe(0);
    expect(stats.citationVerifier.stale).toBe(true);
    expect(stats.claimGrounding.artifactVersion).toBe(1);
    expect(stats.evaluationFreshness.stale).toContain('citationVerifier');
    expect(stats.evaluationFreshness.stale).not.toContain('claimGrounding');
    expect(stats.integrityReverify.rechecked).toContain('claimGrounding');
    expect(stats.integrityReverify.rechecked).not.toContain('citationVerifier');
  });

  it('nothing stale → no verifier called, no integrityReverify', async () => {
    const stats: Record<string, any> = {
      criticalLoop: { finalScore: 80 },
      claimGrounding: { evaluatedArtifact: 'html', artifactVersion: 1, groundedness: 90 },
      citationVerifier: { evaluatedArtifact: 'html', artifactVersion: 1, integrity: 90 },
    };
    const { deps } = makeDeps(stats);
    await runPersistenceTail(deps);

    expect(groundMock).not.toHaveBeenCalled();
    expect(nliMock).not.toHaveBeenCalled();
    expect(symMock).not.toHaveBeenCalled();
    expect(factMock).not.toHaveBeenCalled();
    expect(stats.integrityReverify).toBeUndefined();
    expect(stats.evaluationFreshness.stale).toEqual([]);
  });
});
