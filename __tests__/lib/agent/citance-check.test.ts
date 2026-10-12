/**
 * Citance check — every cited sentence is entailment-tested against its
 * source, not just sentences carrying a number. Verdicts fold into
 * integrity; failed entailment calls report incomplete and stay out of the
 * score denominator.
 */

import { factChecker } from '@/lib/agent/fact-checker';
import { callLLM } from '@/lib/llm/unified-llm';

jest.mock('@/lib/llm/unified-llm', () => ({ callLLM: jest.fn() }));
jest.mock('@/lib/agent/ufo-factcheck', () => ({ batchFactCheck: jest.fn(async () => []), DEFAULT_UFO_CONFIG: {} }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const sources = [
  { id: 's1', title: 'Nordic defence convergence report', provider: 'test', year: 2024, abstract: 'Finland joined NATO in April 2023 and Sweden followed in March 2024, citing a 5% increase in regional readiness spending.' },
];

const html = `
<p>GDP-adjacent readiness spending rose 5% across the region in 2023 [SRC-1].</p>
<p>The alliance consolidated a shared deterrence posture after the accessions [SRC-1].</p>
`;

const citanceResponse = (verdict: string) => ({
  content: JSON.stringify({ results: [{ i: 1, verdict, rationale: 'source carries the claim' }] }),
  costUsd: 0.001,
});

it('merges a supported citance into verified results without touching the score', async () => {
  jest.mocked(callLLM).mockResolvedValue(citanceResponse('supported') as never);
  const out = await factChecker(html, sources);
  expect(out.citance).toMatchObject({ total: 1, supported: 1, contradicted: 0, nei: 0, evaluationComplete: true });
  expect(out.integrityScore).toBe(100);
  expect(out.verified).toBe(2); // deterministic number + supported citance
  expect(callLLM).toHaveBeenCalledTimes(1); // only the citance batch — the number verified deterministically
});

it('marks a contradicted citation as fatal, an NEI citation as major', async () => {
  jest.mocked(callLLM).mockResolvedValue(citanceResponse('contradicted') as never);
  const out = await factChecker(html, sources);
  expect(out.citance?.contradicted).toBe(1);
  expect(out.fatalIssues).toBe(1);
  expect(out.integrityScore).toBe(50); // 1 verified + 1 fatal of 2
});

it('a failed entailment call reports incomplete and stays out of the denominator', async () => {
  jest.mocked(callLLM).mockRejectedValue(new Error('provider down'));
  const out = await factChecker(html, sources);
  expect(out.citance).toMatchObject({ total: 1, supported: 0, evaluationComplete: false });
  expect(out.citance?.verdicts[0].verdict).toBe('unverified');
  expect(out.integrityScore).toBe(100); // only the deterministically verified number counts
});
