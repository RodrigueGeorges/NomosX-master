import { checkRequiredElements } from '../../../lib/agent/pipeline-steps/gap-fill';
import { matchCanon } from '../../../lib/agent/canon/canon-matcher';

function baseAnalysis(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    anchoringBasis: 'Base rate from 40 comparable carbon-border episodes since 1990, reference class: trade-exposed manufactures',
    verdict: 'The mechanism is active and decision-makers should monitor quarterly embedded-emissions reports closely.',
    throughLine: 'A causal chain from free allocation phase-out to border adjustment.',
    keyFindings: ['finding one', 'finding two'],
    causalChain: [
      { id: 1, claim: 'Free allocation declines 43.6% by 2030 under the revised ETS', evidence: 'e', warrant: 'w', temporalStatus: 'active_mechanism' },
      { id: 2, claim: 'CBAM covers 50% of embedded emissions in scope by 2027', evidence: 'e', warrant: 'w', temporalStatus: 'future_extrapolation' },
    ],
    rejectedAlternatives: [{ scenario: 'Full exemption for strategic trade partners remains viable', whyRejected: 'No legal basis in the regulation text', residualRisk: 'low' }],
    whatToWatch: {
      signals: ['Quarterly CBAM declaration volumes', 'Free allocation auction prices', 'Third-country exporter complaints'],
      whatWouldChangeMind: 'A suspension clause triggered or free-allocation extension beyond 2030 would reverse the trajectory',
      horizonCheck: 'Revisit by Q3 2027 when first definitive-period data publishes',
    },
    ...overrides,
  };
}

describe('checkRequiredElements — content checks (Lot 3)', () => {
  it('passes a substantive analysis', () => {
    const r = checkRequiredElements(baseAnalysis());
    expect(r.missing).toEqual([]);
    expect(r.present.length).toBe(6);
  });

  it('quantitative_core rejects bare digits and lone zero (run v10 failure)', () => {
    const weak = baseAnalysis({
      verdict: 'Something happens in 2030 with score 0 overall.',
      causalChain: [
        { id: 1, claim: 'Year 2030 approaches', evidence: 'e', warrant: 'w' },
        { id: 2, claim: 'Score is 0', evidence: 'e', warrant: 'w' },
      ],
      keyFindings: [],
    });
    const r = checkRequiredElements(weak);
    expect(r.missing.some(m => m.includes('quantitative core'))).toBe(true);
  });

  it('quantitative_core accepts a real series with units', () => {
    const strong = baseAnalysis({
      causalChain: [
        { id: 1, claim: 'Emissions covered rise 12.4% in 2026 then 28.7% in 2027', evidence: 'e', warrant: 'w' },
        { id: 2, claim: 'Free allocation falls 43.6% by 2030, worth EUR 18bn annually', evidence: 'e', warrant: 'w' },
      ],
    });
    const r = checkRequiredElements(strong);
    expect(r.missing.some(m => m.includes('quantitative core'))).toBe(false);
  });

  it('tipping_points rejects boilerplate rejected alternatives', () => {
    const r = checkRequiredElements(baseAnalysis({ rejectedAlternatives: [{ scenario: 'none' }] }));
    expect(r.missing.some(m => m.includes('tipping points'))).toBe(true);
  });

  it('decision_consequences requires a substantive decision passage', () => {
    const thin = baseAnalysis({
      verdict: 'Uncertain outlook overall.',
      whatToWatch: { signals: [], whatWouldChangeMind: '', horizonCheck: '' },
    });
    const r = checkRequiredElements(thin);
    expect(r.missing.some(m => m.includes('decision-maker'))).toBe(true);
  });
});

describe('matchCanon — relevance gate (Lot 3)', () => {
  it('does not inject domain standing-canon on a CBAM policy question', () => {
    const matches = matchCanon('Will the EU CBAM reduce embedded emissions by 2030?', { topN: 6 });
    const ids = matches.map(m => m.entry.id);
    // Thucydides must never appear on a carbon-border question
    expect(ids).not.toContain('thucydides-peloponnesian-war');
    // No backfill-only entries (score 1, 'domain-canon') without a strong real match
    const backfilled = matches.filter(m => m.matchedConcepts.includes('domain-canon'));
    expect(backfilled.length).toBe(0);
  });

  it('still returns real concept matches when they exist', () => {
    const matches = matchCanon('How does carbon pricing affect inequality and labor markets?', { topN: 6 });
    expect(matches.length).toBeGreaterThan(0);
  });
});
