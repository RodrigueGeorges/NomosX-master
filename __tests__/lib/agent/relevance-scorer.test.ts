/**
 * Relevance scorer — the semantic component used to run on the keyword-
 * stuffed `enhanced` query whose bigrams never appear in real text, so
 * Semantic was a constant ~0%. It now scores the original question with
 * unigram+bigram+trigram Dice overlap.
 */

import { scoreRelevance } from '@/lib/agent/relevance-scorer';
import type { EnhancedQuery } from '@/lib/agent/query-enhancer';

const q = (over: Partial<EnhancedQuery> = {}): EnhancedQuery => ({
  original: 'How is China challenging the US dollar as reserve currency?',
  language: 'en',
  translated: '',
  enhanced: 'china dollar reserve currency challenge geopolitics sanctions dedollarization',
  variations: [],
  keywords: ['china', 'dollar', 'reserve', 'currency'],
  topics: ['economics', 'geopolitics'],
  ...over,
});

const src = (over: any = {}) => ({
  id: 's1',
  title: 'Dedollarization and the future of the US dollar',
  provider: 'imf',
  abstract: 'Central banks are reducing dollar reserves as China promotes renminbi settlement in trade.',
  topics: ['economics'],
  year: 2024,
  ...over,
});

describe('scoreRelevance semantic component', () => {
  it('produces non-zero semantic similarity for a relevant source', () => {
    const score = scoreRelevance(src(), q());
    expect(score.semanticSimilarity).toBeGreaterThan(0);
  });

  it('relevant source outscores an off-topic one on semantic signal', () => {
    const on = scoreRelevance(src(), q());
    const off = scoreRelevance(src({
      title: 'CRISPR gene editing in maize',
      abstract: 'We edited drought tolerance loci in Zea mays using guide RNAs.',
      topics: ['biology'],
    }), q());
    expect(on.semanticSimilarity).toBeGreaterThan(off.semanticSimilarity);
  });
});
