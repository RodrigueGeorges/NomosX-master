/**
 * ROR batching: individual institutional providers must collapse into ONE
 * batched OpenAlex call (OR filter), with results retagged per matched ROR.
 * Prevents the per-query fan-out that exhausted the execution HTTP budget.
 */

// Both module ids are mocked: the stale openalex.js stub re-exporting
// './openalex' resolves back to itself and self-recurses under jest.mock.
jest.mock('../../lib/providers/openalex', () => ({
  searchOpenAlex: jest.fn(),
}));
jest.mock('../../lib/providers/openalex.js', () => ({
  searchOpenAlex: jest.fn(),
}));

import { searchOpenAlex } from '../../lib/providers/openalex';
import { isRorBatchedProvider, searchRorBatch } from '../../lib/providers/institutional/ror-batch';

const mockSearch = searchOpenAlex as jest.MockedFunction<typeof searchOpenAlex>;

describe('ror-batch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('identifies pure-ROR providers', () => {
    expect(isRorBatchedProvider('ema')).toBe(true);
    expect(isRorBatchedProvider('ecb')).toBe(true);
    expect(isRorBatchedProvider('cnrs')).toBe(true);
    expect(isRorBatchedProvider('openalex')).toBe(false);
    expect(isRorBatchedProvider('tavily')).toBe(false);
  });

  test('batches multiple providers into ONE OpenAlex call with OR filter', async () => {
    mockSearch.mockResolvedValue([
      { id: 'https://openalex.org/W1', title: 'EMA paper', institutions: [{ name: 'EMA', rorId: '01z0wsw92' }] },
      { id: 'https://openalex.org/W2', title: 'ECDC paper', institutions: [{ name: 'ECDC', rorId: '00s9v1h75' }] },
    ] as any);

    const results = await searchRorBatch('test query', ['ema', 'ecdc', 'cochrane'], 15);

    // ONE call for 3 providers (was: 3 calls)
    expect(mockSearch).toHaveBeenCalledTimes(1);
    const [, , opts] = mockSearch.mock.calls[0] as any;
    expect(opts.filter).toContain('authorships.institutions.ror:');
    expect(opts.filter).toContain('ror.org/01z0wsw92');
    expect(opts.filter).toContain('ror.org/00s9v1h75');
    expect(opts.filter).toContain('ror.org/00dbkrq51');
    expect(opts.filter).toContain('|'); // OR syntax

    // Retagged per matched institution
    expect(results.find(r => r.title === 'EMA paper').provider).toBe('ema');
    expect(results.find(r => r.title === 'EMA paper').id).toBe('ema:W1');
    expect(results.find(r => r.title === 'ECDC paper').provider).toBe('ecdc');
    expect(results.find(r => r.title === 'ECDC paper').issuer).toBe('ECDC');
  });

  test('chunks >15 providers into multiple calls (OpenAlex filter length limit)', async () => {
    mockSearch.mockResolvedValue([]);
    const many = ['ema', 'ecdc', 'cochrane', 'inserm', 'nih', 'cdc', 'swp', 'iai', 'sipri', 'ecfr', 'cnrs', 'inria', 'ens', 'ademe', 'cea', 'inrae', 'un', 'undp'];
    await searchRorBatch('q', many, 10);
    expect(mockSearch).toHaveBeenCalledTimes(2); // 18 providers → 2 chunks of ≤15
  });

  test('returns [] for unknown providers without calling OpenAlex', async () => {
    const results = await searchRorBatch('q', ['tavily', 'bogus'], 10);
    expect(results).toEqual([]);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  test('unmatched results keep generic institution tag', async () => {
    mockSearch.mockResolvedValue([
      { id: 'https://openalex.org/W9', title: 'Other', institutions: [{ name: 'MIT', rorId: 'zzzzz' }] },
    ] as any);
    const results = await searchRorBatch('q', ['ema'], 10);
    expect(results[0].provider).toBe('institution');
  });
});
