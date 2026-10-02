/**
 * Critic-agent regressions (prod forensics — two HELD runs collapsed to
 * groundedness ~38% on well-sourced corpora):
 *
 * 1. Decomposition LLM returns citationTag "[SRC-7]" but leaves sourceIndex
 *    null → claim skipped grounding entirely → "unverifiable" (19/31 observed).
 *    Fixed: deterministic recovery from the tag (+ inline tags in claim text).
 * 2. Multi-cited claims ([SRC-22][SRC-16][SRC-9]) — sourceIndex was scalar;
 *    now sourceIndices carries all cited sources for union verification.
 * 3. Uncited claims counted in the groundedness denominator AND escaped
 *    validateCitations (the `verdict !== 'unverifiable'` guard) — invisible
 *    double-loss. Now excluded from groundedness, flagged as citation issues.
 */
import { callLLM } from '@/lib/llm/unified-llm';
import { decomposeAnalysis, validateCitations, runCritic } from '@/lib/agent/critic-agent';
import type { AtomicClaim } from '@/lib/agent/critic-agent';

jest.mock('@/lib/llm/unified-llm', () => ({ callLLM: jest.fn() }));
jest.mock('@/lib/agent/semantic-engine', () => ({ embedBatchDetailed: jest.fn(async () => ({ embeddings: [], model: 'none' })), cosineSimilarity: jest.fn(() => 0) }));

const mockedLLM = jest.mocked(callLLM);

const SOURCES = [
  { index: 1, title: 'Rail hedging', abstract: 'Malaysia renegotiated rail debt.', fullText: 'Malaysia renegotiated the East Coast Rail Link debt in 2019, reducing costs.' },
  { index: 2, title: 'Sanctions resistance', abstract: 'Iran adapted to sanctions.', fullText: 'Iran adapted to sanctions via regional trade networks and domestic substitution.' },
  { index: 3, title: 'Small state strategy', abstract: 'Small states balance.', fullText: 'Small states balance great powers through institutional hedging strategies.' },
];

describe('decomposeAnalysis — sourceIndex recovery', () => {
  it('recovers sourceIndex from citationTag when the LLM omits it', async () => {
    mockedLLM.mockResolvedValueOnce({
      content: JSON.stringify({ claims: [
        { id: 'c1', text: 'Malaysia renegotiated rail debt in 2019', citationTag: '[SRC-1]', kind: 'fact' },
        { id: 'c2', text: 'Iran adapted via regional trade', citationTag: '[SRC-2]', kind: 'fact' },
      ] }),
      costUsd: 0.001,
    } as any);
    const { claims } = await decomposeAnalysis('some analysis text');
    expect(claims.map(c => c.sourceIndex)).toEqual([1, 2]);
  });

  it('captures every index of multi-cited claims into sourceIndices', async () => {
    mockedLLM.mockResolvedValueOnce({
      content: JSON.stringify({ claims: [
        { id: 'c1', text: 'Small states balance powers [SRC-1][SRC-3]', kind: 'inference' },
      ] }),
      costUsd: 0.001,
    } as any);
    const { claims } = await decomposeAnalysis('text');
    expect(claims[0].sourceIndex).toBe(1);
    expect(claims[0].sourceIndices).toEqual([1, 3]);
  });
});

describe('validateCitations — uncited claims are flagged, not hidden', () => {
  it('flags an unverifiable claim with no citation as missing', () => {
    const claims: AtomicClaim[] = [
      { id: 'c1', text: 'GDP fell 12% in 2020', verdict: 'unverifiable', confidence: 0.2 },
    ];
    const issues = validateCitations(claims, 3);
    expect(issues.some(i => i.claimId === 'c1' && i.issue === 'missing')).toBe(true);
  });

  it('flags out-of-range citations as invalid', () => {
    const claims: AtomicClaim[] = [
      { id: 'c1', text: 'x', citationTag: '[SRC-99]', sourceIndex: 99, verdict: 'unverifiable', confidence: 0.3 },
    ];
    const issues = validateCitations(claims, 3);
    expect(issues.some(i => i.issue === 'invalid')).toBe(true);
  });
});

describe('runCritic — auto-attach + composition verdict', () => {
  it('auto-attaches an uncited claim to a lexically-matching source and grounds it', async () => {
    mockedLLM.mockResolvedValueOnce({
      content: JSON.stringify({ claims: [
        { id: 'c1', text: 'Malaysia renegotiated the East Coast Rail Link debt', citationTag: null, sourceIndex: null, kind: 'fact' },
        { id: 'c2', text: 'Iran adapted via regional trade networks', citationTag: '[SRC-2]', kind: 'fact' },
      ] }),
      costUsd: 0.001,
    } as any);
    // Grounding batches — whichever source the claims land on, support them
    mockedLLM.mockImplementation(async () => ({
      content: JSON.stringify({ results: [
        { id: 'c1', verdict: 'supported', confidence: 0.9 },
        { id: 'c2', verdict: 'supported', confidence: 0.9 },
      ] }),
      costUsd: 0.001,
    } as any));
    const result = await runCritic('text', SOURCES, { skipBias: true, skipContradictions: true });
    // c1 auto-attached to SRC-1 → verified, counted in groundedness
    expect(result.groundedness).toBe(1);
    expect(result.claims.find(c => c.id === 'c1')?.verdict).toBe('supported');
  });

  it('returns repair (not reject) when score<40 but defects are repairable composition', async () => {
    // 20 claims: 5 cited+supported (groundedness 1.0), 15 uncited gibberish
    // (no lexical match → stay unverifiable → 15 'missing' issues → penalty 45).
    // Plus 3 moderate contradiction pairs (−18) → score ~37 → was 'reject',
    // now 'repair' (groundedness 1.0, fatalRate 0, no severe, no high bias).
    const claims = [
      ...Array.from({ length: 5 }, (_, i) => ({ id: `v${i}`, text: `Malaysia renegotiated rail debt ${i}`, citationTag: '[SRC-1]', kind: 'fact' })),
      ...Array.from({ length: 15 }, (_, i) => ({ id: `u${i}`, text: `zqxwv flibberty unreleased factorization ${i}`, citationTag: null, sourceIndex: null, kind: 'fact' })),
    ];
    mockedLLM.mockResolvedValueOnce({ content: JSON.stringify({ claims }), costUsd: 0.001 } as any);
    // Route all subsequent calls by prompt content (order: grounding → rescue → contradictions → repair)
    mockedLLM.mockImplementation(async (args: any) => {
      const c: string = args.messages?.[0]?.content ?? '';
      if (c.includes('BEST-matching source')) {
        return { content: JSON.stringify({ results: [] }), costUsd: 0.001 } as any; // rescue: none
      }
      if (c.includes('Identify contradictions')) {
        return { content: JSON.stringify({ contradictions: [
          { claim1Id: 'v0', claim2Id: 'v1', claim1Text: 'a', claim2Text: 'b', explanation: 'x', severity: 'moderate' },
          { claim1Id: 'v1', claim2Id: 'v2', claim1Text: 'a', claim2Text: 'b', explanation: 'x', severity: 'moderate' },
          { claim1Id: 'v2', claim2Id: 'v3', claim1Text: 'a', claim2Text: 'b', explanation: 'x', severity: 'moderate' },
        ] }), costUsd: 0.001 } as any;
      }
      if (c.includes('REPAIR') || c.includes('repair')) {
        return { content: JSON.stringify({ repairInstructions: 'fix citations', repairTargetClaims: [] }), costUsd: 0.001 } as any;
      }
      // grounding batch — support every claim id in the payload
      const ids = [...c.matchAll(/"id":\s*"([^"]+)"/g)].map(m => m[1]);
      return { content: JSON.stringify({ results: ids.map(id => ({ id, verdict: 'supported', confidence: 0.9 })) }), costUsd: 0.001 } as any;
    });

    const result = await runCritic('text', SOURCES, { skipBias: true, skipContradictions: false });
    expect(result.overallScore).toBeLessThan(40);
    expect(result.groundedness).toBe(1);
    expect(result.verdict).toBe('repair'); // composition-based, not score-band
  });
});

describe('runCritic — groundedness denominator excludes never-cited claims', () => {
  it('uncited claims surface as citation issues, not grounding misses', async () => {
    // Call 1: decomposition — 2 cited claims + 1 uncited
    mockedLLM.mockResolvedValueOnce({
      content: JSON.stringify({ claims: [
        { id: 'c1', text: 'Malaysia renegotiated rail debt in 2019', citationTag: '[SRC-1]', kind: 'fact' },
        { id: 'c2', text: 'Iran adapted via regional trade networks', citationTag: '[SRC-2]', kind: 'fact' },
        { id: 'c3', text: 'This pattern will intensify over the decade', citationTag: null, sourceIndex: null, kind: 'projection' },
      ] }),
      costUsd: 0.001,
    } as any);
    // Calls 2+3: grounding batches — source 1 supports c1, source 2 supports c2
    const grounding = (id: string) => ({ content: JSON.stringify({ results: [{ id, verdict: 'supported', confidence: 0.9 }] }), costUsd: 0.001 } as any);
    mockedLLM
      .mockImplementationOnce(async (args: any) => grounding(args.messages[0].content.includes('c1') ? 'c1' : 'c2'))
      .mockImplementationOnce(async () => grounding('c2'));

    const result = await runCritic('analysis text with claims', SOURCES, { skipBias: true, skipContradictions: true });
    // c3 uncited → excluded from denominator → groundedness = 2/2 = 1.0
    // (previously: 2/3 = 0.67 — the uncited claim silently sank the score)
    expect(result.groundedness).toBe(1);
    expect(result.citationIssues.some(i => i.claimId === 'c3' && i.issue === 'missing')).toBe(true);
  });
});
