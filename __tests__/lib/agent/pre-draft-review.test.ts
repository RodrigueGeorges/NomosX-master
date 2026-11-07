/**
 * Pre-draft scope review — the pass-1 direction check that runs BEFORE
 * passes 2-3 invest in the draft. Scope/causality defects must surface as
 * an injected directive; a clean direction must not burn context.
 */

import { reviewDraftDirection } from '@/lib/agent/pre-draft-review';
import { callLLM } from '@/lib/llm/unified-llm';

jest.mock('@/lib/llm/unified-llm', () => ({ callLLM: jest.fn() }));

const mockCallLLM = callLLM as jest.MockedFunction<typeof callLLM>;

const frictionMap: any = {
  mechanisms: [
    { id: 1, description: 'Grid investment causes renewable curtailment to fall', domain: 'energy', crossDomainEffects: '', sources: ['SRC-1', 'SRC-2'], dataPoints: [], temporalStatus: 'active_mechanism', trajectoryHint: 'continues' },
    { id: 2, description: 'OPEC spare capacity absorbs EU demand shocks', domain: 'energy', crossDomainEffects: '', sources: ['SRC-3'], dataPoints: [], temporalStatus: 'present_fact', trajectoryHint: 'none' },
  ],
  collisions: [{ domainA: 'energy', domainB: 'geopolitics', friction: 'sanctions vs spare capacity', sources: ['SRC-1'], surpriseFactor: 'low' }],
  dataLandscape: { totalDataPoints: 4, quantitativeFindings: [], activeDynamics: [], projectionsInLiterature: [] },
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('returns null on trivially small maps without calling the LLM', async () => {
  const res = await reviewDraftDirection({
    question: 'q', frictionMap: { mechanisms: [], collisions: [], dataLandscape: { totalDataPoints: 0, quantitativeFindings: [], activeDynamics: [], projectionsInLiterature: [] } } as any,
    sourceCount: 10,
  });
  expect(res).toBeNull();
  expect(mockCallLLM).not.toHaveBeenCalled();
});

it('injects a directive when the direction exceeds the bound thesis', async () => {
  mockCallLLM.mockResolvedValue({
    content: JSON.stringify({
      withinScope: false,
      violations: ['mechanism #1 asserts causation the map only supports as correlation', 'mechanism #2 projects beyond present_fact status'],
      directive: 'Treat #1 and #2 as correlation_only; do not extrapolate to 2030.',
    }),
    costUsd: 0.002,
  } as any);

  const res = await reviewDraftDirection({
    question: 'Will EU energy security improve by 2030?',
    frictionMap,
    boundThesis: 'Grid investment correlates with reduced curtailment in OECD markets',
    sourceCount: 20,
  });

  expect(res).not.toBeNull();
  expect(res!.withinScope).toBe(false);
  expect(res!.violations).toHaveLength(2);
  expect(res!.directive).toContain('correlation_only');
  expect(res!.costUsd).toBe(0.002);
  // Bound thesis must reach the prompt — the scope check is meaningless without it.
  const prompt = (mockCallLLM.mock.calls[0][0] as any).messages[0].content;
  expect(prompt).toContain('BOUND THESIS');
  expect(prompt).toContain('Grid investment correlates');
});

it('returns no directive for a clean direction', async () => {
  mockCallLLM.mockResolvedValue({
    content: JSON.stringify({ withinScope: true, violations: [], directive: '' }),
    costUsd: 0.001,
  } as any);

  const res = await reviewDraftDirection({ question: 'q', frictionMap, sourceCount: 20 });
  expect(res!.withinScope).toBe(true);
  expect(res!.directive).toBe('');
});

it('treats violations listed under withinScope:true as defects', async () => {
  mockCallLLM.mockResolvedValue({
    content: JSON.stringify({
      withinScope: true,
      violations: ['mechanism #1 asserts causation the map only supports as correlation'],
      directive: '',
    }),
    costUsd: 0.001,
  } as any);

  const res = await reviewDraftDirection({ question: 'q', frictionMap, sourceCount: 20 });
  expect(res!.withinScope).toBe(false);
  // Empty LLM directive → deterministic fallback built from violations.
  expect(res!.directive).toContain('Mandatory correction');
});

it('fails open on LLM errors and malformed JSON', async () => {
  mockCallLLM.mockRejectedValueOnce(new Error('provider down'));
  expect(await reviewDraftDirection({ question: 'q', frictionMap, sourceCount: 20 })).toBeNull();

  mockCallLLM.mockResolvedValueOnce({ content: 'not json', costUsd: 0 } as any);
  expect(await reviewDraftDirection({ question: 'q', frictionMap, sourceCount: 20 })).toBeNull();
});
