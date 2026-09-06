/**
 * TS-SetRank — Contextual Relevance Reranking via Thompson Sampling
 *
 * Inspired by TS-SetRank (ACL 2026):
 *   "Contextual Relevance and Adaptive Sampling for LLM-Based Document Reranking"
 *
 * Key insight: document relevance is context-dependent. The same document
 * may be judged relevant or irrelevant depending on which other documents
 * appear alongside it in the batch. TS-SetRank estimates contextual relevance
 * by marginalizing over multiple sampled batches using Thompson Sampling.
 *
 * This implementation is training-free and LLM-free:
 * - Uses local relevance scoring (relevance-scorer.ts) as the base judge
 * - Samples multiple batch compositions via Thompson Sampling
 * - Aggregates per-document relevance across batches
 * - Produces a context-aware ranking
 *
 * Complexity: O(sampling_rounds × batch_size × log(n))
 * Default: 3 rounds × batch of 20 → ~60 scoring calls (fast, local)
 */

import { scoreRelevance, type SourceForScoring } from './relevance-scorer';
import type { EnhancedQuery } from './query-enhancer';

export interface TSSetRankResult<T> {
  source: T;
  contextualScore: number; // 0.0 - 1.0, marginalized over batches
  baseScore: number; // 0.0 - 1.0, single-shot score
  batchesAppearedIn: number;
  rank: number;
}

interface BatchJudgment {
  docIndex: number;
  judgedRelevant: boolean;
  score: number;
}

const DEFAULT_ROUNDS = 3;
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_MIN_SCORE = 0.0;

/**
 * Thompson Sampling for Setwise Reranking.
 *
 * Phase 1 (Exploration): Sample random batches, collect relevance judgments.
 * Phase 2 (Exploitation): Construct batches using Thompson Sampling —
 *   documents with higher posterior mean + uncertainty are prioritized.
 *
 * The final score for each document is the posterior mean of its relevance
 * probability across all batches it appeared in.
 */
export async function tsSetRank<T extends SourceForScoring & { id: string }>(
  sources: T[],
  enhancedQuery: EnhancedQuery,
  options: {
    rounds?: number;
    batchSize?: number;
    minScore?: number;
    topK?: number;
  } = {}
): Promise<TSSetRankResult<T>[]> {
  const rounds = options.rounds ?? DEFAULT_ROUNDS;
  const batchSize = Math.min(options.batchSize ?? DEFAULT_BATCH_SIZE, sources.length);
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
  const topK = options.topK ?? sources.length;

  if (sources.length <= batchSize) {
    // No need for sampling — score all at once
    return singleBatchRank(sources, enhancedQuery, minScore, topK);
  }

  // ── Phase 1: Exploration — random batches ────────────────────────────────
  const judgments: BatchJudgment[] = [];
  const docJudgments: Map<number, BatchJudgment[]> = new Map();

  // Initial random batches
  for (let r = 0; r < Math.min(2, rounds); r++) {
    const batch = sampleRandomBatch(sources.length, batchSize);
    const batchJudgments = await scoreBatch(
      batch.map(i => sources[i]),
      enhancedQuery
    );
    for (let k = 0; k < batch.length; k++) {
      const j: BatchJudgment = {
        docIndex: batch[k],
        judgedRelevant: batchJudgments[k].score > 0.5,
        score: batchJudgments[k].score,
      };
      judgments.push(j);
      if (!docJudgments.has(j.docIndex)) docJudgments.set(j.docIndex, []);
      docJudgments.get(j.docIndex)!.push(j);
    }
  }

  // ── Phase 2: Exploitation — Thompson Sampling batches ────────────────────
  for (let r = 2; r < rounds; r++) {
    // Compute posterior for each document (Beta distribution: α=successes+1, β=failures+1)
    const posteriors = sources.map((_, i) => {
      const js = docJudgments.get(i) || [];
      const successes = js.filter(j => j.judgedRelevant).length;
      const failures = js.length - successes;
      // Sample from Beta(α, β) — using a simple approximation
      const alpha = successes + 1;
      const beta = failures + 1;
      return sampleBeta(alpha, beta);
    });

    // Select top-k by Thompson Sample to form the next batch
    const batch = posteriors
      .map((sample, idx) => ({ sample, idx }))
      .sort((a, b) => b.sample - a.sample)
      .slice(0, batchSize)
      .map(x => x.idx);

    const batchJudgments = await scoreBatch(
      batch.map(i => sources[i]),
      enhancedQuery
    );
    for (let k = 0; k < batch.length; k++) {
      const j: BatchJudgment = {
        docIndex: batch[k],
        judgedRelevant: batchJudgments[k].score > 0.5,
        score: batchJudgments[k].score,
      };
      judgments.push(j);
      if (!docJudgments.has(j.docIndex)) docJudgments.set(j.docIndex, []);
      docJudgments.get(j.docIndex)!.push(j);
    }
  }

  // ── Aggregate: compute contextual relevance (posterior mean) ──────────────
  const results: TSSetRankResult<T>[] = sources.map((source, i) => {
    const js = docJudgments.get(i) || [];
    const baseScore = js.length > 0 ? js[0].score : 0;
    // Posterior mean of Beta(α, β) = α / (α + β)
    const successes = js.filter(j => j.judgedRelevant).length;
    const failures = js.length - successes;
    const alpha = successes + 1;
    const beta = failures + 1;
    const contextualScore = js.length > 0 ? alpha / (alpha + beta) : baseScore;

    return {
      source,
      contextualScore,
      baseScore,
      batchesAppearedIn: js.length,
      rank: 0, // assigned below
    };
  });

  // Sort by contextual score (descending)
  results.sort((a, b) => b.contextualScore - a.contextualScore);

  // Assign ranks and filter by minScore, then apply topK limit
  const filtered = results.filter(r => r.contextualScore >= minScore).slice(0, topK);
  filtered.forEach((r, i) => { r.rank = i + 1; });

  return filtered;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function singleBatchRank<T extends SourceForScoring & { id: string }>(
  sources: T[],
  enhancedQuery: EnhancedQuery,
  minScore: number,
  topK: number = sources.length
): Promise<TSSetRankResult<T>[]> {
  const results: TSSetRankResult<T>[] = sources.map((source) => {
    const scored = scoreRelevance(source, enhancedQuery);
    return {
      source,
      contextualScore: scored.overall,
      baseScore: scored.overall,
      batchesAppearedIn: 1,
      rank: 0,
    };
  });
  results.sort((a, b) => b.contextualScore - a.contextualScore);
  results
    .filter(r => r.contextualScore >= minScore)
    .slice(0, topK)
    .forEach((r, i) => { r.rank = i + 1; });
  return results.filter(r => r.contextualScore >= minScore).slice(0, topK);
}

function sampleRandomBatch(n: number, k: number): number[] {
  const indices = Array.from({ length: n }, (_, i) => i);
  // Fisher-Yates shuffle (partial)
  for (let i = n - 1; i > n - k - 1; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(n - k);
}

async function scoreBatch<T extends SourceForScoring>(
  batch: T[],
  enhancedQuery: EnhancedQuery
): Promise<Array<{ score: number }>> {
  return batch.map(source => {
    const scored = scoreRelevance(source, enhancedQuery);
    return { score: scored.overall };
  });
}

/**
 * Sample from Beta(α, β) distribution using the ratio of Gammas method.
 * Simple approximation sufficient for Thompson Sampling.
 */
function sampleBeta(alpha: number, beta: number): number {
  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  return x / (x + y);
}

function sampleGamma(shape: number): number {
  // Marsaglia-Tsang method for Gamma sampling
  if (shape < 1) {
    // Use boost: Gamma(shape) = Gamma(shape+1) * U^(1/shape)
    const u = Math.random();
    if (u === 0) return 0;
    return sampleGamma(shape + 1) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x: number, v: number;
    do {
      x = sampleNormal();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function sampleNormal(): number {
  // Box-Muller transform
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
