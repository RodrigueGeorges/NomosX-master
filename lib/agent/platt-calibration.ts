/**
 * PLATT CALIBRATION — Lot 1 aggregation honesty.
 *
 * Each model family has a different miscalibration signature (some
 * overconfident, some underconfident). Platt scaling fits a 2-parameter
 * logistic map on logit(p): p' = sigmoid(a·logit(p) + b), per family.
 *
 * Seeds are the IDENTITY map (a=1, b=0): until enough of OUR OWN resolved
 * forecasts exist per family, applying a borrowed ForecastBench curve
 * would fabricate calibration. fitPlatt() runs on resolved (p, outcome)
 * pairs grouped by family; once a family has ≥ MIN_FIT_SAMPLES resolved
 * votes its fitted params replace the identity seed and the swarm
 * aggregator applies them automatically.
 */

import { toLogOdds, fromLogOdds } from './leap-aggregation';

export interface PlattParams {
  /** logit slope — >1 sharpens, <1 softens toward 0.5. */
  a: number;
  /** logit intercept — shifts the calibration point. */
  b: number;
  /** Resolved votes the fit was computed on. */
  n: number;
}

export const PLATT_IDENTITY: PlattParams = { a: 1, b: 0, n: 0 };
/** Below this many resolved pairs a fit is noise — keep the seed. */
export const MIN_FIT_SAMPLES = 30;

const EPS = 1e-4;

export function applyPlatt(p: number, params: PlattParams | undefined): number {
  if (!params || (params.a === 1 && params.b === 0)) {
    return Math.min(1 - EPS, Math.max(EPS, p));
  }
  const lo = toLogOdds(p);
  return Math.min(1 - EPS, Math.max(EPS, fromLogOdds(params.a * lo + params.b)));
}

/**
 * Fit Platt params on (forecastProbability, outcome∈{0,1}) pairs by
 * gradient descent on the log-loss with L2 regularization toward identity.
 * Deterministic: fixed learning rate + fixed epochs, no RNG.
 */
export function fitPlatt(pairs: Array<{ p: number; y: 0 | 1 }>): PlattParams | null {
  const valid = pairs.filter(x => Number.isFinite(x.p) && x.p > 0 && x.p < 1 && (x.y === 0 || x.y === 1));
  if (valid.length < MIN_FIT_SAMPLES) return null;

  let a = 1, b = 0;
  const lr = 0.05, l2 = 0.01, epochs = 400;
  const xs = valid.map(x => toLogOdds(x.p));
  const ys = valid.map(x => x.y);

  for (let e = 0; e < epochs; e++) {
    let ga = 0, gb = 0;
    for (let i = 0; i < xs.length; i++) {
      const z = a * xs[i] + b;
      const pred = 1 / (1 + Math.exp(-z));
      const err = pred - ys[i];
      ga += err * xs[i];
      gb += err;
    }
    ga = ga / xs.length + l2 * (a - 1);
    gb = gb / xs.length + l2 * b;
    a -= lr * ga;
    b -= lr * gb;
  }
  // Degenerate fits (separator data → |a|→∞) are rejected: a Platt map that
  // saturates is worse than identity.
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 10 || Math.abs(b) > 5) return null;
  return { a: Math.round(a * 1000) / 1000, b: Math.round(b * 1000) / 1000, n: valid.length };
}

/** Brier score — lower is better; the metric the fit optimizes indirectly. */
export function brierScore(pairs: Array<{ p: number; y: 0 | 1 }>): number {
  const valid = pairs.filter(x => Number.isFinite(x.p) && (x.y === 0 || x.y === 1));
  if (!valid.length) return NaN;
  return valid.reduce((s, x) => s + (x.p - x.y) ** 2, 0) / valid.length;
}

// ── Family registry ──────────────────────────────────────────────────────
// In-memory by default; persisted params can be injected at boot (the BTF
// harness / a resolved-prediction sweep calls setFamilyPlatt). Identity
// seeds mean zero behaviour change until real data lands.

const familyParams = new Map<string, PlattParams>();

export function getFamilyPlatt(family: string | undefined): PlattParams {
  if (!family) return PLATT_IDENTITY;
  return familyParams.get(family) ?? PLATT_IDENTITY;
}

export function setFamilyPlatt(family: string, params: PlattParams): void {
  familyParams.set(family, params);
}

export function allFamilyPlatt(): Record<string, PlattParams> {
  return Object.fromEntries(familyParams);
}

/**
 * Fit and register params for one family from its resolved votes.
 * Returns the fitted params, or null when below MIN_FIT_SAMPLES (the
 * identity seed stays). This is the hook the resolved-prediction sweep
 * calls once per-family vote histories accumulate.
 */
export function calibrateFamily(
  family: string,
  pairs: Array<{ p: number; y: 0 | 1 }>,
): PlattParams | null {
  const fitted = fitPlatt(pairs);
  if (fitted) familyParams.set(family, fitted);
  return fitted;
}
