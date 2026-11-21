import { runAllPruningGates } from '@/lib/agent/pruning-gates';

describe('pruning gates leave the verdict wording alone', () => {
  it('keeps hedges the evidence calls for, and keeps sentences grammatical', () => {
    const verdict = 'Export controls could not reverse the trend before 2030, and prices are likely to stay volatile [SRC-1][SRC-2].';
    const analysis: any = {
      verdict,
      causalChain: [
        { id: 1, claim: 'Processing capacity is concentrated', evidence: 'e [SRC-1]', warrant: 'w', temporalStatus: 'present_fact', derivesFrom: null, sourceRef: 1 },
        { id: 2, claim: 'Concentration persists', evidence: 'e [SRC-2]', warrant: 'w', temporalStatus: 'active_mechanism', derivesFrom: 1, sourceRef: 2 },
      ],
    };
    runAllPruningGates(analysis, 10);
    expect(analysis.verdict).toBe(verdict);
  });
});
