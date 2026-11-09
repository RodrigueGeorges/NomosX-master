import { deriveEvidenceGapRequests } from '../../../lib/agent/pipeline-steps/evidence-graph-gaps';

const link = (over: Record<string, any>) => ({
  temporalStatus: 'present_fact',
  claim: 'A sufficiently long claim text for the contract threshold of twenty five chars',
  sourceRef: 3,
  ...over,
});

describe('deriveEvidenceGapRequests', () => {
  it('returns empty for missing/non-array causalChain', () => {
    expect(deriveEvidenceGapRequests(null)).toEqual([]);
    expect(deriveEvidenceGapRequests({})).toEqual([]);
    expect(deriveEvidenceGapRequests({ causalChain: 'nope' })).toEqual([]);
  });

  it('collects unsupported present_fact links with claim-derived queries', () => {
    const out = deriveEvidenceGapRequests({
      causalChain: [
        link({ passageVerdict: 'none', unsupported: true }),
        link({ claim: 'Export controls reduce allied semiconductor dependence by 40 percent within five years', sourceRef: 7, unsupported: true }),
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[0].citedSourceRef).toBe(3);
    expect(out[0].query).not.toContain('[SRC-');
    expect(out[1].query).toContain('Export controls');
  });

  it('ignores grounded, weak, non-fact, and short claims', () => {
    const out = deriveEvidenceGapRequests({
      causalChain: [
        link({ passageVerdict: 'grounded' }),
        link({ passageVerdict: 'weak' }),
        link({ temporalStatus: 'mechanism', unsupported: true }),
        link({ claim: 'too short', unsupported: true }),
        link({ passageVerdict: 'none' }), // unsupported flag implied by verdict
      ],
    });
    // only the last link qualifies (passageVerdict 'none' counts as unsupported)
    expect(out).toHaveLength(1);
  });

  it('dedupes normalized claim text and caps at 3', () => {
    const dup = 'Identical unsupported claim about rare earth refining capacity';
    const out = deriveEvidenceGapRequests({
      causalChain: [
        link({ claim: dup, unsupported: true }),
        link({ claim: dup.toUpperCase().replace(/ /g, '  '), unsupported: true }),
        link({ claim: 'Second distinct unsupported claim about grid storage economics today', unsupported: true }),
        link({ claim: 'Third distinct unsupported claim about defence procurement timelines now', unsupported: true }),
        link({ claim: 'Fourth distinct unsupported claim about semiconductor export licence regimes', unsupported: true }),
      ],
    });
    expect(out).toHaveLength(3);
    expect(out.filter(g => g.claim.toLowerCase().includes('identical'))).toHaveLength(1);
  });

  it('truncates queries at a word boundary under 200 chars', () => {
    const longClaim = 'word '.repeat(80).trim();
    const out = deriveEvidenceGapRequests({
      causalChain: [link({ claim: longClaim, unsupported: true })],
    });
    expect(out[0].query.length).toBeLessThanOrEqual(200);
    expect(out[0].query.endsWith(' ')).toBe(false);
  });
});
