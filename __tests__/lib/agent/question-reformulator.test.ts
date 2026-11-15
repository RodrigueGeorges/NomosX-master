/**
 * Evidence-bounded question reformulation — held-retry last resort.
 * The 1.5°C memo defect: two HELD attempts at trust 40; the DA kill shot
 * identified a framing/category error retrieval cannot fix. The reformulator
 * proposes ONE narrower on-topic question; deterministic validation decides.
 */

jest.mock('@/lib/llm/unified-llm', () => ({
  callLLM: jest.fn(),
}));

import { callLLM } from '@/lib/llm/unified-llm';
import {
  shouldAttemptQuestionReformulation,
  reformulationOnTopic,
  reformulateHeldQuestion,
} from '@/lib/agent/question-reformulator';

const mockCall = callLLM as jest.Mock;

const ORIGINAL = 'What are the strategic implications of nations abandoning the 1.5°C climate target, and how should policymakers adapt to this new reality?';
const EVIDENCE_QUERIES = [
  'CMIP6 climate model projections for global temperature increase under current NDCs',
  'geopolitical consequences of climate impacts under 2.5C to 3C warming scenarios',
];
const FEEDBACK = 'DA kill shot: category error — political abandonment treated as physical forcing; NDC trajectory already projects ~2.5°C+ [cascade_extrapolation] [invalid_analogy]';

beforeEach(() => mockCall.mockReset());

describe('shouldAttemptQuestionReformulation', () => {
  it('attempts on deep trust failure + adversarial signal + evidence plan', () => {
    const d = shouldAttemptQuestionReformulation({ lastTrust: 40, feedback: FEEDBACK, evidenceQueries: EVIDENCE_QUERIES });
    expect(d.attempt).toBe(true);
  });

  it('refuses without evidence queries — nothing to bound against', () => {
    expect(shouldAttemptQuestionReformulation({ lastTrust: 40, feedback: FEEDBACK, evidenceQueries: [] }).attempt).toBe(false);
    expect(shouldAttemptQuestionReformulation({ lastTrust: 40, feedback: FEEDBACK }).attempt).toBe(false);
  });

  it('refuses outside the deep-failure band — ordinary holds keep the question', () => {
    expect(shouldAttemptQuestionReformulation({ lastTrust: 62, feedback: FEEDBACK, evidenceQueries: EVIDENCE_QUERIES }).attempt).toBe(false);
  });

  it('refuses when the hold has no adversarial/framing signal', () => {
    const d = shouldAttemptQuestionReformulation({ lastTrust: 40, feedback: 'trust_score below bar; quality_score below bar', evidenceQueries: EVIDENCE_QUERIES });
    expect(d.attempt).toBe(false);
  });
});

describe('reformulationOnTopic', () => {
  it('accepts a narrowed question retaining anchor content', () => {
    const narrowed = 'What does the evidenced ~2.5°C+ warming trajectory under current NDCs imply for climate adaptation policy?';
    expect(reformulationOnTopic(ORIGINAL, narrowed, EVIDENCE_QUERIES)).toBe(true);
  });

  it('rejects drift to a different topic', () => {
    const offTopic = 'How will central bank digital currencies reshape cross-border payments by 2030?';
    expect(reformulationOnTopic(ORIGINAL, offTopic, EVIDENCE_QUERIES)).toBe(false);
  });

  it('rejects a candidate with no surviving original anchor', () => {
    const noAnchor = 'What do integrated assessment models project for agricultural yields under high-emission scenarios?';
    expect(reformulationOnTopic(ORIGINAL, noAnchor, EVIDENCE_QUERIES)).toBe(false);
  });
});

describe('reformulateHeldQuestion', () => {
  const llmJson = (q: string, r = 'drops the presupposition') =>
    JSON.stringify({ question: q, rationale: r });

  it('returns the validated narrowed question', async () => {
    mockCall.mockResolvedValue({
      content: llmJson('What does the evidenced ~2.5°C+ warming trajectory under current NDCs imply for climate adaptation policy?'),
    });
    const out = await reformulateHeldQuestion({ originalQuestion: ORIGINAL, feedback: FEEDBACK, evidenceQueries: EVIDENCE_QUERIES });
    expect(out?.question).toContain('NDCs');
    expect(mockCall).toHaveBeenCalledWith(expect.objectContaining({ task: 'query_reformulation', jsonMode: true }));
  });

  it('rejects an identical rewrite', async () => {
    mockCall.mockResolvedValue({ content: llmJson(ORIGINAL) });
    expect(await reformulateHeldQuestion({ originalQuestion: ORIGINAL, feedback: FEEDBACK, evidenceQueries: EVIDENCE_QUERIES })).toBeNull();
  });

  it('rejects off-topic drift even when the LLM proposes it', async () => {
    mockCall.mockResolvedValue({ content: llmJson('How will semiconductor export controls reshape Taiwan Strait stability?') });
    expect(await reformulateHeldQuestion({ originalQuestion: ORIGINAL, feedback: FEEDBACK, evidenceQueries: EVIDENCE_QUERIES })).toBeNull();
  });

  it('rejects malformed output and non-questions', async () => {
    mockCall.mockResolvedValue({ content: 'not json at all' });
    expect(await reformulateHeldQuestion({ originalQuestion: ORIGINAL, feedback: FEEDBACK, evidenceQueries: EVIDENCE_QUERIES })).toBeNull();
    mockCall.mockResolvedValue({ content: llmJson('A statement without a question mark about climate policy') });
    expect(await reformulateHeldQuestion({ originalQuestion: ORIGINAL, feedback: FEEDBACK, evidenceQueries: EVIDENCE_QUERIES })).toBeNull();
  });

  it('never throws — LLM failure degrades to null', async () => {
    mockCall.mockRejectedValue(new Error('provider down'));
    expect(await reformulateHeldQuestion({ originalQuestion: ORIGINAL, feedback: FEEDBACK, evidenceQueries: EVIDENCE_QUERIES })).toBeNull();
  });
});
