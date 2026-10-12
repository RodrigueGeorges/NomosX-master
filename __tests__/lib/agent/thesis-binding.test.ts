/**
 * Thesis-binding regressions (paid-run forensic — the jet-drone run's DA kill
 * shot was "none of the 20 sources supports the central thesis": the analyst
 * composed an ambitious claim exceeding the corpus, and only the end-of-pipe
 * DA caught it). Source-first contract: radar → sources → judged hypotheses
 * → thesis bound to the best-supported hypothesis → adherence verified
 * post-analyst.
 */
import { callLLM } from '@/lib/llm/unified-llm';
import { hypothesisJudge, checkThesisAdherence, framingAgent } from '@/lib/agent/hypothesis-engine';
import * as sara from '@/lib/agent/sara-compression';
import { withExecutionSignal } from '@/lib/worker/execution-scope';
import type { Hypothesis } from '@/lib/agent/hypothesis-engine';

jest.mock('@/lib/llm/unified-llm', () => ({ callLLM: jest.fn() }));
jest.mock('@/lib/agent/sara-compression', () => {
  const actual = jest.requireActual('@/lib/agent/sara-compression');
  return { ...actual, saraCompress: jest.fn(actual.saraCompress) };
});
jest.mock('@/lib/agent/agent-memory', () => ({ buildMemoryInjection: jest.fn(async () => ({ topLessons: [] })) }));
jest.mock('@/lib/agent/knowledge-infrastructure', () => ({ getRelevantGuidelines: jest.fn(async () => []) }));
jest.mock('@/lib/agent/positioning-agent', () => ({ buildPositioningBrief: jest.fn(async () => null) }));
jest.mock('@/lib/agent/conflict-aware', () => ({ detectSourceConflicts: jest.fn(async () => ({ conflictCount: 0, consensusRate: 1, totalPairsChecked: 0 })) }));

const mockedLLM = jest.mocked(callLLM);
beforeEach(() => mockedLLM.mockReset());
afterEach(() => jest.restoreAllMocks());

const HYPOTHESES: Hypothesis[] = [
  { id: 'H1', statement: 'Jet-powered drones reshape deterrence in Eastern Europe', rationale: 'core claim', evidenceNeeded: ['deployment data'] },
  { id: 'H2', statement: 'Ukraine is producing jet drones at industrial scale', rationale: 'capacity claim', evidenceNeeded: ['production figures'] },
  { id: 'H3', statement: 'Export controls failed to contain chip flows', rationale: 'off-topic', evidenceNeeded: ['trade data'] },
];

const SOURCES = [
  { title: 'Ukraine drone production', provider: 'openalex', year: 2024, abstract: 'Ukraine scaled drone production.' },
  { title: 'Jet drone strikes', provider: 'crossref', year: 2024, abstract: 'Jet-powered drone strikes documented.' },
];

const JUDGE_RESPONSE = {
  verdicts: [
    { id: 'H1', statement: HYPOTHESES[0].statement, verdict: 'inconclusive', confidence: 40, supportingEvidence: [], contraryEvidence: ['[SRC-2] narrow focus'], reasoning: 'no direct support' },
    { id: 'H2', statement: HYPOTHESES[1].statement, verdict: 'supported', confidence: 78, supportingEvidence: ['[SRC-1] production scaled', '[SRC-2] strikes documented'], contraryEvidence: [], reasoning: 'two independent sources' },
    { id: 'H3', statement: HYPOTHESES[2].statement, verdict: 'refuted', confidence: 60, supportingEvidence: [], contraryEvidence: ['[SRC-1] unrelated corpus'], reasoning: 'off-topic' },
  ],
};

describe('hypothesisJudge — bound thesis selection (source-first)', () => {
  it('binds the best-supported hypothesis, not the most ambitious', async () => {
    mockedLLM.mockResolvedValueOnce({ content: JSON.stringify(JUDGE_RESPONSE), costUsd: 0.001 } as any);
    const judge = await hypothesisJudge(HYPOTHESES, SOURCES);
    expect(judge.boundThesis?.id).toBe('H2');
    expect(judge.boundThesis?.verdict).toBe('supported');
    expect(judge.boundThesis?.supportingEvidence.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps the binding OUT of the compressible verdict block — single injection is post-SARA', async () => {
    mockedLLM.mockResolvedValueOnce({ content: JSON.stringify(JUDGE_RESPONSE), costUsd: 0 } as any);
    const judge = await hypothesisJudge(HYPOTHESES, SOURCES);
    // Efficiency contract: the binding lives once, in the post-SARA injection
    // from stats.thesisBinding — duplicating it inside the compressible block
    // wastes ~350 chars on every analyst pass.
    expect(judge.verdictBlock).not.toContain('THESIS BINDING');
    expect(judge.verdictBlock).toContain('HYPOTHESIS VERDICTS');
    expect(judge.boundThesis?.statement).toBe(HYPOTHESES[1].statement);
  });

  it('marks thesisAbsent when verdicts AND corpus derivation both find nothing — early refusal signal', async () => {
    mockedLLM.mockResolvedValueOnce({
      content: JSON.stringify({ verdicts: JUDGE_RESPONSE.verdicts.map(v => ({ ...v, verdict: 'inconclusive', supportingEvidence: [] })) }),
      costUsd: 0,
    } as any);
    // Derivation call — corpus explicitly supports nothing defensible.
    mockedLLM.mockResolvedValueOnce({
      content: JSON.stringify({ defensible: false, claim: '', supportingEvidence: [], contraryEvidence: [], confidence: 10, reasoning: 'thin corpus' }),
      costUsd: 0.001,
    } as any);
    const judge = await hypothesisJudge(HYPOTHESES, SOURCES);
    expect(judge.boundThesis).toBeUndefined();
    expect(judge.thesisAbsent).toBe(true);
    expect(judge.costUsd).toBeCloseTo(0.001);
  });

  it('binds a corpus-derived thesis when registered hypotheses fail but the corpus yields a claim', async () => {
    mockedLLM.mockResolvedValueOnce({
      content: JSON.stringify({ verdicts: JUDGE_RESPONSE.verdicts.map(v => ({ ...v, verdict: 'inconclusive', supportingEvidence: [] })) }),
      costUsd: 0,
    } as any);
    mockedLLM.mockResolvedValueOnce({
      content: JSON.stringify({ defensible: true, claim: 'Norway and Finland are deepening Arctic security coordination', supportingEvidence: ['[SRC-1] joint exercises', '[SRC-2] bilateral pact'], contraryEvidence: [], confidence: 70, reasoning: 'two independent sources converge' }),
      costUsd: 0.0008,
    } as any);
    const judge = await hypothesisJudge(HYPOTHESES, SOURCES);
    expect(judge.boundThesis?.id).toBe('T1');
    expect(judge.thesisOrigin).toBe('corpus_derived');
    expect(judge.boundThesis?.supportingEvidence.length).toBe(2);
    expect(judge.thesisAbsent).toBe(false);
  });

  it('ignores a winning verdict on an unregistered id — post-hoc hypotheses cannot be bound', async () => {
    mockedLLM.mockResolvedValueOnce({
      content: JSON.stringify({ verdicts: [
        ...JUDGE_RESPONSE.verdicts,
        { id: 'H9', statement: 'invented hypothesis the LLM preferred', verdict: 'supported', confidence: 95, supportingEvidence: ['[SRC-1] x'], contraryEvidence: [], reasoning: 'not pre-registered' },
      ] }),
      costUsd: 0,
    } as any);
    const judge = await hypothesisJudge(HYPOTHESES, SOURCES);
    // H9 (95×2=190) outranks H2 (78×2=156) — but H9 was never posed by framing,
    // so it must not bind. The registered winner H2 still does.
    expect(judge.boundThesis?.id).toBe('H2');
  });

  it('binds the ORIGINAL registered statement, not the judge paraphrase', async () => {
    mockedLLM.mockResolvedValueOnce({
      content: JSON.stringify({ verdicts: [
        { ...JUDGE_RESPONSE.verdicts[1], statement: 'paraphrased narrower version by the judge' },
      ] }),
      costUsd: 0,
    } as any);
    const judge = await hypothesisJudge(HYPOTHESES, SOURCES);
    expect(judge.boundThesis?.statement).toBe(HYPOTHESES[1].statement);
  });
});

describe('thesis evidence integrity', () => {
  const derived = { defensible: true, claim: 'A narrower documented production trend', supportingEvidence: ['[SRC-1] production', '[SRC-2] deployment'], confidence: 70 };

  it('narrows partial support through corpus derivation instead of binding the full hypothesis', async () => {
    mockedLLM.mockResolvedValueOnce({ content: JSON.stringify({ verdicts: [{ ...JUDGE_RESPONSE.verdicts[1], verdict: 'partially_supported' }] }), costUsd: 0.01 } as any);
    mockedLLM.mockResolvedValueOnce({ content: JSON.stringify(derived), costUsd: 0.02 } as any);
    const result = await hypothesisJudge(HYPOTHESES, SOURCES);
    expect(result.boundThesis?.statement).toBe(derived.claim);
    expect(result.thesisOrigin).toBe('corpus_derived');
    expect(result.costUsd).toBeCloseTo(0.03);
  });

  it.each([
    ['duplicate citation', ['[SRC-1] first claim', '[SRC-1] second claim']],
    ['invented citation', ['[SRC-1] first claim', '[SRC-99] second claim']],
    ['invented citation alongside real citations', ['[SRC-1] first', '[SRC-2] second', '[SRC-99] invented']],
    ['uncited assertions', ['production increased', 'deployment increased']],
  ])('does not bind registered support based on %s', async (_name, evidence) => {
    mockedLLM.mockResolvedValueOnce({ content: JSON.stringify({ verdicts: [{ ...JUDGE_RESPONSE.verdicts[1], supportingEvidence: evidence }] }), costUsd: 0.01 } as any);
    mockedLLM.mockResolvedValueOnce({ content: JSON.stringify({ defensible: false }), costUsd: 0.02 } as any);
    const result = await hypothesisJudge(HYPOTHESES, SOURCES);
    expect(result.boundThesis).toBeUndefined();
    expect(result.thesisAbsent).toBe(true);
  });

  it('accepts empirical documents outside the top-three load-bearing rank tags', async () => {
    mockedLLM.mockResolvedValueOnce({ content: JSON.stringify(JUDGE_RESPONSE), costUsd: 0 } as any);
    const result = await hypothesisJudge(HYPOTHESES, SOURCES.map(s => ({ ...s, loadBearing: false })));
    expect(result.boundThesis?.id).toBe('H2');
    expect(result.boundThesis?.supportingSourceCount).toBe(2);
  });

  it('does not treat a synthetic foundational reference as empirical support', async () => {
    mockedLLM.mockResolvedValueOnce({ content: JSON.stringify(JUDGE_RESPONSE), costUsd: 0 } as any);
    mockedLLM.mockResolvedValueOnce({ content: JSON.stringify({ defensible: false }), costUsd: 0 } as any);
    const result = await hypothesisJudge(HYPOTHESES, [SOURCES[0], { ...SOURCES[1], provider: 'foundational' }]);
    expect(result.boundThesis).toBeUndefined();
  });

  it('does not count the same document indexed by two providers twice', async () => {
    mockedLLM.mockResolvedValueOnce({ content: JSON.stringify(JUDGE_RESPONSE), costUsd: 0 } as any);
    mockedLLM.mockResolvedValueOnce({ content: JSON.stringify({ defensible: false }), costUsd: 0 } as any);
    const sources = SOURCES.map(s => ({ ...s, doi: '10.1000/same-document' }));
    expect((await hypothesisJudge(HYPOTHESES, sources)).boundThesis).toBeUndefined();
  });

  it.each([
    {},
    { ...derived, defensible: 'true' },
    { ...derived, supportingEvidence: ['[SRC-1] a', '[SRC-1] b'] },
    { ...derived, supportingEvidence: ['[SRC-1] a', '[SRC-26] b'] },
  ])('keeps invalid derivation distinct from an explicit absence of a thesis: %j', async response => {
    mockedLLM.mockResolvedValueOnce({ content: JSON.stringify({ verdicts: [] }), costUsd: 0.01 } as any);
    mockedLLM.mockResolvedValueOnce({ content: JSON.stringify(response), costUsd: 0.02 } as any);
    const result = await hypothesisJudge(HYPOTHESES, SOURCES);
    expect(result.boundThesis).toBeUndefined();
    expect(result.thesisAbsent).not.toBe(true);
    expect(result).toMatchObject({ thesisUnavailable: true });
    expect(result.costUsd).toBeCloseTo(0.03);
  });

  it('derives from the corpus even when framing has no hypotheses', async () => {
    mockedLLM.mockResolvedValueOnce({ content: JSON.stringify(derived), costUsd: 0.02 } as any);
    const result = await hypothesisJudge([], SOURCES);
    expect(result.thesisOrigin).toBe('corpus_derived');
    expect(mockedLLM).toHaveBeenCalledTimes(1);
  });

  it('matches readings by sourceId, not position, and includes results and limitations', async () => {
    mockedLLM.mockResolvedValueOnce({ content: JSON.stringify(JUDGE_RESPONSE), costUsd: 0 } as any);
    const sources = SOURCES.map((s, i) => ({ ...s, id: `s${i}` }));
    await hypothesisJudge(HYPOTHESES, sources, [
      { sourceId: 's1', claims: ['SECOND DOCUMENT'], results: ['second result'] },
      { sourceId: 's0', claims: ['FIRST DOCUMENT'], results: ['first result'], limitations: ['no causal identification'] },
    ]);
    const prompt = String(mockedLLM.mock.calls[0][0].messages[1].content);
    const first = prompt.split('[SRC-1]')[1].split('[SRC-2]')[0];
    expect(first).toContain('FIRST DOCUMENT');
    expect(first).toContain('first result');
    expect(first).toContain('no causal identification');
    expect(first).not.toContain('SECOND DOCUMENT');
  });

  it('preserves charged cost when a judge response is malformed', async () => {
    mockedLLM.mockResolvedValueOnce({ content: '{"verdicts": "invalid"}', costUsd: 0.012 } as any);
    const result = await hypothesisJudge(HYPOTHESES, SOURCES);
    expect(result.costUsd).toBeCloseTo(0.012);
    expect(result).toMatchObject({ thesisUnavailable: true });
  });

  it('propagates framing cancellation', async () => {
    const controller = new AbortController();
    mockedLLM.mockImplementationOnce(async () => { controller.abort(); throw new Error('aborted'); });
    await expect(withExecutionSignal(controller.signal, () => framingAgent('question'))).rejects.toThrow();
  });
});

describe('checkThesisAdherence', () => {
  it('accepts a verdict within the bound thesis', async () => {
    mockedLLM.mockResolvedValueOnce({ content: JSON.stringify({ adhered: true, reason: 'same claim, narrower scope' }), costUsd: 0.0005 } as any);
    const adh = await checkThesisAdherence('Ukraine scaled production of jet drones domestically.', HYPOTHESES[1].statement);
    expect(adh.adhered).toBe(true);
  });

  it('rejects a verdict exceeding the bound thesis — the jet-drone DA failure mode', async () => {
    mockedLLM.mockResolvedValueOnce({ content: JSON.stringify({ adhered: false, reason: 'verdict asserts AI integration and NK transfer not in bound claim' }), costUsd: 0 } as any);
    const adh = await checkThesisAdherence('AI-integrated jet drones are reshaping deterrence and flowing to North Korea.', HYPOTHESES[1].statement);
    expect(adh.adhered).toBe(false);
  });

  it('reports an unavailable evaluation instead of successful adherence on provider failure', async () => {
    mockedLLM.mockRejectedValueOnce(new Error('provider down'));
    const adh = await checkThesisAdherence('anything', HYPOTHESES[1].statement);
    expect(adh.adhered).toBeUndefined();
    expect(adh).toMatchObject({ evaluationComplete: false });
    expect(adh.reason).toBe('check unavailable');
  });

  it.each([{}, { adhered: 'true' }])('rejects a malformed adherence verdict: %j', async response => {
    mockedLLM.mockResolvedValueOnce({ content: JSON.stringify(response), costUsd: 0.003 } as any);
    const adh = await checkThesisAdherence('anything', HYPOTHESES[1].statement);
    expect(adh.adhered).toBeUndefined();
    expect(adh).toMatchObject({ evaluationComplete: false, costUsd: 0.003 });
  });

  it('propagates a scope abort instead of returning "adhered" — cancelled work must die', async () => {
    const controller = new AbortController();
    mockedLLM.mockImplementationOnce(async () => {
      controller.abort();
      throw new Error('fetch aborted');
    });
    await expect(
      withExecutionSignal(controller.signal, () => checkThesisAdherence('anything', HYPOTHESES[1].statement)),
    ).rejects.toThrow();
  });

  it('propagates a scope abort in hypothesisJudge instead of degrading to unbound', async () => {
    const controller = new AbortController();
    mockedLLM.mockImplementationOnce(async () => {
      controller.abort();
      throw new Error('fetch aborted');
    });
    await expect(
      withExecutionSignal(controller.signal, () => hypothesisJudge(HYPOTHESES, SOURCES)),
    ).rejects.toThrow();
  });
});

describe('buildAnalystContext — binding survives SARA compression (integration)', () => {
  it('THESIS BINDING is present in fullContextBlock even when SARA compresses the context', async () => {
    const compress = jest.spyOn(sara, 'saraCompress');
    const { buildAnalystContext } = await import('@/lib/agent/pipeline-steps/analyst-context');
    const result = await buildAnalystContext({
      query: 'Will jet drones reshape deterrence?',
      topSources: [], readings: [], detectedDomain: 'geopolitics',
      isStrategic: false, isDossier: false,
      topicClassification: { dimensions: [] },
      // >8000 chars forces SARA compression — the exact condition that used
      // to be able to drop the binding silently.
      hypothesisVerdictBlock: `═══ HYPOTHESIS VERDICTS ═══\n${'verdicts and evidence lines. '.repeat(1600)}`,
      quant: { evidenceBlock: '' }, quantBridge: { evidenceBlock: '' },
      stats: { thesisBinding: { id: 'H2', statement: HYPOTHESES[1].statement, verdict: 'supported', confidence: 78, supportingSources: 2 } },
      label: '[test]', addCost: () => {},
      ctx: { addFinding: () => {}, skipStep: () => {} },
    } as any);
    expect(compress).toHaveBeenCalled();
    expect(compress.mock.results[0].value.compressionRatio).toBeLessThan(0.85);
    expect(result.fullContextBlock?.match(/THESIS BINDING/g)).toHaveLength(1);
    expect(result.fullContextBlock).toContain(HYPOTHESES[1].statement);
    expect(result.fullContextBlock).toContain('NARROWER');
  }, 30000);

  it('no binding block is injected when stats.thesisBinding is absent', async () => {
    const { buildAnalystContext } = await import('@/lib/agent/pipeline-steps/analyst-context');
    const result = await buildAnalystContext({
      query: 'q', topSources: [], readings: [], detectedDomain: 'geopolitics',
      isStrategic: false, isDossier: false, topicClassification: { dimensions: [] },
      hypothesisVerdictBlock: '', quant: { evidenceBlock: '' }, quantBridge: { evidenceBlock: '' },
      stats: {}, label: '[test]', addCost: () => {},
      ctx: { addFinding: () => {}, skipStep: () => {} },
    } as any);
    expect(result.fullContextBlock ?? '').not.toContain('THESIS BINDING');
  }, 30000);
});
