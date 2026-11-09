import {
  citedSourceIndices,
  clusterBySimilarity,
  NEAR_DUPLICATE_THRESHOLD,
} from '../../../lib/agent/evidence-independence';

// Deterministic unit vectors on a 2-D circle — cosine = dot product.
const vec = (deg: number) => {
  const r = (deg * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r)];
};

describe('citedSourceIndices', () => {
  it('extracts deduped in-range [SRC-N] markers', () => {
    const text = 'Claim [SRC-1] and [SRC-3] and again [SRC-1]. Bad: [SRC-9] [SRC-0]';
    expect(citedSourceIndices(text, 5)).toEqual([1, 3]);
  });

  it('returns empty for no citations', () => {
    expect(citedSourceIndices('no markers here', 5)).toEqual([]);
  });
});

describe('clusterBySimilarity', () => {
  it('keeps orthogonal vectors in separate clusters', () => {
    const r = clusterBySimilarity([vec(0), vec(90), vec(180)], NEAR_DUPLICATE_THRESHOLD);
    expect(r.clusters).toBe(3);
    expect(r.clusteredPairs).toBe(0);
  });

  it('merges near-identical vectors into one cluster', () => {
    const r = clusterBySimilarity([vec(0), vec(2), vec(91)], NEAR_DUPLICATE_THRESHOLD);
    expect(r.clusters).toBe(2);
    expect(r.clusteredPairs).toBe(1);
    expect(r.maxPairwise).toBeGreaterThan(0.99);
  });

  it('handles single/empty input', () => {
    expect(clusterBySimilarity([]).clusters).toBe(0);
    expect(clusterBySimilarity([vec(0)]).clusters).toBe(1);
  });

  it('transitive clustering: A~B, B~C ⇒ one cluster', () => {
    // 0°, 20°, 40° — consecutive pairs above threshold, ends far apart
    const r = clusterBySimilarity([vec(0), vec(20), vec(40)], 0.85);
    expect(r.clusters).toBe(1);
  });
});
