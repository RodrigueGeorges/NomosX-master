/**
 * CONFIDENCE-WEIGHTED AGGREGATION — independent scoring beats deliberation.
 *
 * KalshiBench oracle study (arXiv 2605.30802): deliberative consensus DEGRADES
 * accuracy below the best single model (confidently-wrong agents flip correct
 * ones), while independent aggregation with confidence weighting beats every
 * single-model baseline. Demystifying-MAD (ACL 2026) adds the second missing
 * piece: explicit, calibrated confidence communication.
 *
 * This module is the deterministic aggregation layer: critics score
 * INDEPENDENTLY (on partitioned evidence — see evidence-partition.ts), then a
 * mathematical combiner produces the composite. No judge gets to re-litigate
 * another judge's number.
 */

export interface ScoredVote {
  /** The judge's score for the artifact, 0-100. */
  score: number;
  /** The judge's self-reported calibrated confidence in that score, 0-100.
   *  Optional — missing confidence falls back to the uniform weight. */
  confidence?: number;
}

export interface AggregationResult {
  /** Confidence-weighted composite, 0-100. */
  composite: number;
  /** Effective weight each judge ended up with (sums to 1). */
  weights: number[];
  /** Score dispersion (std-dev) — high spread = real disagreement, the
   *  composite is less trustworthy even when high. */
  dispersion: number;
  /** True when no judge reported usable confidence — fixed weights used. */
  fellBackToFixed: boolean;
}

/**
 * Clamp a reported confidence into a sane weight contribution.
 * A judge that claims 0% confidence still counts (floor), and a judge that
 * claims 100% does not get to drown the panel (ceiling).
 */
const CONF_FLOOR = 20;
const CONF_CEIL = 95;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function aggregateIndependentScores(
  votes: ScoredVote[],
  fixedWeights?: number[],
): AggregationResult {
  const n = votes.length;
  if (n === 0) {
    return { composite: 0, weights: [], dispersion: 0, fellBackToFixed: true };
  }

  const fixed = fixedWeights && fixedWeights.length === n
    ? fixedWeights
    : Array.from({ length: n }, () => 1 / n);

  const hasConfidence = votes.some(
    (v) => typeof v.confidence === "number" && Number.isFinite(v.confidence),
  );

  let weights: number[];
  if (!hasConfidence) {
    weights = fixed;
  } else {
    // Weight ∝ declared confidence, normalized. Missing confidences get the
    // floor — a silent judge is treated as unconfident, not authoritative.
    const raw = votes.map((v) =>
      typeof v.confidence === "number" && Number.isFinite(v.confidence)
        ? clamp(v.confidence, CONF_FLOOR, CONF_CEIL)
        : CONF_FLOOR,
    );
    const sum = raw.reduce((a, b) => a + b, 0) || 1;
    weights = raw.map((r) => r / sum);
  }

  const composite = votes.reduce((acc, v, i) => acc + clamp(v.score, 0, 100) * weights[i], 0);
  const mean = votes.reduce((a, v) => a + v.score, 0) / n;
  const dispersion = Math.sqrt(
    votes.reduce((a, v) => a + (v.score - mean) ** 2, 0) / n,
  );

  return {
    composite: Math.round(clamp(composite, 0, 100)),
    weights,
    dispersion: Math.round(dispersion * 10) / 10,
    fellBackToFixed: !hasConfidence,
  };
}
