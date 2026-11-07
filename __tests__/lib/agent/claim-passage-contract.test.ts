import { applyClaimPassageContract, passageContainment } from '../../../lib/agent/claim-passage-contract';

describe('claim-passage contract', () => {
  const sources = [{ id: 'src-1' }, { id: 'src-2' }, { id: 'src-3' }];
  const readings = [
    {
      sourceId: 'src-1',
      claims: ['Global copper demand reached 28 million tonnes in 2024'],
      results: ['Chilean production fell 4% year over year'],
      limitations: ['Sample covers only listed producers'],
      methods: [],
    },
    {
      sourceId: 'src-2',
      claims: ['Battery-grade lithium prices declined 18%'],
      results: [],
      limitations: [],
      methods: [],
    },
  ];

  it('marks a fact link unsupported when the cited passage does not carry the claim', () => {
    const analysis = {
      causalChain: [
        {
          id: 1,
          claim: 'Antarctic ice shelf calving accelerated by 40% since 2019',
          evidence: 'model output [SRC-1]',
          warrant: 'w',
          temporalStatus: 'present_fact',
          derivesFrom: null,
          sourceRef: 1,
        },
      ],
    };
    const r = applyClaimPassageContract(analysis, sources, readings);
    expect(r.checked).toBe(1);
    expect(r.unsupportedMarked).toBe(1);
    expect(analysis.causalChain[0].unsupported).toBe(true);
    expect(analysis.causalChain[0].passageVerdict).toBe('none');
  });

  it('keeps a fact link grounded when passage words cover the claim', () => {
    const analysis = {
      causalChain: [
        {
          id: 1,
          claim: 'Global copper demand reached 28 million tonnes in 2024',
          evidence: 'survey data [SRC-1]',
          warrant: 'w',
          temporalStatus: 'present_fact',
          derivesFrom: null,
          sourceRef: 1,
        },
      ],
    };
    const r = applyClaimPassageContract(analysis, sources, readings);
    expect(r.unsupportedMarked).toBe(0);
    expect(analysis.causalChain[0].unsupported).toBeUndefined();
    expect(analysis.causalChain[0].passageVerdict).toBe('grounded');
  });

  it('does not contract-check mechanisms or future extrapolations', () => {
    const analysis = {
      causalChain: [
        {
          id: 1,
          claim: 'Grid bottlenecks will force smelter curtailments by 2030',
          evidence: 'inference [SRC-2]',
          warrant: 'w',
          temporalStatus: 'future_extrapolation',
          derivesFrom: null,
          sourceRef: 2,
        },
        {
          id: 2,
          claim: 'Substitution toward aluminium accelerates smelting margins',
          evidence: 'mechanism [SRC-2]',
          warrant: 'w',
          temporalStatus: 'active_mechanism',
          derivesFrom: null,
          sourceRef: 2,
        },
      ],
    };
    const r = applyClaimPassageContract(analysis, sources, readings);
    expect(r.checked).toBe(0);
    expect(analysis.causalChain.every((l: any) => l.passageVerdict === undefined)).toBe(true);
  });

  it('skips links whose cited source has no reading passages', () => {
    const analysis = {
      causalChain: [
        {
          id: 1,
          claim: 'Copper concentrate treatment charges turned negative',
          evidence: 'report [SRC-3]',
          warrant: 'w',
          temporalStatus: 'present_fact',
          derivesFrom: null,
          sourceRef: 3,
        },
      ],
    };
    const r = applyClaimPassageContract(analysis, sources, readings);
    expect(r.checked).toBe(0);
    expect(r.skippedNoReading).toBe(1);
    expect(analysis.causalChain[0].unsupported).toBeUndefined();
  });

  it('passageContainment is symmetric-safe on empty inputs', () => {
    expect(passageContainment('', 'anything')).toBe(0);
    expect(passageContainment('claim words here', '')).toBe(0);
    expect(passageContainment('copper demand tonnes', 'copper demand reached tonnes')).toBeGreaterThan(0.5);
  });
});
