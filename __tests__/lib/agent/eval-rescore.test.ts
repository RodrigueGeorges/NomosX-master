/**
 * eval-rescore regressions (prod forensics):
 *
 * Any analysis mutation after the evaluators ran — critic repair adoption,
 * post-critic gap-fill re-analysis via processGapRequests('CRITIC/OUTLINE') —
 * bumps analysisArtifactVersion. The verdict-bearing evals (critic, panel,
 * structural) then describe a replaced draft → collectStaleEvaluations marks
 * them stale → evaluation_freshness hard-fails → guaranteed HELD regardless
 * of quality. The rescore re-judges each stale eval once on the adopted
 * analysis so the gate sees verdicts on the artifact actually rendered.
 */
import { rescoreStaleAnalysisEvals, staleAnalysisEvalKeys, failedAnalysisEvalKeys } from '@/lib/agent/pipeline-steps/eval-rescore';
import { runCritic } from '@/lib/agent/critic-agent';
import { runCriticPanel } from '@/lib/agent/critic-panel';
import { structuralEditorReview } from '@/lib/agent/structural-editor';

jest.mock('@/lib/agent/critic-agent', () => ({ runCritic: jest.fn() }));
jest.mock('@/lib/agent/critic-panel', () => ({ runCriticPanel: jest.fn() }));
jest.mock('@/lib/agent/structural-editor', () => ({ structuralEditorReview: jest.fn() }));

const mockedCritic = jest.mocked(runCritic);
const mockedPanel = jest.mocked(runCriticPanel);
const mockedStructural = jest.mocked(structuralEditorReview);

const tagEval = <T extends Record<string, any>>(entry: T, artifact: 'analysis' | 'html'): T => {
  (entry as any).evaluatedArtifact = artifact;
  (entry as any).artifactVersion = CURRENT_VERSION;
  return entry;
};
const CURRENT_VERSION = 2;

function deps(overrides: Partial<Parameters<typeof rescoreStaleAnalysisEvals>[0]> = {}) {
  return {
    stats: {} as Record<string, any>,
    analysis: { keyFindings: [{ claim: 'X [SRC-1]', evidence: 'y' }] },
    analysisArtifactVersion: CURRENT_VERSION,
    query: 'test question',
    detectedDomain: 'geopolitics',
    positioningBrief: null,
    topSources: [{ id: 's1', title: 'T', abstract: 'A', provider: 'openalex', qualityScore: 70 }],
    readings: [{ sourceId: 's1', extractedText: 'full text' }],
    label: '[TEST]',
    isBudgetConstrained: () => false,
    addCost: jest.fn(),
    tagEval,
    ...overrides,
  };
}

describe('staleAnalysisEvalKeys', () => {
  it('flags only verdict evals tagged to a replaced analysis version', () => {
    const stats = {
      critic: { overallScore: 45, artifactVersion: 1 },
      criticPanel: { overallScore: 60, artifactVersion: 1 },
      structuralEditor: { overallStructure: 70, artifactVersion: 2 },
      devilsAdvocate: { verdict: 'reject', artifactVersion: 1 }, // html-tagged — not rescored here
      grounding: { score: 90, artifactVersion: 1 },              // not a rescorable key
    };
    expect(staleAnalysisEvalKeys(stats, 2)).toEqual(['critic', 'criticPanel']);
  });

  it('skips error/skipped evals — never rescore what never ran', () => {
    const stats = {
      critic: { error: 'provider down', artifactVersion: 1 },
      criticPanel: { skipped: true, artifactVersion: 1 },
    };
    expect(staleAnalysisEvalKeys(stats, 2)).toEqual([]);
  });
});

describe('failedAnalysisEvalKeys — errored evaluators route back to the agent', () => {
  it('flags evaluators that crashed or returned incomplete', () => {
    const stats = {
      critic: { error: 'provider down' },
      criticPanel: { evaluationComplete: false, artifactVersion: 2 },
      structuralEditor: { overallStructure: 70, artifactVersion: 2 }, // healthy
      devilsAdvocate: { error: 'timeout' },                          // html-tagged — not rescored here
    };
    expect(failedAnalysisEvalKeys(stats)).toEqual(['critic', 'criticPanel']);
  });

  it('does NOT flag deliberate skips — a budget skip is not a failure', () => {
    expect(failedAnalysisEvalKeys({ criticPanel: { skipped: true } })).toEqual([]);
  });
});

describe('rescoreStaleAnalysisEvals', () => {
  beforeEach(() => jest.clearAllMocks());

  it('re-judges every stale eval on the adopted analysis and re-tags at the current version', async () => {
    const d = deps();
    d.stats = {
      critic: { overallScore: 45, verdict: 'repair', artifactVersion: 1 },
      criticPanel: { overallScore: 50, artifactVersion: 1 },
      structuralEditor: { overallStructure: 55, artifactVersion: 1 },
    };
    mockedCritic.mockResolvedValue({
      verdict: 'approve', overallScore: 78, groundedness: 0.9,
      claims: [{}], contradictions: [], contestedFindings: [], biases: [],
      citationIssues: [], stageResults: [], costUsd: 0.02, durationMs: 100,
    } as any);
    mockedPanel.mockResolvedValue({
      overallScore: 72, veto: false, vetoReasons: [],
      dimensions: [{ dimension: 'methodology', score: 72, findings: ['ok'], mustFix: false }],
      costUsd: 0.02, durationMs: 50,
    } as any);
    mockedStructural.mockResolvedValue({
      overallStructure: 80, narrativeArcValid: true, sectionReviews: [],
      logicalGaps: [], restructuringSuggestions: ['tighten arc'], costUsd: 0.01, durationMs: 40,
    } as any);

    let rescoredCritic: any = null;
    await rescoreStaleAnalysisEvals({ ...d, onCriticRescored: r => { rescoredCritic = r; } });

    expect(mockedCritic).toHaveBeenCalledTimes(1);
    expect(mockedPanel).toHaveBeenCalledTimes(1);
    expect(mockedStructural).toHaveBeenCalledTimes(1);
    expect(d.stats.critic.overallScore).toBe(78);
    expect(d.stats.critic.artifactVersion).toBe(CURRENT_VERSION);
    expect(d.stats.critic.rescoredPostMutation).toBe(true);
    expect(d.stats.criticPanel.overallScore).toBe(72);
    expect(d.stats.criticPanel.artifactVersion).toBe(CURRENT_VERSION);
    expect(d.stats.structuralEditor.overallStructure).toBe(80);
    expect(d.stats.structuralEditor.artifactVersion).toBe(CURRENT_VERSION);
    expect(rescoredCritic?.overallScore).toBe(78);
    // three rescored evals, three cost entries
    expect(d.addCost).toHaveBeenCalledTimes(3);
  });

  it('normalizes [E-N] citations to [SRC-N] for the critic rescore', async () => {
    const d = deps();
    d.analysis = { keyFindings: [{ claim: 'GDP fell [E41]', evidence: 'x' }] };
    d.stats = { critic: { overallScore: 40, artifactVersion: 1 } };
    mockedCritic.mockResolvedValue({
      verdict: 'approve', overallScore: 70, groundedness: 0.8,
      claims: [], contradictions: [], biases: [], citationIssues: [],
      stageResults: [], costUsd: 0.01, durationMs: 10,
    } as any);
    await rescoreStaleAnalysisEvals(d);
    const text = mockedCritic.mock.calls[0][0] as string;
    expect(text).toContain('[SRC-41]');
    expect(text).not.toContain('[E41]');
  });

  it('does nothing when all evals are fresh — no LLM spend', async () => {
    const d = deps();
    d.stats = {
      critic: { overallScore: 70, artifactVersion: CURRENT_VERSION },
      criticPanel: { overallScore: 65, artifactVersion: CURRENT_VERSION },
      structuralEditor: { overallStructure: 70, artifactVersion: CURRENT_VERSION },
    };
    await rescoreStaleAnalysisEvals(d);
    expect(mockedCritic).not.toHaveBeenCalled();
    expect(mockedPanel).not.toHaveBeenCalled();
    expect(mockedStructural).not.toHaveBeenCalled();
  });

  it('does nothing under budget constraint — never burns the reserve on rescore', async () => {
    const d = deps({ isBudgetConstrained: () => true });
    d.stats = { critic: { overallScore: 40, artifactVersion: 1 } };
    await rescoreStaleAnalysisEvals(d);
    expect(mockedCritic).not.toHaveBeenCalled();
  });

  it('a failed rescore leaves the stale eval in place — collectStaleEvaluations still catches it', async () => {
    const d = deps();
    d.stats = { critic: { overallScore: 40, artifactVersion: 1 } };
    mockedCritic.mockRejectedValue(new Error('provider down'));
    await rescoreStaleAnalysisEvals(d);
    expect(d.stats.critic.artifactVersion).toBe(1); // untouched → still stale → gate fails closed
  });

  it('re-invokes an evaluator that crashed — transient failure routed back to the agent', async () => {
    const d = deps();
    d.stats = {
      critic: { error: 'provider down' },        // errored, no version — evaluation_availability fails
      criticPanel: { overallScore: 65, artifactVersion: CURRENT_VERSION },
    };
    mockedCritic.mockResolvedValue({
      verdict: 'approve', overallScore: 74, groundedness: 0.85,
      claims: [{}], contradictions: [], contestedFindings: [], biases: [],
      citationIssues: [], stageResults: [], costUsd: 0.02, durationMs: 40,
    } as any);
    await rescoreStaleAnalysisEvals(d);
    expect(mockedCritic).toHaveBeenCalledTimes(1);
    expect(d.stats.critic.overallScore).toBe(74);
    expect(d.stats.critic.error).toBeUndefined();          // failure entry replaced by a live verdict
    expect(d.stats.critic.artifactVersion).toBe(CURRENT_VERSION);
    expect(mockedPanel).not.toHaveBeenCalled();            // healthy eval untouched
  });

  it('handles stale + errored in one pass without double-spending', async () => {
    const d = deps();
    d.stats = {
      critic: { overallScore: 40, artifactVersion: 1 },    // stale
      criticPanel: { error: 'timeout' },                   // errored
      structuralEditor: { overallStructure: 70, artifactVersion: CURRENT_VERSION },
    };
    mockedCritic.mockResolvedValue({
      verdict: 'approve', overallScore: 70, groundedness: 0.8,
      claims: [], contradictions: [], biases: [], citationIssues: [],
      stageResults: [], costUsd: 0.02, durationMs: 40,
    } as any);
    mockedPanel.mockResolvedValue({
      overallScore: 68, veto: false, vetoReasons: [],
      dimensions: [], costUsd: 0.02, durationMs: 50,
    } as any);
    await rescoreStaleAnalysisEvals(d);
    expect(mockedCritic).toHaveBeenCalledTimes(1);
    expect(mockedPanel).toHaveBeenCalledTimes(1);
    expect(mockedStructural).not.toHaveBeenCalled();
  });
});
