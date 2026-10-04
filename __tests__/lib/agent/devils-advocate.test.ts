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
