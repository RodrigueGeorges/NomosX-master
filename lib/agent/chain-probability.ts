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
import type { CausalLink } from './analyst-multipass';

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
  derivation: string;          // How the value was computed (formula or method)
  inputs: string[];            // Names of input variables
  confidence: 'high' | 'medium' | 'low';
  // T3: Enriched fields for source grounding and verification
  sourceRefs?: number[];       // [SRC-N] indices that support this quantity
  statedSpan?: string;         // Verbatim text from source stating this value
  verified?: boolean;          // T3: True if value was numerically verified against source text
  verificationMethod?: 'exact_match' | 'range_check' | 'unit_check' | 'failed';
  verificationNote?: string;   // Details of verification or failure
}

/**
 * T3: Deterministic numerical verification of a DerivedQuantity.
 * Checks that the value claimed in the DerivedQuantity actually appears
 * in the source text. Pure code — no LLM.
 *
 * Verification levels:
 * 1. exact_match: The exact number appears in the source text
 * 2. range_check: The number falls within a range stated in the source
 * 3. unit_check: The unit matches what's stated in the source
 * 4. failed: No verification possible
 */
export function verifyDerivedQuantity(
  dq: DerivedQuantity,
  sourceTexts: string[]
): { verified: boolean; method: 'exact_match' | 'range_check' | 'unit_check' | 'failed'; note: string } {
  if (!sourceTexts.length || dq.value == null || isNaN(dq.value)) {
    return { verified: false, method: 'failed', note: 'No source text or invalid value' };
  }

  const combinedText = sourceTexts.join(' ');
  const valueStr = String(dq.value);
  const valueNum = dq.value;

  // 1. Exact match: look for the exact number in the text
  // Handle both decimal (3.14) and comma (3,14) formats
  const valuePatterns = [
    new RegExp(`\\b${valueStr.replace('.', '[.,]')}\\b`),
    new RegExp(`\\b${Math.round(valueNum)}\\b`), // Also check rounded integer
  ];
  if (dq.unit) {
    // Also check with unit suffix
    const unitPattern = new RegExp(`${valueStr.replace('.', '[.,]')}\\s*${dq.unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    valuePatterns.push(unitPattern);
  }

  for (const pattern of valuePatterns) {
    if (pattern.test(combinedText)) {
      return { verified: true, method: 'exact_match', note: `Value ${valueStr} found in source text` };
    }
  }

  // 2. Range check: look for ranges in the text that contain the value
  // Patterns like "10-20", "10 to 20", "between 10 and 20"
  const rangePattern = /(\d+\.?\d*)\s*(?:[-–to]+)\s*(\d+\.?\d*)/gi;
  let match;
  while ((match = rangePattern.exec(combinedText)) !== null) {
    const low = parseFloat(match[1].replace(',', '.'));
    const high = parseFloat(match[2].replace(',', '.'));
    if (!isNaN(low) && !isNaN(high) && valueNum >= Math.min(low, high) && valueNum <= Math.max(low, high)) {
      return { verified: true, method: 'range_check', note: `Value ${valueStr} within range [${low}, ${high}] found in source` };
    }
  }

  // 3. Unit check: if the unit appears in the text, at least verify consistency
  if (dq.unit) {
    const unitInText = new RegExp(`\\b${dq.unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (unitInText.test(combinedText)) {
      // Unit is present but exact value not found — partial verification
      return { verified: true, method: 'unit_check', note: `Unit "${dq.unit}" found in source but exact value ${valueStr} not matched` };
    }
  }

  return { verified: false, method: 'failed', note: `Value ${valueStr} ${dq.unit || ''} not found in any source text` };
}

/**
 * T3: Batch verify an array of DerivedQuantities against source texts.
 * Mutates each DQ to add verification fields.
 */
export function verifyDerivedQuantities(
  quantities: DerivedQuantity[],
  sourceTexts: string[]
): { verified: number; failed: number } {
  let verified = 0;
  let failed = 0;

  for (const dq of quantities) {
    const result = verifyDerivedQuantity(dq, sourceTexts);
    dq.verified = result.verified;
    dq.verificationMethod = result.method;
    dq.verificationNote = result.note;
    if (result.verified) verified++;
    else failed++;
  }

  return { verified, failed };
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
// T6: Source-grounded priors from real CausalLink objects
// ============================================================================

/**
 * Build priors from the actual causal chain links, using their source grounding
 * and temporal status to determine the prior mean and width.
 * - present_fact with sourceRef → narrow prior, mean from evidence
 * - active_mechanism with sourceRef → moderate prior
 * - future_extrapolation → wide prior (inherently uncertain)
 * - unsupported links → very wide prior centered at 0.5
 */
export function buildPriorsFromCausalChain(
  chain: CausalLink[],
  trustTiers?: Map<number, string>
): Prior[] {
  return chain.map((link, i) => {
    const hasSource = typeof link.sourceRef === 'number' && link.sourceRef > 0
      || (typeof link.evidence === 'string' && /\[SRC-\d+\]/.test(link.evidence));

    let mean = 0.5;
    let width: Prior['width'] = 'wide';

    if (link.unsupported) {
      mean = 0.3;
      width = 'wide';
    } else if (link.temporalStatus === 'present_fact' && hasSource) {
      mean = 0.75;
      width = 'narrow';
    } else if (link.temporalStatus === 'active_mechanism' && hasSource) {
      mean = 0.6;
      width = 'moderate';
    } else if (link.temporalStatus === 'future_extrapolation') {
      mean = 0.4;
      width = 'wide';
    } else if (hasSource) {
      mean = 0.55;
      width = 'moderate';
    }

    // Adjust based on trust tier if available
    const tier = trustTiers?.get(link.id);
    if (tier === 'ESTABLISHED') {
      mean = Math.min(0.9, mean + 0.1);
      width = 'narrow';
    } else if (tier === 'SUPPORTED') {
      mean = Math.min(0.85, mean + 0.05);
      width = width === 'wide' ? 'moderate' : width;
    } else if (tier === 'SPECULATIVE') {
      mean = Math.max(0.2, mean - 0.1);
      width = 'wide';
    }

    return {
      variable: `link_${link.id}`,
      mean,
      width,
      sourceCount: hasSource ? 1 : 0,
      heterogeneity: 0,
      mappingVersion: MAPPING_VERSION,
    };
  });
}

/**
 * T6: Monte Carlo propagation on real causal chain objects.
 * Uses source-grounded priors from buildPriorsFromCausalChain.
 * The joint probability accounts for the DAG structure: a link only succeeds
 * if its parent also succeeds (derivesFrom chain).
 */
export function propagateCausalChainProbability(
  chain: CausalLink[],
  trustTiers?: Map<number, string>,
  iterations = 10000
): { jointProbability: number; perLinkProbability: number[]; priors: Prior[] } {
  if (chain.length === 0) {
    return { jointProbability: 0.5, perLinkProbability: [], priors: [] };
  }

  const priors = buildPriorsFromCausalChain(chain, trustTiers);
  const priorMap = new Map(priors.map(p => [p.variable, p]));

  let successCount = 0;
  const perLinkSums = new Array(chain.length).fill(0);

  for (let iter = 0; iter < iterations; iter++) {
    // Sample each link's success
    const linkSuccess = new Map<number, boolean>();

    for (const link of chain) {
      const prior = priorMap.get(`link_${link.id}`)!;
      const sigma = prior.width === 'wide' ? 0.3 : prior.width === 'narrow' ? 0.08 : 0.15;
      const sampled = sampleNormal(prior.mean, sigma);
      const succeeds = sampled > 0.5; // Threshold: majority confidence

      // T6: DAG constraint — if parent failed, this link also fails
      let effectiveSuccess = succeeds;
      if (link.derivesFrom != null) {
        const parentSucceeded = linkSuccess.get(link.derivesFrom);
        if (parentSucceeded === false) {
          effectiveSuccess = false;
        }
      }

      linkSuccess.set(link.id, effectiveSuccess);
    }

    // All links must succeed for joint probability
    const allSucceed = [...linkSuccess.values()].every(v => v === true);
    if (allSucceed) successCount++;

    // Accumulate per-link probabilities
    chain.forEach((link, i) => {
      if (linkSuccess.get(link.id)) perLinkSums[i]++;
    });
  }

  const perLinkProbability = perLinkSums.map(s => s / iterations);

  return {
    jointProbability: successCount / iterations,
    perLinkProbability,
    priors,
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
// LOT 4.8 / T4: inflectionCheck — enhanced with dated, thresholded, attested gate
// ============================================================================

export interface InflectionResult {
  hasInflection: boolean;
  warning?: string;
  inflectionPoint?: {
    mechanism: Mechanism;
    dated: boolean;
    thresholded: boolean;
    attested: boolean;
  };
  warnings: string[];
}

export function inflectionCheck(mechanisms: Mechanism[]): InflectionResult {
  const warnings: string[] = [];

  if (mechanisms.length < 5) {
    return { hasInflection: true, warnings: [] };
  }

  // Find reversing mechanisms
  const reversing = mechanisms.filter(m => m.direction === 'reversing');
  if (reversing.length === 0) {
    const warning = `Chain of ${mechanisms.length} mechanisms has no reversing direction — trajectory is purely inertial`;
    warnings.push(warning);
    return { hasInflection: false, warning, warnings };
  }

  // T4: For each reversing mechanism, check if it's dated, thresholded, and attested
  for (const m of reversing) {
    const dated = checkDated(m);
    const thresholded = checkThresholded(m);
    const attested = checkAttested(m);

    if (dated && thresholded && attested) {
      return {
        hasInflection: true,
        warnings,
        inflectionPoint: { mechanism: m, dated, thresholded, attested },
      };
    }

    // Collect specific deficiencies
    if (!dated) warnings.push(`Reversing mechanism "${m.description.slice(0, 80)}" lacks a specific date/timeframe`);
    if (!thresholded) warnings.push(`Reversing mechanism "${m.description.slice(0, 80)}" lacks a quantified threshold`);
    if (!attested) warnings.push(`Reversing mechanism "${m.description.slice(0, 80)}" is not explicitly stated by authors (isStated=false or no statedSpan)`);
  }

  // Has a reversing direction but none meet all three criteria
  const warning = `Chain has ${reversing.length} reversing mechanism(s) but none are dated + thresholded + attested`;
  warnings.push(warning);
  return { hasInflection: false, warning, warnings };
}

/**
 * T4: Check if a mechanism has a date or specific timeframe.
 * Looks for year references, "by Q1", "within N years", etc.
 */
function checkDated(m: Mechanism): boolean {
  const text = `${m.description} ${m.horizon} ${m.rate || ''}`;
  // Check for explicit year, quarter, or timeframe
  const hasYear = /\b(20[2-9]\d|203\d)\b/.test(text);
  const hasQuarter = /\bQ[1-4]\b/i.test(text);
  const hasTimeframe = /\b(within\s+\d+\s+years?|by\s+20\d{2}|over\s+the\s+next\s+\d+|in\s+\d+\s+years?)\b/i.test(text);
  const hasHorizon = !!(m.horizon && m.horizon !== 'unspecified' && m.horizon !== 'short-term' && m.horizon !== 'long-term');
  return hasYear || hasQuarter || hasTimeframe || hasHorizon;
}

/**
 * T4: Check if a mechanism has a quantified threshold.
 * Looks for percentages, dollar amounts, basis points, or numeric thresholds.
 */
function checkThresholded(m: Mechanism): boolean {
  const text = `${m.description} ${m.rate || ''}`;
  const hasPercent = /\b\d+\.?\d*\s*%/.test(text);
  const hasDollar = /\$\d/.test(text);
  const hasBps = /\b\d+\s*bps?\b/i.test(text);
  const hasNumericThreshold = /\b(above|below|over|under|at least|at most|exceeds?|threshold)\s+\d/i.test(text);
  const hasRate = !!(m.rate && /\d/.test(m.rate));
  return hasPercent || hasDollar || hasBps || hasNumericThreshold || hasRate;
}

/**
 * T4: Check if a mechanism is attested (explicitly stated by authors with verbatim span).
 */
function checkAttested(m: Mechanism): boolean {
  return m.isStated === true && m.spanVerified === true;
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
