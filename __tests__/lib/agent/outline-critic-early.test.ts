/**
 * Early outline-critique regressions (prod forensics):
 *
 * The post-critic outline check discovers missing dimensions too late — its
 * gap requests find no new sources and the DA kills the artifact on the same
 * defects (live run: single-country analysis answering a "broader patterns"
 * question → 3 fatal challenges → HELD). Moved upstream: coverage < 70 with
 * missing dimensions now triggers ONE bounded re-analysis while the
 * reAnalysisBudget and corpus are still available, with targeted queries
 * posted for the gap-fill stage that CAN still retrieve.
 */
import { runPostAnalystChecks, type PostAnalystChecksDeps } from '@/lib/agent/pipeline-steps/post-analyst-checks';
import { critiqueOutline } from '@/lib/agent/outline-critic';
import { selfCorrectAnalyst } from '@/lib/agent/self-correction-integration';

jest.mock('@/lib/db', () => ({ prisma: { agentAuditLog: { create: jest.fn().mockResolvedValue({}) } } }));
jest.mock('@/lib/agent/output-guard', () => ({ guardOutput: jest.fn() }));
jest.mock('@/lib/agent/local-judge', () => ({ judge: jest.fn(), calibrateLocalJudge: jest.fn() }));
jest.mock('@/lib/agent/witness/integration', () => ({ buildObservation: jest.fn() }));
jest.mock('@/lib/agent/self-play/adversarial', () => ({ runSelfPlayRound: jest.fn() }));
jest.mock('@/lib/agent/prm/process-reward-model', () => ({ extractFeatures: jest.fn(), scoreStep: jest.fn(), persistProcessStep: jest.fn() }));
jest.mock('@/lib/agent/self-correction-integration', () => ({ selfCorrectAnalyst: jest.fn() }));
jest.mock('@/lib/agent/outline-critic', () => ({ critiqueOutline: jest.fn() }));
jest.mock('@/lib/agent/self-correct', () => ({
  citationCoverageVerifier: jest.fn(() => ({ id: 'cov', check: () => ({ verifierId: 'cov', verdict: 'pass', score: 1, reasons: [] }) })),
}));

const mockedOutline = jest.mocked(critiqueOutline);
const mockedSelfCorrect = jest.mocked(selfCorrectAnalyst);

const BASE_ANALYSIS = {
  verdict: 'Turkey persecutes LGBTI+ communities [SRC-1]',
  causalChain: [],
  keyFindings: [{ claim: 'State campaigns documented [SRC-1]' }],
  openQuestions: '', risks: '', evidence: '',
};

function deps(overrides: Partial<PostAnalystChecksDeps> = {}): PostAnalystChecksDeps {
  return {
    analysis: { ...BASE_ANALYSIS },
    query: 'How do persecution campaigns reflect broader patterns of democratic backsliding?',
    topSources: [{ id: 's1', title: 'T', provider: 'openalex' }],
    slimReadings: [],
    fullContextBlock: 'CTX',
    detectedDomain: 'political-science',
    isStrategic: false,
    analystCostUsd: 0.01,
    stats: {},
    label: '[T]',
    pipelineRunId: 'run',
    pipelineStart: Date.now(),
    emitProgress: jest.fn(),
    addCost: jest.fn(),
    useOutputGuard: false, useLocalJudge: false, useSelfPlay: false, usePRM: false,
    prmModel: null, witnessCtx: null, witnessReducedScope: false,
    runDevilsAdvocateStep: false, runDebateStep: false, runDeliberationStep: false,
    selfCorrector: { checkpoint: jest.fn(async () => ({ shouldRetry: false, feedback: [], cascadeDetected: false, score: 1 })) },
    selfCorrectRetries: 0,
    analystMultipass: jest.fn(async () => ({ verdict: 'rewritten with comparative dimension [SRC-1]', keyFindings: [] })),
    bumpAnalysisArtifact: jest.fn(),
    validateTopicConsistency: jest.fn(async () => ({ isValid: true, issues: [] })),
    assessAfterAnalyst: jest.fn(() => ({ action: 'PROCEED' })),
    recordDecision: jest.fn(),
    orchState: { decisions: [] },
    ctx: { addFinding: jest.fn(), requestSourceGap: jest.fn(), skipStep: jest.fn(), setAnalystOutput: jest.fn(), getSummary: jest.fn(() => ({})) },
    ...overrides,
  } as unknown as PostAnalystChecksDeps;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedSelfCorrect.mockImplementation(async ({ analysis }: any) => ({ stats: { triggered: false, issues: [] }, analysis }));
});

describe('early outline critique — coverage gate before the expensive chain', () => {
  it('re-analyzes on coverage <70 and adopts when the recheck improves', async () => {
    const d = deps();
    mockedOutline
      .mockResolvedValueOnce({ coverageScore: 60, missingDimensions: ['comparative cross-country dimension'], weakSections: ['scope'], targetedQueries: ['q1', 'q2'], rationale: '', costUsd: 0.01 } as any)
      .mockResolvedValueOnce({ coverageScore: 82, missingDimensions: [], weakSections: [], targetedQueries: [], rationale: '', costUsd: 0.01 } as any);

    const out = await runPostAnalystChecks(d);

    // Re-analysis fired with the missing dimensions injected as mandatory
    expect(d.analystMultipass).toHaveBeenCalledTimes(1);
    const ctxBlock = (d.analystMultipass as jest.Mock).mock.calls[0][3].contextBlock;
    expect(ctxBlock).toContain('MISSING DIMENSIONS');
    expect(ctxBlock).toContain('comparative cross-country dimension');
    // Rewrite adopted: artifact bumped + new analysis returned
    expect(d.bumpAnalysisArtifact).toHaveBeenCalled();
    expect(d.ctx.setAnalystOutput).toHaveBeenCalled();
    expect(out.analysis.verdict).toContain('rewritten');
    // Retrieval hints posted for the gap-fill stage
    expect(d.ctx.requestSourceGap).toHaveBeenCalledWith(
      'q1', expect.stringContaining('Missing dimension'), 'OUTLINE_CRITIC', expect.any(Array), 12,
    );
    expect(d.stats.outlineCriticEarly.adopted).toBe(true);
    expect(d.stats.outlineCriticEarly.recheckCoverage).toBe(82);
    expect(out.reAnalysisBudget).toBe(1); // brief pool 2 − 1 spent; repair reserve intact
  });

  it('keeps the original when the rewrite does not improve coverage', async () => {
    const d = deps();
    mockedOutline
      .mockResolvedValueOnce({ coverageScore: 60, missingDimensions: ['missing dim'], weakSections: [], targetedQueries: [], rationale: '', costUsd: 0.01 } as any)
      .mockResolvedValueOnce({ coverageScore: 55, missingDimensions: ['still missing'], weakSections: [], targetedQueries: [], rationale: '', costUsd: 0.01 } as any);

    const out = await runPostAnalystChecks(d);

    expect(d.analystMultipass).toHaveBeenCalledTimes(1);
    expect(d.bumpAnalysisArtifact).not.toHaveBeenCalled();
    expect(out.analysis.verdict).toBe(BASE_ANALYSIS.verdict);
    expect(d.stats.outlineCriticEarly.adopted).toBe(false);
  });

  it('does nothing at coverage ≥70 — no re-analysis, no gap requests', async () => {
    const d = deps();
    mockedOutline.mockResolvedValueOnce({ coverageScore: 78, missingDimensions: [], weakSections: [], targetedQueries: [], rationale: '', costUsd: 0.01 } as any);

    const out = await runPostAnalystChecks(d);

    expect(mockedOutline).toHaveBeenCalledTimes(1); // critique only, no recheck
    expect(d.analystMultipass).not.toHaveBeenCalled();
    expect(d.ctx.requestSourceGap).not.toHaveBeenCalled();
    expect(out.reAnalysisBudget).toBe(2); // brief pool starts at 2 — untouched, not decremented
  });
});
