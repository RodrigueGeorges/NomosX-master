/**
 * claim-ledger — mechanism→passage verification before drafting.
 * Verdict routing, directive composition, fail-open behaviour.
 */

import { verifyClaimLedger } from '@/lib/agent/claim-ledger';
import { callLLM } from '@/lib/llm/unified-llm';

jest.mock('@/lib/llm/unified-llm', () => ({ callLLM: jest.fn() }));
const llm = jest.mocked(callLLM);
const response = (value: unknown) => ({ content: JSON.stringify(value), costUsd: 0.005 }) as Awaited<ReturnType<typeof callLLM>>;

const mech = (id: number, description: string, sources: string[] = []) => ({
  id, description, domain: 'economics', crossDomainEffects: '', sources,
  dataPoints: [], temporalStatus: 'active_mechanism' as const, trajectoryHint: '',
});

const PASSAGE = 'Customs declarations filed by importers show steel imports fell 12% in the two quarters after the levy took effect across all member states.';
const sources = [
  { id: 's1', title: 'Customs report', provider: 'eurostat', abstract: PASSAGE },
  { id: 's2', title: 'Trade review', provider: 'openalex', abstract: 'Unrelated methodological discussion of trade elasticity measures.' },
];

beforeEach(() => {
  llm.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const ledger = (mechanisms = [mech(1, 'Steel imports fell 12% after the levy', ['[SRC-1]'])]) =>
  verifyClaimLedger({ question: 'Did the levy cut steel imports?', mechanisms, sources });

it('unsupported and partial mechanisms become a mandatory directive', async () => {
  llm.mockResolvedValue(response({ verdicts: [
    { id: 1, verdict: 'unsupported' },
    { id: 2, verdict: 'partial' },
    { id: 3, verdict: 'supported' },
  ] }));
  const result = await ledger([
    mech(1, 'Alpha mechanism claim text', ['[SRC-1]']),
    mech(2, 'Beta mechanism claim text', ['[SRC-1]']),
    mech(3, 'Gamma mechanism claim text', ['[SRC-1]']),
    mech(4, 'Delta mechanism claim — no citation', []),
  ]);
  expect(result!.unsupportedIds).toEqual([1]);
  expect(result!.partialIds).toEqual([2]);
  expect(result!.uncitedIds).toEqual([4]);
  expect(result!.directive).toContain('#1');
  expect(result!.directive).toContain('#4');
  expect(result!.directive).toContain('CLAIM-LEDGER VERIFICATION');
});

it('a fully supported ledger yields no directive', async () => {
  llm.mockResolvedValue(response({ verdicts: [{ id: 1, verdict: 'supported' }] }));
  const result = await ledger();
  expect(result!.directive).toBe('');
  expect(result!.checked).toBe(1);
});

it('shows the verifier the cited passage, not the whole source', async () => {
  llm.mockResolvedValue(response({ verdicts: [] }));
  await ledger();
  const req = llm.mock.calls[0][0] as any;
  expect(req.task).toBe('fact_check');
  expect(req.messages[1].content).toContain('[SRC-1]');
  expect(req.messages[1].content).toContain('steel imports fell 12%');
});

it('fails open — verifier outage returns null', async () => {
  llm.mockRejectedValue(new Error('provider down'));
  expect(await ledger()).toBeNull();
});

it('fails open — unparseable verdicts are ignored, not treated as unsupported', async () => {
  llm.mockResolvedValue(response({ verdicts: [{ id: 1, verdict: 'maybe' }, { id: 99, verdict: 'unsupported' }] }));
  const result = await ledger();
  expect(result!.unsupportedIds).toEqual([]);
  expect(result!.directive).toBe('');
});
