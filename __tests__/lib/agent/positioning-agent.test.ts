/**
 * Positioning Agent — edge cases.
 * Mocks corpus retrieval + LLM; verifies dedup, thin-corpus skip,
 * directive filtering, and graceful failure.
 */
import { buildPositioningBrief } from '@/lib/agent/positioning-agent';
import { searchExtendedProviders } from '@/lib/providers/registry-bridge';
import { searchTavily } from '@/lib/providers/tavily-provider';
import { callLLM } from '@/lib/llm/unified-llm';

jest.mock('@/lib/providers/registry-bridge', () => ({ searchExtendedProviders: jest.fn() }));
jest.mock('@/lib/providers/tavily-provider', () => ({ searchTavily: jest.fn() }));
jest.mock('@/lib/llm/unified-llm', () => ({ callLLM: jest.fn() }));

const mockedThinkTanks = jest.mocked(searchExtendedProviders);
const mockedTavily = jest.mocked(searchTavily);
const mockedLLM = jest.mocked(callLLM);

const LONG_ABSTRACT = 'A'.repeat(200);

// Titles must be ≥15 chars — the corpus filter drops shorter titles.
function piece(title: string, url: string, abstract = LONG_ABSTRACT) {
  return { title: title.length >= 15 ? title : title.padEnd(15, ' '), url, abstract, provider: 'brookings' };
}

const FIELD_MAP = {
  fieldCoverage: ['sovereignty', 'minerals'],
  consensusClaims: ['Arctic is strategic'],
  uncoveredDimensions: ['methodological: shipping economics'],
  weakClaims: ['Greenlanders enthusiastic'],
  strongestPiece: 'Best Competitor Piece',
  directives: [
    { axis: 'cover', target: 'shipping economics', directive: 'Quantify shipping route economics' },
    { axis: 'challenge', target: 'enthusiasm claim', directive: 'Use polling data to test the claim' },
    { axis: 'contrarian', target: 'everything', directive: 'Disagree with all of it' }, // invalid axis → filtered
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedTavily.mockResolvedValue([] as never);
  mockedLLM.mockResolvedValue({ content: JSON.stringify(FIELD_MAP), costUsd: 0.001 } as never);
});

describe('buildPositioningBrief', () => {
  it('returns null when competitor corpus is too thin (<3 pieces)', async () => {
    mockedThinkTanks.mockResolvedValue([piece('A', 'https://a.com/1'), piece('B', 'https://b.com/1')] as never);
    const brief = await buildPositioningBrief('test query');
    expect(brief).toBeNull();
    expect(mockedLLM).not.toHaveBeenCalled();
  });

  it('deduplicates identical competitor urls', async () => {
    mockedThinkTanks.mockResolvedValue([
      piece('Same Piece', 'https://rand.org/dup'),
      piece('Same Piece', 'https://rand.org/dup/'), // trailing slash dupe
      piece('Piece Two', 'https://rand.org/two'),
      piece('Piece Three', 'https://rand.org/three'),
    ] as never);
    const brief = await buildPositioningBrief('test query');
    expect(brief?.competitorsFound).toBe(3);
  });

  it('filters out pieces with abstracts under 80 chars', async () => {
    mockedThinkTanks.mockResolvedValue([
      piece('Thin One', 'https://a.com/1', 'too short'),
      piece('Thin Two', 'https://a.com/2', 'also thin'),
      piece('Real One', 'https://a.com/3'),
      piece('Real Two', 'https://a.com/4'),
      piece('Real Three', 'https://a.com/5'),
    ] as never);
    const brief = await buildPositioningBrief('test query');
    expect(brief?.competitorsFound).toBe(3);
  });

  it('assembles a brief with valid directives only and a rendered contextBlock', async () => {
    mockedThinkTanks.mockResolvedValue([
      piece('P1', 'https://a.com/1'), piece('P2', 'https://a.com/2'), piece('P3', 'https://a.com/3'),
    ] as never);
    const brief = await buildPositioningBrief('test query');
    expect(brief).not.toBeNull();
    expect(brief!.directives).toHaveLength(2); // 'contrarian' axis filtered
    expect(brief!.directives.every(d => ['cover', 'challenge', 'outdeep'].includes(d.axis))).toBe(true);
    expect(brief!.contextBlock).toContain('COMPETITIVE POSITIONING');
    expect(brief!.contextBlock).toContain('Best Competitor Piece');
    expect(brief!.strongestPiece).toBe('Best Competitor Piece');
  });

  it('returns null when LLM field-map extraction fails', async () => {
    mockedThinkTanks.mockResolvedValue([
      piece('P1', 'https://a.com/1'), piece('P2', 'https://a.com/2'), piece('P3', 'https://a.com/3'),
    ] as never);
    mockedLLM.mockRejectedValue(new Error('LLM down'));
    const brief = await buildPositioningBrief('test query');
    expect(brief).toBeNull();
  });

  it('survives both corpus providers failing (empty corpus → null)', async () => {
    mockedThinkTanks.mockRejectedValue(new Error('registry down'));
    mockedTavily.mockRejectedValue(new Error('tavily down'));
    const brief = await buildPositioningBrief('test query');
    expect(brief).toBeNull();
  });

  it('produces a brief even with zero directives (brief is informational)', async () => {
    mockedThinkTanks.mockResolvedValue([
      piece('P1', 'https://a.com/1'), piece('P2', 'https://a.com/2'), piece('P3', 'https://a.com/3'),
    ] as never);
    mockedLLM.mockResolvedValue({ content: JSON.stringify({ ...FIELD_MAP, directives: [] }), costUsd: 0 } as never);
    const brief = await buildPositioningBrief('test query');
    expect(brief).not.toBeNull();
    expect(brief!.directives).toHaveLength(0);
    expect(brief!.contextBlock).toContain('COMPETITIVE POSITIONING');
  });
});
