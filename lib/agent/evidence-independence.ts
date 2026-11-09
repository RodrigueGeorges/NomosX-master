// evidence-independence.ts — deterministic evidence-independence audit.
//
// AGENTS.md invariant: "Distinct documents are NOT proof of independent
// research." Two cited sources can be the same underlying study — a paper
// and the news article covering it, two outlets rewriting one report, a
// preprint and its published version. Document count then overstates
// evidence breadth, and every downstream judge (LLM or deterministic)
// reasons over an illusory corpus.
//
// This audit makes independence COMPUTABLE: embed each CITED source's
// title+abstract, cluster pairs whose cosine similarity exceeds the
// near-duplicate threshold, and count effective independent evidence
// clusters. Zero LLM calls — embeddings only. The whole result is frozen
// via captureInput('evidence:independence') so record/replay stay
// deterministic; OLD fixtures lacking the channel skip the audit entirely
// (hasFrozenInput guard) rather than drifting on live embedding state.

import { cosineSimilarity } from './semantic-engine';

/** Cosine ≥ this on title+abstract ⇒ treated as the same evidence cluster. */
export const NEAR_DUPLICATE_THRESHOLD = 0.88;

export interface EvidenceIndependence {
  /** Distinct [SRC-N] indices cited by the analysis. */
  citedCount: number;
  /** Cited sources for which a vector was available/computed. */
  withVectors: number;
  /** Pairs compared. */
  pairsChecked: number;
  /** Pairs at/above the near-duplicate threshold. */
  clusteredPairs: number;
  /** Connected components among cited sources (effective independence). */
  effectiveIndependent: number;
  maxPairwise: number;
  verdict: 'independent' | 'thin' | 'collapsed';
}

/** [SRC-N] indices cited in an analysis/artifact, deduped, bounded. */
export function citedSourceIndices(text: string, sourceCount: number): number[] {
  const out = new Set<number>();
  for (const m of text.matchAll(/\[SRC-(\d+)\]/g)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= sourceCount) out.add(n);
  }
  return [...out];
}

/**
 * Cluster unit vectors by pairwise cosine ≥ threshold (union-find).
 * Pure — exported for tests.
 */
export function clusterBySimilarity(
  vectors: number[][],
  threshold: number = NEAR_DUPLICATE_THRESHOLD,
): { clusters: number; clusteredPairs: number; maxPairwise: number } {
  const n = vectors.length;
  if (n < 2) return { clusters: Math.max(n, 0), clusteredPairs: 0, maxPairwise: 0 };
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a: number, b: number) => { parent[find(a)] = find(b); };
  let clusteredPairs = 0;
  let maxPairwise = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = cosineSimilarity(vectors[i], vectors[j]);
      if (sim > maxPairwise) maxPairwise = sim;
      if (sim >= threshold) { clusteredPairs++; union(i, j); }
    }
  }
  const roots = new Set<number>();
  for (let i = 0; i < n; i++) roots.add(find(i));
  return { clusters: roots.size, clusteredPairs, maxPairwise };
}

/**
 * Audit the cited subset of `sources`. Uses persisted source embeddings
 * when present; otherwise embeds title+abstract via embedBatch (bounded —
 * callers cap cited sources). Returns null when fewer than 2 cited sources
 * have vectors (nothing to compare).
 */
export async function auditEvidenceIndependence(
  analysisText: string,
  sources: Array<{ embeddings?: number[] | null; title?: string; abstract?: string }>,
): Promise<EvidenceIndependence | null> {
  const cited = citedSourceIndices(analysisText, sources.length);
  if (cited.length < 2) return null;

  const citedSources = cited.map(i => sources[i - 1]).filter(Boolean);
  let vectors: number[][] = [];
  const missingIdx: number[] = [];
  citedSources.forEach((s, idx) => {
    const v = s?.embeddings;
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'number') vectors[idx] = v as number[];
    else missingIdx.push(idx);
  });

  if (missingIdx.length > 0 && missingIdx.length <= 25) {
    try {
      const { embedBatch } = await import('./semantic-engine');
      const texts = missingIdx.map(i =>
        `${citedSources[i]?.title ?? ''} ${String(citedSources[i]?.abstract ?? '').slice(0, 800)}`.trim().slice(0, 1500),
      );
      const embedded = await embedBatch(texts);
      missingIdx.forEach((srcIdx, k) => { vectors[srcIdx] = embedded[k]; });
    } catch {
      // Embedding backend unavailable — audit degrades to persisted vectors only.
    }
  }

  const usable = vectors.filter(v => Array.isArray(v) && v.length > 0);
  if (usable.length < 2) return null;

  // Cluster over usable vectors only; map back is unnecessary — cluster
  // count over the comparable subset is the honest independence measure.
  const { clusters, clusteredPairs, maxPairwise } = clusterBySimilarity(usable);
  const effectiveIndependent = clusters;
  const verdict: EvidenceIndependence['verdict'] =
    effectiveIndependent >= Math.ceil(cited.length * 0.7) ? 'independent'
    : effectiveIndependent >= Math.max(2, Math.floor(cited.length * 0.4)) ? 'thin'
    : 'collapsed';

  return {
    citedCount: cited.length,
    withVectors: usable.length,
    pairsChecked: (usable.length * (usable.length - 1)) / 2,
    clusteredPairs,
    effectiveIndependent,
    maxPairwise: Math.round(maxPairwise * 1000) / 1000,
    verdict,
  };
}
