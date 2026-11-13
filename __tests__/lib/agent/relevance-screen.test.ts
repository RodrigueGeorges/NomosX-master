/**
 * relevance-screen — score bucketing: 0 off-topic, 1 tangential, ≥2 core.
 * Callers decide whether tangential drops (floor of 8 core sources).
 */

jest.mock('@/lib/llm/unified-llm', () => ({
  callLLM: jest.fn(),
}));

import { screenSourcesForRelevance } from '@/lib/agent/pipeline-steps/relevance-screen';
import { callLLM } from '@/lib/llm/unified-llm';

const mockLLM = callLLM as jest.Mock;
const addCost = jest.fn();

const candidates = [
  { id: 'a', title: 'Core paper', abstract: 'x' },
  { id: 'b', title: 'Adjacent topic', abstract: 'y' },
  { id: 'c', title: 'Spam', abstract: 'z' },
];

beforeEach(() => jest.clearAllMocks());

describe('screenSourcesForRelevance', () => {
  it('buckets scores into off-topic / tangential / core', async () => {
    mockLLM.mockResolvedValue({
      content: JSON.stringify({ scores: { '0': 3, '1': 1, '2': 0 } }),
      costUsd: 0.001,
    });
    const res = await screenSourcesForRelevance({ query: 'q', candidates, label: 'T', addCost });
    expect(res).not.toBeNull();
    expect([...res!.dropIds]).toEqual(['c']);
    expect([...res!.tangentialIds]).toEqual(['b']);
    expect(res!.correctCount).toBe(1);
    expect(res!.screened).toBe(3);
  });

  it('returns null on empty/malformed scores (fail-open)', async () => {
    mockLLM.mockResolvedValue({ content: 'not json', costUsd: 0 });
    const res = await screenSourcesForRelevance({ query: 'q', candidates, label: 'T', addCost });
    expect(res).toBeNull();
  });

  it('returns null when the LLM throws', async () => {
    mockLLM.mockRejectedValue(new Error('provider down'));
    const res = await screenSourcesForRelevance({ query: 'q', candidates, label: 'T', addCost });
    expect(res).toBeNull();
  });
});
