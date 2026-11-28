/**
 * P0-A question verifiers — the pre-spend gate every dispatch candidate
 * must pass. Covers the LLM verdict path AND the deterministic guards that
 * re-verify the verifier's own output (run-11 dispatched knowledge-graph
 * labels as questions and burned $7.05 on substituted theses).
 */

jest.mock('@/lib/llm/unified-llm', () => ({
  callLLM: jest.fn(),
}));

import { callLLM } from '@/lib/llm/unified-llm';
import { extractHorizonDate, verifyDispatchQuestion } from '@/lib/agent/question-verifiers';

const mockCall = callLLM as jest.Mock;

const GOOD = JSON.stringify({
  forecastQuestion: 'Will global renewable capacity reach 50% of total installed capacity by 2030?',
  quality: 80,
  ambiguity: 0.2,
  resolvable: true,
  difficulty: 55,
  antiBiasRisk: false,
  verdict: 'pass',
  motif: '',
});

beforeEach(() => mockCall.mockReset());

it.each([
  ["By June 2026, will France's credit rating change?", '2026-06-30'],
  ['Compared with June 2026, will output rise by Q1 2027?', '2027-03-31'],
  ['By 2027-02-04, will output rise?', '2027-02-04'],
  ['By 2030, will output exceed its June 2026 baseline?', '2030-12-31'],
])('uses the stated resolution horizon: %s', (question, expected) => {
  expect(extractHorizonDate(question, new Date('2026-11-28'))?.toISOString().slice(0, 10)).toBe(expected);
});

describe('verifyDispatchQuestion', () => {
  it('passes a well-formed falsifiable question and returns the forecastQuestion', async () => {
    mockCall.mockResolvedValue(GOOD);
    const v = await verifyDispatchQuestion({
      question: 'Renewable deployment determinants',
      topicTitle: 'Global energy transition',
      signalContext: 'IEA report on capacity additions',
    });
    expect(v.pass).toBe(true);
    expect(v.forecastQuestion).toContain('renewable capacity');
    expect(v.checks.resolvable).toBe(true);
  });

  it('rejects on the LLM verdict with its motif', async () => {
    mockCall.mockResolvedValue(JSON.stringify({
      forecastQuestion: '', quality: 30, ambiguity: 0.8, resolvable: false,
      difficulty: 50, antiBiasRisk: false, verdict: 'reject', motif: 'unresolvable',
    }));
    const v = await verifyDispatchQuestion({ question: 'The future of energy geopolitics and what it means' });
    expect(v.pass).toBe(false);
    expect(v.motif).toBe('unresolvable');
  });

  it('deterministic guard: forecastQuestion without a question mark fails low_quality', async () => {
    mockCall.mockResolvedValue(JSON.stringify({
      forecastQuestion: 'Renewable capacity shares over time', quality: 80, ambiguity: 0.2,
      resolvable: true, difficulty: 55, antiBiasRisk: false, verdict: 'pass', motif: '',
    }));
    const v = await verifyDispatchQuestion({ question: 'Renewable deployment determinants and their drivers' });
    expect(v.pass).toBe(false);
    expect(v.motif).toBe('low_quality');
  });

  it('deterministic guard: anti-bias "trivial no" questions are rejected', async () => {
    mockCall.mockResolvedValue(JSON.stringify({
      forecastQuestion: 'Will country X sign treaty Y on March 3rd 2027?', quality: 70, ambiguity: 0.3,
      resolvable: true, difficulty: 50, antiBiasRisk: true, verdict: 'pass', motif: '',
    }));
    const v = await verifyDispatchQuestion({ question: 'Treaty signing speculation' });
    expect(v.pass).toBe(false);
    expect(v.motif).toBe('anti_bias_trivial_no');
  });

  it('deterministic guard: ambiguous questions rejected even when LLM says pass', async () => {
    // Stage-1 generates an ambiguous question; the motif-guided
    // reformulation then fails (empty forecastQuestion) so the ORIGINAL
    // motif is what gets reported.
    mockCall
      .mockResolvedValueOnce(JSON.stringify({
        forecastQuestion: 'Will things improve soon?', quality: 80, ambiguity: 0.9,
        resolvable: true, difficulty: 55, antiBiasRisk: false, verdict: 'pass', motif: '',
      }))
      .mockResolvedValue('{}');
    const v = await verifyDispatchQuestion({ question: 'Vague topic that somehow passed triage filters' });
    expect(v.pass).toBe(false);
    expect(v.motif).toBe('ambiguous');
  });

  it('recovers via motif-guided reformulation when the first candidate fails a guard', async () => {
    // Call 0: stage-1 generates a stale-horizon question. Call 1: the
    // reformulation returns a fixed future-dated question. Calls 2-3:
    // independent verifier + base-rate both pass.
    const GOOD_VERDICT = JSON.stringify({ verdict: 'pass', resolvable: true, ambiguity: 0.2, trivial: false, motif: '' });
    mockCall
      .mockResolvedValueOnce(JSON.stringify({
        forecastQuestion: 'Will the treaty be signed eventually?', quality: 80, ambiguity: 0.2,
        resolvable: true, difficulty: 55, antiBiasRisk: false, verdict: 'pass', motif: '',
      }))
      .mockResolvedValueOnce(JSON.stringify({
        forecastQuestion: 'Will the treaty be signed by March 2027?',
      }))
      .mockResolvedValueOnce(GOOD_VERDICT)
      .mockResolvedValueOnce(JSON.stringify({ p: 0.45 }));
    const v = await verifyDispatchQuestion({
      question: 'Treaty ratification timeline',
      topicTitle: 'Senate treaty vote',
      signalContext: 'Foreign relations committee schedules markup',
    });
    expect(v.pass).toBe(true);
    expect(v.forecastQuestion).toBe('Will the treaty be signed by March 2027?');
    expect(mockCall.mock.calls.length).toBe(4);
  });

  it('short questions are rejected without an LLM call', async () => {
    const v = await verifyDispatchQuestion({ question: 'too short' });
    expect(v.pass).toBe(false);
    expect(v.motif).toBe('low_quality');
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('verifier infrastructure failure returns verifier_error, never a pass', async () => {
    mockCall.mockRejectedValue(new Error('provider down'));
    const v = await verifyDispatchQuestion({ question: 'A sufficiently long research question about energy markets' });
    expect(v.pass).toBe(false);
    expect(v.motif).toBe('verifier_error');
  });
});
