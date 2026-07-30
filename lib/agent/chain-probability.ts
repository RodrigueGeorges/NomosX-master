/**
 * NomosX CHAIN PROBABILITY — Source-Grounded Foresight
 *
 * LOT 4.2-4.8: Converts meta-analysis results and causal chains into
 * probability distributions for Monte Carlo simulation.
 *
 * LOT 4.2: buildPriors() — source-grounded prior distributions
 * LOT 4.3: propagateChainProbability() — joint probability via Monte Carlo
 * LOT 4.4: chainTournament() — permutations of mechanisms → best joint probability
 * LOT 4.5: dToProbability() — versioned mapping d → P
 * LOT 4.6: scenariosFromChain() — base/adverse/accelerated from priors
 * LOT 4.7: DerivedQuantity type
 * LOT 4.8: inflectionCheck — warning if no reversing link
 */

import type { MetaAnalysisResult } from './meta-analysis-engine';
import type { Mechanism } from './reader-agent-v3';

// ============================================================================
// TYPES
// ============================================================================

// LOT 4.2: Prior distribution from meta-analysis
export interface Prior {
  variable: string;
  mean: number;
  width: 'narrow' | 'moderate' | 'wide';
  sourceCount: number;
  heterogeneity: number;  // I² value
  mappingVersion: string;
}

// LOT 4.5: Mapping version
export const MAPPING_VERSION = '1.0.0';

// LOT 4.7: Derived quantity
export interface DerivedQuantity {
  name: string;
  value: number;
  unit: string;
  derivation: string;
  inputs: string[];
  confidence: 'high' | 'medium' | 'low';
}

// LOT 4.6: Scenario from chain
export interface ChainScenario {
  name: 'base' | 'adverse' | 'accelerated';
  description: string;
  probability: number;
  priors: Prior[];
}

// ============================================================================
// LOT 4.2: buildPriors — extract prior distributions from meta-analysis
// ============================================================================

export function buildPriors(metaAnalysis: MetaAnalysisResult | null): Prior[] {
  if (!metaAnalysis || metaAnalysis.k < 2) {
    return [];
  }

  const { randomEffects, heterogeneity, k } = metaAnalysis;
  const mean = randomEffects.value;
  const se = randomEffects.standardError;

  // Width determination: I² > 75% or k < 5 → wide, I² < 25% and k > 10 → narrow
  let width: Prior['width'] = 'moderate';
  if (heterogeneity.I2 > 75 || k < 5) {
    width = 'wide';
  } else if (heterogeneity.I2 < 25 && k > 10) {
    width = 'narrow';
  }

  return [{
    variable: metaAnalysis.effectMeasure || 'effect_size',
    mean,
    width,
    sourceCount: k,
    heterogeneity: heterogeneity.I2,
    mappingVersion: MAPPING_VERSION,
  }];
}

// ============================================================================
// LOT 4.5: d → P mapping (versioned)
// P = norm.cdf(d / sqrt(k))  — corrected: k (number of studies), not n
// ============================================================================

export function dToProbability(d: number, k: number): { probability: number; mappingVersion: string } {
  if (k <= 0) return { probability: 0.5, mappingVersion: MAPPING_VERSION };
  const z = d / Math.sqrt(k);
  const p = normalCdf(z);
  return { probability: clamp01(p), mappingVersion: MAPPING_VERSION };
}

// ============================================================================
// LOT 4.3: propagateChainProbability — Monte Carlo on priors
// ============================================================================

export function propagateChainProbability(
  chain: Array<{ description: string; direction?: string; sourceRef?: number }>,
  priors: Prior[],
  iterations = 10000
): { jointProbability: number; perLinkProbability: number[] } {
  if (chain.length === 0 || priors.length === 0) {
    return { jointProbability: 0.5, perLinkProbability: [] };
  }

  const perLink: number[] = [];
  let successCount = 0;

  for (let iter = 0; iter < iterations; iter++) {
    let allSucceed = true;
    perLink.length = 0;

    for (let i = 0; i < chain.length; i++) {
      // Use a prior if available, otherwise default to 0.5 with moderate width
      const prior = priors[i % priors.length];
      const sigma = prior.width === 'wide' ? 0.3 : prior.width === 'narrow' ? 0.08 : 0.15;
      const sampled = sampleNormal(prior.mean, sigma);
      const prob = clamp01(normalCdf(sampled));
      perLink.push(prob);

      // Monte Carlo: this link succeeds if sampled value > threshold
      if (sampled <= 0) {
        allSucceed = false;
      }
    }

    if (allSucceed) successCount++;
  }

  // Average per-link probabilities
  const avgPerLink: number[] = [];
  for (let i = 0; i < chain.length; i++) {
    // Recompute average per link
    const prior = priors[i % priors.length];
    avgPerLink.push(clamp01(normalCdf(prior.mean)));
  }

  return {
    jointProbability: successCount / iterations,
    perLinkProbability: avgPerLink,
  };
}

// ============================================================================
// LOT 4.4: chainTournament — permutations of mechanisms → best joint probability
// ============================================================================

export function chainTournament(
  mechanisms: Mechanism[],
  priors: Prior[],
  iterations = 5000
): { bestOrder: Mechanism[]; bestJointProbability: number; permutations: number } {
  // Filter to stated mechanisms only
  const stated = mechanisms.filter(m => m.isStated && m.direction !== 'unclear');
  if (stated.length < 2) {
    // Not enough for a tournament — return as-is
    const result = propagateChainProbability(
      stated.map(m => ({ description: m.description, direction: m.direction })),
      priors,
      iterations
    );
    return { bestOrder: stated, bestJointProbability: result.jointProbability, permutations: 1 };
  }

  // Generate permutations (cap at 3! = 6 for 3 mechanisms, or up to 6 permutations max)
  const perms = permutations(stated.slice(0, 4));
  let bestJoint = 0;
  let bestOrder = stated;

  for (const perm of perms) {
    const result = propagateChainProbability(
      perm.map(m => ({ description: m.description, direction: m.direction })),
      priors,
      iterations
    );
    if (result.jointProbability > bestJoint) {
      bestJoint = result.jointProbability;
      bestOrder = perm;
    }
  }

  return { bestOrder, bestJointProbability: bestJoint, permutations: perms.length };
}

// ============================================================================
// LOT 4.6: scenariosFromChain — base/adverse/accelerated from priors
// ============================================================================

export function scenariosFromChain(priors: Prior[]): ChainScenario[] {
  if (priors.length === 0) return [];

  const basePriors = priors.map(p => ({ ...p }));
  const adversePriors = priors.map(p => ({
    ...p,
    mean: p.mean - (p.width === 'wide' ? 1 : p.width === 'narrow' ? 0.25 : 0.5),
  }));
  const acceleratedPriors = priors.map(p => ({
    ...p,
    mean: p.mean + (p.width === 'wide' ? 1 : p.width === 'narrow' ? 0.25 : 0.5),
  }));

  return [
    {
      name: 'base',
      description: 'Priors at mean values — most likely trajectory',
      probability: 0.5,
      priors: basePriors,
    },
    {
      name: 'adverse',
      description: 'Priors at -1σ — adverse scenario',
      probability: 0.25,
      priors: adversePriors,
    },
    {
      name: 'accelerated',
      description: 'Priors at +1σ — accelerated scenario',
      probability: 0.25,
      priors: acceleratedPriors,
    },
  ];
}

// ============================================================================
// LOT 4.8: inflectionCheck — warning if chain ≥ 5 with no reversing direction
// ============================================================================

export function inflectionCheck(mechanisms: Mechanism[]): { hasInflection: boolean; warning?: string } {
  if (mechanisms.length < 5) return { hasInflection: true };

  const hasReversing = mechanisms.some(m => m.direction === 'reversing');
  if (!hasReversing) {
    return {
      hasInflection: false,
      warning: `Chain of ${mechanisms.length} mechanisms has no reversing direction — check for runaway assumptions`,
    };
  }

  return { hasInflection: true };
}

// ============================================================================
// STATISTICAL HELPERS
// ============================================================================

/** Standard normal CDF — Abramowitz & Stegun approximation */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** Box-Muller transform — sample from normal distribution */
function sampleNormal(mean: number, sigma: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * sigma;
}

function clamp01(p: number): number {
  return Math.max(0.001, Math.min(0.999, p));
}

/** Generate all permutations of an array (cap at 6) */
function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const result: T[][] = [];
  const maxPerms = 6;
  function generate(remaining: T[], current: T[]) {
    if (result.length >= maxPerms) return;
    if (remaining.length === 0) {
      result.push([...current]);
      return;
    }
    for (let i = 0; i < remaining.length; i++) {
      const rest = [...remaining.slice(0, i), ...remaining.slice(i + 1)];
      generate(rest, [...current, remaining[i]]);
    }
  }
  generate(arr, []);
  return result;
}
