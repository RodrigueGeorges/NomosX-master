import { runDevilsAdvocate } from '@/lib/agent/devils-advocate';
import { callLLM } from '@/lib/llm/unified-llm';
import { withExecutionSignal } from '@/lib/worker/execution-scope';

jest.mock('@/lib/llm/unified-llm', () => ({ callLLM: jest.fn() }));
const llm = jest.mocked(callLLM);
const response = (value: unknown) => ({ content: JSON.stringify(value), costUsd: 0.01 }) as Awaited<ReturnType<typeof callLLM>>;
const clean = { challenges: [], killShot: '', strengths: ['Evidence is bounded'], hostileReview: 'No additional challenge', futureVulnerabilities: [] };
const review = () => runDevilsAdvocate('Research question', 'Evidence-supported analysis', []);

beforeEach(() => {
  llm.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('never interprets unavailable adversarial reviewers as unanimous approval', async () => {
  llm.mockRejectedValue(new Error('provider unavailable'));
  const result = await review();
  expect(result.verdict).not.toBe('publish');
  expect(result.publishabilityScore).toBe(0);
});

it.each([{}, { challenges: 'invalid' }, { challenges: [{ severity: 'unknown' }] }])('fails closed on malformed challenge responses: %j', async value => {
  llm.mockResolvedValue(response(value));
  const result = await review();
  expect(result.verdict).not.toBe('publish');
  expect(result.costUsd).toBeCloseTo(0.03);
});

it('requires both adversarial reviewers even when one has no objections', async () => {
  llm.mockResolvedValueOnce(response(clean)).mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(response({}));
  expect((await review()).publishabilityScore).toBe(0);
});

it('allows a valid completed review with no challenges without requiring the advisory benchmark', async () => {
  llm.mockResolvedValueOnce(response(clean)).mockResolvedValueOnce(response(clean)).mockRejectedValueOnce(new Error('benchmark unavailable'));
  const result = await review();
  expect(result.verdict).toBe('publish');
  expect(result.publishabilityScore).toBe(100);
  expect(result.costUsd).toBeCloseTo(0.02);
});

it('propagates cancellation instead of synthesizing an approval after abort', async () => {
  const controller = new AbortController();
  llm.mockImplementation(async () => {
    controller.abort(new Error('review cancelled'));
    throw controller.signal.reason;
  });
  await expect(withExecutionSignal(controller.signal, review)).rejects.toThrow('review cancelled');
});

describe('objection verification', () => {
  const major = (claim: string) => ({ claim, sourceSection: 'Evidence', challengeType: 'non_evidence', challenge: 'No source supports this.', severity: 'major', counterEvidence: [], alternativeExplanation: '', requiredAction: 'qualify' });
  const note = 'Steel imports fell 12% after the levy took effect [SRC-1]. This is a projection and may not hold beyond 2027. Exporters absorbed most of the cost.';
  const sources = [{ title: 'Customs report', provider: 'eurostat', abstract: 'Customs data show steel imports fell 12% in the two quarters after the levy took effect, according to the registry of declarations filed by importers across the member states.' }];
  const raised = { ...clean, challenges: [major('Steel imports fell 12% after the levy took effect'), major('Exporters absorbed most of the cost')] };
  const byTrace = (verification: unknown) => llm.mockImplementation(async (req: any) => {
    if (req.traceName === 'da_objection_verification') {
      if (verification instanceof Error) throw verification;
      return response(verification);
    }
    return response(req.messages[0].content.includes('epistemic critic') ? raised : clean);
  });

  it('only objections that stand keep counting against the score', async () => {
    byTrace({ verdicts: [{ i: 0, verdict: 'supported' }, { i: 1, verdict: 'stands' }] });
    const result = await runDevilsAdvocate('Q', note, sources);
    expect(result.majorChallenges).toHaveLength(1);
    expect(result.minorChallenges).toHaveLength(1);
    expect(result.publishabilityScore).toBe(90);
    expect(result.challengeVerification).toMatchObject({ checked: 2, downgraded: 1 });
  });

  it('keeps every major when the verifier fails or returns an unknown verdict', async () => {
    byTrace(new Error('verifier down'));
    expect((await runDevilsAdvocate('Q', note, sources)).majorChallenges).toHaveLength(2);
    byTrace({ verdicts: [{ i: 0, verdict: 'looks fine' }, { i: 7, verdict: 'supported' }] });
    expect((await runDevilsAdvocate('Q', note, sources)).majorChallenges).toHaveLength(2);
  });

  it('shows the verifier the passage of the source the claim cites', async () => {
    byTrace({ verdicts: [] });
    await runDevilsAdvocate('Q', note, sources);
    const call = llm.mock.calls.map(c => c[0] as any).find(c => c.traceName === 'da_objection_verification');
    expect(call.task).toBe('fact_check');
    expect(call.messages[1].content).toContain('registry of declarations');
    expect(call.messages[1].content).toContain('QUOTE FOUND IN NOTE: yes');
  });
});
