/**
 * Repair-reserve regressions (S34/S39b live forensics — producer passes kept
 * running inside the window the critic→gap-fill→DA→verify→render→gate tail
 * needs, so every repair deferred on `insufficient_headroom` and the run died
 * with an unjudged artifact). Contract: producer steps must fit their own
 * duration AND leave REPAIR_TAIL_RESERVE_MS intact; steps inside the tail
 * keep their flat guards.
 */
import { callLLM } from '@/lib/llm/unified-llm';
import { analystAgentV3 } from '@/lib/agent/analyst-multipass';
import { hasRunHeadroomWithReserve, REPAIR_TAIL_RESERVE_MS } from '@/lib/agent/pipeline-steps/time-budget';
import { withExecutionDeadline } from '@/lib/worker/execution-scope';

jest.mock('@/lib/llm/unified-llm', () => ({ callLLM: jest.fn() }));

const mockedLLM = jest.mocked(callLLM);
beforeEach(() => mockedLLM.mockReset());
afterEach(() => jest.restoreAllMocks());

const SOURCES = [
  { title: 'Nordic convergence', provider: 'openalex', year: 2024, abstract: 'Nordic states converged on total defence.', qualityScore: 80 },
  { title: 'Finland NATO accession', provider: 'crossref', year: 2024, abstract: 'Finland joined NATO in April 2023.', qualityScore: 75 },
];

const P1_MAP = { mechanisms: [{ description: 'm1' }], collisions: [], dataLandscape: { totalDataPoints: 0, quantitativeFindings: [], activeDynamics: [], projectionsInLiterature: [] } };
const P2_MAP = { mechanismAssessments: [], collisionAssessments: [], survivingMechanisms: [], strongestChain: { presentFactIds: [], mechanismIds: [], projectedFuture: '' } };
const P3_ANALYSIS = {
  title: 'T', throughLine: 'tl', verdict: 'v', convictionLevel: 'tempered', anchoringBasis: 'ab',
  causalChain: [], trajectory: { horizon: '12m', state: 's', assumptions: 'a' },
  rejectedAlternatives: [], whatToWatch: { signals: [], whatWouldChangeMind: 'w', horizonCheck: 'h' },
  evidenceAssessment: { strongestLinks: [], weakestLink: 'w', gaps: [], sourceDiversity: 'd' },
  keyFindings: [],
};

function llmJson(payload: unknown) {
  return { content: JSON.stringify(payload), tokensInput: 10, tokensOutput: 10, costUsd: 0.001 } as any;
}

describe('hasRunHeadroomWithReserve — producer budget = step + repair tail', () => {
  it('denies a step that would consume the reserve, admits one that fits', () => {
    const start = Date.now(); // strategic fallback deadline = +75min
    // 10min step + 30min reserve = 40min — fits in 75min.
    expect(hasRunHeadroomWithReserve(start, true, 10 * 60_000)).toBe(true);
    // 50min step + 30min reserve = 80min — does NOT fit in 75min.
    expect(hasRunHeadroomWithReserve(start, true, 50 * 60_000)).toBe(false);
    // Without the reserve the same 50min step would have been admitted.
    expect(50 * 60_000 + REPAIR_TAIL_RESERVE_MS).toBeGreaterThan(75 * 60_000);
  });

  it('is always true with no deadline (detached callers, tests)', () => {
    expect(hasRunHeadroomWithReserve(undefined, false, Number.MAX_SAFE_INTEGER / 2)).toBe(true);
  });
});

describe('analyst multipass — passes degrade inside the repair reserve', () => {
  it('runs compact PASS 2 and downgrades PASS 3 when only the compact window remains (2 LLM calls)', async () => {
    mockedLLM
      .mockResolvedValueOnce(llmJson(P1_MAP))
      .mockResolvedValueOnce(llmJson(P2_MAP));
    // 10min scope → reserve scales to 0.6×10=6min; full pass needs 5+6=11min > 10,
    // compact needs 2.5+6=8.5min <= 10 → degraded stress test runs instead of skip.
    const result = await withExecutionDeadline(10 * 60_000, 'test-deadline', () =>
      analystAgentV3('test question about Nordic defence', SOURCES, [], { depth: 'strategic' })
    );
    // P2 compact ran, P3 → lightweight synthesis (no LLM call).
    expect(mockedLLM).toHaveBeenCalledTimes(2);
    expect((result as any).causalChain).toHaveLength(0); // lightweight path
    expect((result as any)._meta.failed).toBeUndefined();
  });

  it('skips PASS 2 entirely when even the compact window is gone (1 LLM call)', async () => {
    mockedLLM.mockResolvedValueOnce(llmJson(P1_MAP));
    // 6min scope → reserve 3.6min; compact needs 2.5+3.6=6.1min > 6 → skip.
    const result = await withExecutionDeadline(6 * 60_000, 'test-deadline', () =>
      analystAgentV3('test question about Nordic defence', SOURCES, [], { depth: 'strategic' })
    );
    expect(mockedLLM).toHaveBeenCalledTimes(1);
    expect((result as any)._meta.stressTestMap.mechanismAssessments).toHaveLength(0);
    expect((result as any).causalChain).toHaveLength(0); // lightweight path
    expect((result as any)._meta.failed).toBeUndefined();
  });

  it('runs all three passes when the deadline clears pass + reserve (3 LLM calls)', async () => {
    mockedLLM
      .mockResolvedValueOnce(llmJson(P1_MAP))
      .mockResolvedValueOnce(llmJson(P2_MAP))
      .mockResolvedValueOnce(llmJson(P3_ANALYSIS));
    const result = await withExecutionDeadline(60 * 60_000, 'test-deadline', () =>
      analystAgentV3('test question about Nordic defence', SOURCES, [], { depth: 'strategic' })
    );
    expect(mockedLLM).toHaveBeenCalledTimes(3);
    expect((result as any).title).toBe('T');
    expect((result as any)._meta.passes).toBe(3);
  });

  it('detached caller (no scope deadline) never triggers the reserve', async () => {
    mockedLLM
      .mockResolvedValueOnce(llmJson(P1_MAP))
      .mockResolvedValueOnce(llmJson(P2_MAP))
      .mockResolvedValueOnce(llmJson(P3_ANALYSIS));
    const result = await analystAgentV3('test question about Nordic defence', SOURCES, [], { depth: 'strategic' });
    expect(mockedLLM).toHaveBeenCalledTimes(3);
    expect((result as any).title).toBe('T');
  });
});
