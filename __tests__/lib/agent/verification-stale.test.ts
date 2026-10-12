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

import { runVerificationBlock } from '@/lib/agent/pipeline-steps/verification-block';
import { factChecker } from '@/lib/agent/fact-checker';
import { repairCitations } from '@/lib/agent/citation-repair';
import { verifyCitationsNLI } from '@/lib/agent/nli-verifier';
import { verifySymbolically } from '@/lib/agent/symbolic-verifier';

const factCheckerMock = factChecker as jest.Mock;
const repairMock = repairCitations as jest.Mock;
const nliMock = verifyCitationsNLI as jest.Mock;
const symMock = verifySymbolically as jest.Mock;

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
