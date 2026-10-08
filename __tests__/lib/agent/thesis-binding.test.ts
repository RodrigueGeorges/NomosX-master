/**
 * Thesis-binding regressions (paid-run forensic — the jet-drone run's DA kill
 * shot was "none of the 20 sources supports the central thesis": the analyst
 * composed an ambitious claim exceeding the corpus, and only the end-of-pipe
 * DA caught it). Source-first contract: radar → sources → judged hypotheses
 * → thesis bound to the best-supported hypothesis → adherence verified
 * post-analyst.
 */
import { callLLM } from '@/lib/llm/unified-llm';
import { hypothesisJudge, checkThesisAdherence } from '@/lib/agent/hypothesis-engine';
import { withExecutionSignal } from '@/lib/worker/execution-scope';
import type { Hypothesis } from '@/lib/agent/hypothesis-engine';

jest.mock('@/lib/llm/unified-llm', () => ({ callLLM: jest.fn() }));

const mockedLLM = jest.mocked(callLLM);

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

  it('leaves boundThesis undefined when no hypothesis has support — fail-open to downstream gates', async () => {
    mockedLLM.mockResolvedValueOnce({
      content: JSON.stringify({ verdicts: JUDGE_RESPONSE.verdicts.map(v => ({ ...v, verdict: 'inconclusive', supportingEvidence: [] })) }),
      costUsd: 0,
    } as any);
    const judge = await hypothesisJudge(HYPOTHESES, SOURCES);
    expect(judge.boundThesis).toBeUndefined();
    expect(judge.verdictBlock).not.toContain('THESIS BINDING');
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

  it('degrades open when the LLM fails (non-blocking, per fail-closed-on-gates policy)', async () => {
    mockedLLM.mockRejectedValueOnce(new Error('provider down'));
    const adh = await checkThesisAdherence('anything', HYPOTHESES[1].statement);
    expect(adh.adhered).toBe(true);
    expect(adh.reason).toBe('check unavailable');
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
    const { buildAnalystContext } = await import('@/lib/agent/pipeline-steps/analyst-context');
    const result = await buildAnalystContext({
      query: 'Will jet drones reshape deterrence?',
      topSources: [], readings: [], detectedDomain: 'geopolitics',
      isStrategic: false, isDossier: false,
      topicClassification: { dimensions: [] },
      // >8000 chars forces SARA compression — the exact condition that used
      // to be able to drop the binding silently.
      hypothesisVerdictBlock: `═══ HYPOTHESIS VERDICTS ═══\n${'verdicts and evidence lines. '.repeat(400)}`,
      quant: { evidenceBlock: '' }, quantBridge: { evidenceBlock: '' },
      stats: { thesisBinding: { id: 'H2', statement: HYPOTHESES[1].statement, verdict: 'supported', confidence: 78, supportingSources: 2 } },
      label: '[test]', addCost: () => {},
      ctx: { addFinding: () => {}, skipStep: () => {} },
    } as any);
    expect(result.fullContextBlock).toContain('THESIS BINDING');
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
