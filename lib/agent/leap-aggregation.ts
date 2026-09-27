/**
 * LEAP — Likelihood Elicitation and Aggregation for probabilistic forecasting
 * (arXiv 2609.01337).
 *
 * Core idea: a monolithic "read all evidence, emit a probability" forecast
 * hides how each evidence item moves the result and collapses uncertainty.
 * Instead: explicit prior + per-item likelihood updates → deterministic
 * posterior in log-odds space. Auditable, reproducible, and each evidence
 * item's contribution is inspectable.
 *
 * Two entry points:
 *  - `evidenceLikelihoodUpdate`: fold the supporting sources of one extracted
 *    prediction into its deterministic prior (used at registration time).
 *  - `poolForecasts`: combine several agents' probabilities for the SAME claim
 *    via confidence-weighted log-odds pooling — the calibrated replacement for
 *    "the LLM synthesis picks a number".
 *
 * No LLM calls — this is the deterministic half of LEAP. The elicitation half
 * is whatever upstream agent produced the per-item estimates.
 */

const EPS = 1e-4;

export function toLogOdds(p: number): number {
  const c = Math.min(1 - EPS, Math.max(EPS, p));
  return Math.log(c / (1 - c));
}

export function fromLogOdds(lo: number): number {
  return 1 / (1 + Math.exp(-lo));
}

/**
 * Map a source's quality score to a likelihood-ratio contribution.
 * A claim cited to strong evidence should move the posterior; a claim cited
 * to nothing should not. LR is deliberately conservative: the best possible
 * single source shifts log-odds by ~0.55 (p: .5 → .63).
 */
function sourceLikelihoodRatio(qualityScore: number | undefined | null): number {
  const q = typeof qualityScore === "number" && Number.isFinite(qualityScore)
    ? Math.min(100, Math.max(0, qualityScore))
    : 50;
  // LR in [0.9, 1.5] → log-LR in [-0.105, +0.405].
  return 0.9 + (q / 100) * 0.6;
}

export interface LeapEvidenceUpdate {
  prior: number;
  posterior: number;
  /** Per-source log-LR contributions — the audit trail. */
  contributions: { sourceRef: number; logLR: number }[];
}

/**
 * Fold a prediction's cited sources into its prior probability.
 * Sources with qualityScore < 30 count weakly AGAINST (a claim resting on
 * poor evidence is less likely than the prior suggests).
 */
export function evidenceLikelihoodUpdate(
  prior: number,
  supportingSources: { ref: number; qualityScore?: number | null }[],
): LeapEvidenceUpdate {
  let lo = toLogOdds(Math.min(0.95, Math.max(0.05, prior)));
  const contributions: LeapEvidenceUpdate["contributions"] = [];
  // Diminishing returns: cap effective source count at 5.
  for (const s of supportingSources.slice(0, 5)) {
    const logLR = Math.log(sourceLikelihoodRatio(s.qualityScore));
    const signed = (s.qualityScore ?? 50) < 30 ? -Math.abs(logLR) * 0.5 : Math.abs(logLR) * 0.6;
    lo += signed;
    contributions.push({ sourceRef: s.ref, logLR: Math.round(signed * 1000) / 1000 });
  }
  const posterior = Math.round(Math.min(0.95, Math.max(0.05, fromLogOdds(lo))) * 100) / 100;
  return { prior, posterior, contributions };
}

export interface ForecastVote {
  claim: string;
  probability: number;
  /** Source of the forecast (expert domain, scenario engine, …). */
  origin?: string;
  /** Confidence in the probability estimate, 0-100. Default 50. */
  confidence?: number;
}

export interface PooledForecast {
  claim: string;
  /** Confidence-weighted log-odds pooled probability. */
  pooled: number;
  /** Raw votes that contributed. */
  votes: number;
  /** Weighted disagreement (std-dev of the vote probabilities). */
  spread: number;
  /** True when votes straddle 0.5 — the panel genuinely disagrees on sign. */
  contested: boolean;
}

/**
 * Pool multiple forecasters' probabilities on the same claim.
 * Confidence-weighted log-odds averaging — the calibrated alternative to
 * deliberative consensus, which the oracle literature shows can degrade
 * below the best single forecaster.
 */
export function poolForecasts(votes: ForecastVote[]): PooledForecast | null {
  const valid = votes.filter(
    (v) => typeof v.probability === "number" && Number.isFinite(v.probability),
  );
  if (valid.length === 0) return null;

  const weights = valid.map((v) =>
    Math.min(95, Math.max(20, typeof v.confidence === "number" ? v.confidence : 50)),
  );
  const wSum = weights.reduce((a, b) => a + b, 0) || 1;

  const pooledLo = valid.reduce(
    (acc, v, i) => acc + (weights[i] / wSum) * toLogOdds(v.probability),
    0,
  );
  const pooled = Math.round(fromLogOdds(pooledLo) * 100) / 100;

  const mean = valid.reduce((a, v) => a + v.probability, 0) / valid.length;
  const spread = Math.round(
    Math.sqrt(valid.reduce((a, v) => a + (v.probability - mean) ** 2, 0) / valid.length) * 100,
  ) / 100;
  const contested = valid.some((v) => v.probability < 0.5) && valid.some((v) => v.probability >= 0.5);

  return { claim: valid[0].claim, pooled, votes: valid.length, spread, contested };
}
