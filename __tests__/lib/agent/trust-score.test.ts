/**
 * Canonical trust score — single arithmetic site shared by evaluators-trust
 * and the quality-loop re-score. Regression: the loop's blend omitted the
 * criticPanel/editorial-floor vetoes and used different weights, so a
 * panel-vetoed artifact could be re-inflated past its cap post-repair.
 */
import { computeTrustScore, countDistinctCitedSources } from '@/lib/agent/pipeline-steps/trust-score';

const HEALTHY = {
  citationCoverage: 0.9, groundedness: 0.85, factIntegrity: 90, nliIntegrity: 85,
  sourceCheckIntegrity: 90, diversityScore: 90, avgQuality: 75, criticScore: 70,
};

describe('computeTrustScore — canonical blend', () => {
  it('produces a high score for a healthy artifact', () => {
    const { score, vetoes } = computeTrustScore(HEALTHY);
    expect(score).toBeGreaterThanOrEqual(70);
    expect(vetoes).toHaveLength(0);
  });

  it('weights groundedness over citation volume (P1-D rebalance)', () => {
    // Equal −0.3 deltas: groundedness (22w) must cost more than coverage (15w).
    const minusCoverage = computeTrustScore({ ...HEALTHY, citationCoverage: 0.6 });
    const minusGrounding = computeTrustScore({ ...HEALTHY, groundedness: 0.55 });
    expect(minusCoverage.score).toBeGreaterThan(minusGrounding.score);
  });

  it('retraction caps at 50 even on a healthy blend', () => {
    const { score, vetoes } = computeTrustScore(HEALTHY, { retracted: 2 });
    expect(score).toBeLessThanOrEqual(50);
    expect(vetoes.some(v => v.includes('retraction'))).toBe(true);
  });

  it('criticPanel veto caps at 55 — the path the old loop bypassed', () => {
    const { score } = computeTrustScore(HEALTHY, { criticPanelVeto: true, criticPanelVetoReasons: ['mustFix: unresolved contradiction'] });
    expect(score).toBeLessThanOrEqual(55);
  });

  it('editorial floor caps at 60 for panel editorial ≤ 4', () => {
    const { score } = computeTrustScore(HEALTHY, { editorialScore: 3 });
    expect(score).toBeLessThanOrEqual(60);
    // 0 / missing is not a floor trigger (no panel editorial dimension).
    expect(computeTrustScore(HEALTHY, { editorialScore: 0 }).score).toBeGreaterThan(60);
  });

  it('critic reject verdict caps at 50; hard veto (<10) caps at 40', () => {
    expect(computeTrustScore(HEALTHY, { criticVerdict: 'reject' }).score).toBeLessThanOrEqual(50);
    expect(computeTrustScore({ ...HEALTHY, criticScore: 5 }).score).toBeLessThanOrEqual(40);
  });

  it('quality floor lifts a decent artifact to 60 but grounding veto still caps', () => {
    const floored = computeTrustScore({ ...HEALTHY, groundedness: 0.5, criticScore: null, avgQuality: 85 });
    expect(floored.score).toBeGreaterThanOrEqual(60);
    const vetoed = computeTrustScore({ ...HEALTHY, groundedness: 0.10, criticScore: null, avgQuality: 85 });
    expect(vetoed.score).toBeLessThanOrEqual(45);
  });
});

describe('fact-integrity veto — fatal discrepancies must cap, not just weigh 12pts', () => {
  it('integrity 25% + 11 fatal discrepancies caps at 55 (live regression: shipped at 82)', () => {
    const { score, vetoes } = computeTrustScore({ ...HEALTHY, factIntegrity: 25 }, { factFatal: 11 });
    expect(score).toBeLessThanOrEqual(55);
    expect(vetoes.some(v => v.includes('fact integrity veto'))).toBe(true);
  });

  it('no fact veto when factFatal is 0 even at low integrity', () => {
    const { vetoes } = computeTrustScore({ ...HEALTHY, factIntegrity: 25 }, { factFatal: 0 });
    expect(vetoes.some(v => v.includes('fact integrity veto'))).toBe(false);
  });

  it('no fact veto when integrity ≥ 50 despite fatals', () => {
    const { vetoes } = computeTrustScore({ ...HEALTHY, factIntegrity: 60 }, { factFatal: 2 });
    expect(vetoes.some(v => v.includes('fact integrity veto'))).toBe(false);
  });
});

describe('countDistinctCitedSources', () => {
  it('counts SRC, evidence and ref forms without double-counting', () => {
    const html = '<p>[SRC-3] claim <a href="#ref-3">3</a> <sup data-evidence="E7">7</sup></p>';
    expect(countDistinctCitedSources(html)).toBe(2);
  });
});
