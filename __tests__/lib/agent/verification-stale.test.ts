/**
 * Post-sanitize eval reconciliation — the fact-checker's own sanitization
 * bumps the html artifact version, which previously left factChecker +
 * citationVerifier + symbolicVerifier tagged to the pre-sanitize artifact:
 * evaluation_freshness hard-failed with no rescore path (rescoreStaleAnalysisEvals
 * only covers analysis-tagged evals). The block now re-verifies the artifact
 * actually persisted; a failed re-check keeps the eval stale (fail-closed).
 */

jest.mock('@/lib/agent/fact-checker', () => ({ factChecker: jest.fn() }));
jest.mock('@/lib/agent/citation-repair', () => ({ repairCitations: jest.fn() }));
jest.mock('@/lib/agent/citation-verifier', () => ({
  verifyCitations: jest.fn(),
  repairWithInnovations: jest.fn(),
}));
jest.mock('@/lib/agent/nli-verifier', () => ({ verifyCitationsNLI: jest.fn() }));
jest.mock('@/lib/agent/symbolic-verifier', () => ({ verifySymbolically: jest.fn() }));
jest.mock('@/lib/agent/fact-repair', () => ({ repairFactualDiscrepancies: jest.fn() }));

import { runVerificationBlock } from '@/lib/agent/pipeline-steps/verification-block';
import { factChecker } from '@/lib/agent/fact-checker';
import { repairCitations } from '@/lib/agent/citation-repair';
import { verifyCitationsNLI } from '@/lib/agent/nli-verifier';
import { verifySymbolically } from '@/lib/agent/symbolic-verifier';
import { repairFactualDiscrepancies } from '@/lib/agent/fact-repair';

const factCheckerMock = factChecker as jest.Mock;
const repairMock = repairCitations as jest.Mock;
const nliMock = verifyCitationsNLI as jest.Mock;
const symMock = verifySymbolically as jest.Mock;
const reviseMock = repairFactualDiscrepancies as jest.Mock;

const PASS_FACT = {
  totalClaims: 4, verified: 4, majorIssues: 0, fatalIssues: 0,
  integrityScore: 92, citance: undefined,
};
const FATAL_FACT = {
  totalClaims: 4, verified: 1, majorIssues: 1, fatalIssues: 2,
  integrityScore: 15, citance: undefined,
};

function makeDeps(html: string) {
  let htmlVersion = 0;
  const stats: Record<string, any> = {};
  return {
    deps: {
      html,
      analysis: {},
      topSources: [],
      readings: [],
      stats,
      label: '[TEST]',
      bumpHtmlArtifact: () => { htmlVersion++; },
      tagEval: <T extends Record<string, any>>(entry: T, artifact: 'analysis' | 'html'): T => {
        entry.evaluatedArtifact = artifact;
        entry.artifactVersion = artifact === 'html' ? htmlVersion : 0;
        return entry;
      },
    },
    stats,
    getHtmlVersion: () => htmlVersion,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  nliMock.mockResolvedValue({ overallIntegrity: 95, supported: 3, flaggedClaims: [] });
  symMock.mockReturnValue({ score: 100, passed: 3, failed: 0, flagged: [] });
  repairMock.mockReturnValue({ html: '<p>sanitized</p>', numbersSanitized: 2 });
  // Default: the fact repairer applies nothing → the legacy sanitize
  // path below is exercised unchanged.
  reviseMock.mockResolvedValue({ html: '<p>unchanged</p>', applied: 0, skipped: 0, skippedReasons: [], costUsd: 0 });
});

describe('verification-block post-sanitize reconciliation', () => {
  it('re-judges factChecker + free html evals on the sanitized artifact', async () => {
    // First fact-checker pass: fatal issues → sanitize mutates html (v0→v1).
    // Second pass on the sanitized html must re-tag the eval at v1.
    factCheckerMock
      .mockResolvedValueOnce(FATAL_FACT)
      .mockResolvedValueOnce({ ...PASS_FACT, fatalIssues: 0, integrityScore: 88 });

    const { deps, stats } = makeDeps('<p>bad numbers 47%</p>');
    const out = await runVerificationBlock(deps);

    expect(out).toBe('<p>sanitized</p>');
    expect(factCheckerMock).toHaveBeenCalledTimes(2);
    // Second call judged the sanitized html, not the dirty one
    expect(factCheckerMock.mock.calls[1][0]).toBe('<p>sanitized</p>');
    expect(stats.factChecker.artifactVersion).toBe(1);
    expect(stats.factChecker.integrityScore).toBe(88);
    // Free verifiers re-tagged on the same artifact version
    expect(stats.symbolicVerifier.artifactVersion).toBe(1);
    expect(stats.citationVerifier.artifactVersion).toBe(1);
    expect(stats.factCheckerResanitize).toMatchObject({ sanitized: 2, integrityBefore: 15, integrityAfter: 88 });
    expect(nliMock).toHaveBeenCalledTimes(2); // initial + post-sanitize
  });

  it('single fact-checker pass when no fatal issues — no sanitize, no recheck', async () => {
    factCheckerMock.mockResolvedValue(PASS_FACT);
    const { deps, stats } = makeDeps('<p>clean</p>');
    await runVerificationBlock(deps);
    expect(factCheckerMock).toHaveBeenCalledTimes(1);
    expect(repairMock).not.toHaveBeenCalled();
    expect(stats.factChecker.artifactVersion).toBe(0);
    expect(stats.factCheckerResanitize).toBeUndefined();
    expect(nliMock).toHaveBeenCalledTimes(1);
  });

  it('sanitize that changes nothing does not bump or recheck', async () => {
    factCheckerMock.mockResolvedValue(FATAL_FACT);
    repairMock.mockReturnValue({ html: '<p>bad numbers 47%</p>', numbersSanitized: 0 });
    const { deps, stats } = makeDeps('<p>bad numbers 47%</p>');
    await runVerificationBlock(deps);
    expect(factCheckerMock).toHaveBeenCalledTimes(1);
    expect(stats.factCheckerFatalFlagged).toBe(true);
    expect(stats.factChecker.artifactVersion).toBe(0);
    expect(stats.factCheckerResanitize).toBeUndefined();
  });

  it('failed recheck leaves the eval stale-tagged — never passes on pre-sanitize verdict', async () => {
    factCheckerMock
      .mockResolvedValueOnce(FATAL_FACT)
      .mockRejectedValueOnce(new Error('LLM down'));
    const { deps, stats, getHtmlVersion } = makeDeps('<p>bad 47%</p>');
    await runVerificationBlock(deps);
    expect(getHtmlVersion()).toBe(1);
    // factChecker still tagged v0 while html is v1 → stale, gate fails closed
    expect(stats.factChecker.artifactVersion).toBe(0);
    expect(stats.factCheckerResanitize).toBeUndefined();
  });
});

describe('fact-check repair before the veto bites', () => {
  const FATAL_RESULTS = Array.from({ length: 11 }, (_, i) => ({
    claim: `claim ${i} says ${10 + i}%`, number: `${10 + i}%`, sourceRef: `SRC-${i + 1}`,
    sourceSays: `source states ${20 + i}%`, discrepancy: 'figure mismatch',
    severity: 'fatal', fix: `correct to ${20 + i}%`,
  }));

  it('fatal pass → anchored repairer runs first, recheck re-tags the bumped artifact', async () => {
    factCheckerMock
      .mockResolvedValueOnce({ ...FATAL_FACT, fatalIssues: 11, results: FATAL_RESULTS })
      .mockResolvedValueOnce({ ...PASS_FACT, fatalIssues: 0, integrityScore: 80 });
    reviseMock.mockResolvedValue({ html: '<p>fixed numbers</p>', applied: 3, skipped: 5, skippedReasons: ['not_found'], costUsd: 0.001 });

    const addCost = jest.fn();
    const { deps, stats } = makeDeps('<p>bad numbers 47%</p>');
    const out = await runVerificationBlock({ ...deps, addCost });

    expect(reviseMock).toHaveBeenCalledTimes(1);
    const arg = reviseMock.mock.calls[0][1] as any[];
    expect(arg).toHaveLength(8); // 11 fatals sliced to 8
    expect(arg[0]).toEqual({
      claim: FATAL_RESULTS[0].claim,
      number: FATAL_RESULTS[0].number,
      sourceRef: FATAL_RESULTS[0].sourceRef,
      sourceSays: FATAL_RESULTS[0].sourceSays,
      fix: FATAL_RESULTS[0].fix,
    });
    expect(addCost).toHaveBeenCalledWith(0.001, 'FACT_REPAIR');
    expect(out).toBe('<p>fixed numbers</p>');
    // Recheck judged the repaired artifact and re-tagged the eval at v1
    expect(factCheckerMock).toHaveBeenCalledTimes(2);
    expect(factCheckerMock.mock.calls[1][0]).toBe('<p>fixed numbers</p>');
    expect(stats.factChecker.artifactVersion).toBe(1);
    expect(stats.factCheckerRepair).toMatchObject({
      fatalBefore: 11, applied: 3, skipped: 5, skippedReasons: ['not_found'], fatalAfter: 0, integrityBefore: 15, integrityAfter: 80,
    });
    // All fatals repaired → the legacy sanitize path does not run
    expect(repairMock).not.toHaveBeenCalled();
    expect(stats.factCheckerResanitize).toBeUndefined();
  });

  it('rev.applied === 0 → no bump, no second fact pass, legacy sanitize decides on original fatals', async () => {
    factCheckerMock.mockResolvedValue({ ...FATAL_FACT, fatalIssues: 2, results: FATAL_RESULTS.slice(0, 2) });
    repairMock.mockReturnValue({ html: '<p>bad numbers 47%</p>', numbersSanitized: 0 });

    const { deps, stats, getHtmlVersion } = makeDeps('<p>bad numbers 47%</p>');
    await runVerificationBlock(deps);

    expect(reviseMock).toHaveBeenCalledTimes(1);
    expect(getHtmlVersion()).toBe(0);
    expect(factCheckerMock).toHaveBeenCalledTimes(1);
    // applied=0 is still recorded — silent failure is what hid this defect.
    expect(stats.factCheckerRepair).toMatchObject({ applied: 0, fatalBefore: 2, fatalAfter: 2 });
    expect(stats.factCheckerFatalFlagged).toBe(true);
  });

  it('isBudgetConstrained → repair skipped, legacy sanitize path unchanged', async () => {
    factCheckerMock
      .mockResolvedValueOnce({ ...FATAL_FACT, fatalIssues: 2, results: FATAL_RESULTS.slice(0, 2) })
      .mockResolvedValueOnce({ ...PASS_FACT, fatalIssues: 0, integrityScore: 88 });

    const { deps, stats } = makeDeps('<p>bad numbers 47%</p>');
    const out = await runVerificationBlock({ ...deps, isBudgetConstrained: () => true });

    expect(reviseMock).not.toHaveBeenCalled();
    expect(out).toBe('<p>sanitized</p>');
    expect(factCheckerMock).toHaveBeenCalledTimes(2); // original + post-sanitize recheck
    expect(stats.factCheckerResanitize).toMatchObject({ sanitized: 2, integrityBefore: 15, integrityAfter: 88 });
  });
});
