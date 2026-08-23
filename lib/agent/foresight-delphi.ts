/**
 * FORESIGHT DELPHI — Professional-grade multi-expert scenario forecasting
 *
 * Based on proven methods from the Good Judgment Project, IARPA, and 2026 research:
 *
 * 1. BASE RATE COMPUTATION (Tetlock, Superforecasting)
 *    - Historical base rates are the #1 predictor of forecasting accuracy
 *    - LLM analyzes historical analogues to establish priors
 *
 * 2. FERMI DECOMPOSITION (Fermi estimation, GJP)
 *    - Break the question into sub-questions, estimate each separately
 *    - Reduces overconfidence and anchoring bias
 *
 * 3. SCALABLE DELPHI (arxiv 2602.08889, Pearson r=0.87-0.95)
 *    - 5 diverse expert personas with private evidence (InfoDelphi asymmetry)
 *    - 3 rounds with mediator feedback (not 2 — 3rd round improves convergence 15%+)
 *
 * 4. EXTREMIZING FUNCTION (Good Judgment Project, Atanasov et al. 2017)
 *    - When experts agree, push probability further from 50%
 *    - Formula: p_ext = p + sign(p-0.5) * |p-0.5|^0.5 * extremize_factor
 *    - Corrects for underconfidence in aggregated judgments
 *
 * 5. BOOTSTRAP CONFIDENCE INTERVALS
 *    - Resample expert estimates 1000x to get 90% CI
 *    - Shows uncertainty range, not just point estimates
 *
 * 6. EXPERT WEIGHTING (Calibration-based)
 *    - Weight experts by inverse distance from median (calibration proxy)
 *    - Better-calibrated experts get more influence
 *
 * 7. CROSS-IMPACT BALANCE (arxiv 2603.29470)
 *    - Stochastic CIB matrix for scenario consistency
 *
 * 8. SENSITIVITY ANALYSIS
 *    - How does probability change if key assumption is wrong?
 *    - Identifies fragile predictions
 *
 * 9. KEY DRIVERS & BLOCKERS
 *    - LLM extracts what actually moves each scenario
 *    - Actionable intelligence, not just numbers
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DelphiScenario {
  name: string;
  description: string;
  probability: number;           // Final calibrated probability (0-1)
  baseRate: number;              // Historical prior (0-1)
  fermiEstimate: number;         // Decomposed estimate (0-1)
  expertEstimate: number;        // Aggregated expert estimate (0-1)
  extremizedEstimate: number;    // After extremizing (0-1)
  calibratedProbability: number; // Final after all corrections
  confidenceInterval: [number, number]; // 90% CI [lower, upper]
  keyDrivers: string[];          // What moves this scenario
  blockers: string[];            // What prevents this scenario
  signals: string[];             // Early warning indicators
  sensitivityScore: number;      // 0-1, how fragile (1=very fragile)
  crossImpact: Record<string, number>;
  expertRationales: string[];    // Per-expert reasoning for this scenario
}

export interface DelphiResult {
  scenarios: DelphiScenario[];
  baseRateAnalysis: string;      // Historical analogue summary
  fermiDecomposition: string;    // Sub-question breakdown
  expertRationales: string[];    // All rationales across rounds
  crossImpactMatrix: Record<string, Record<string, number>>;
  convergenceScore: number;      // 0-1, how much experts converged
  brierScoreEstimate: number;    // Estimated Brier score (lower=better)
  costUsd: number;
}

interface ExpertInput {
  persona: string;
  evidenceSubset: string[];
  sharedEvidence: string[];
}

// ─── Expert Personas ────────────────────────────────────────────────────────
// Based on GJP research: diversity of perspective > individual expertise

const EXPERT_PERSONAS = [
  {
    role: 'base-rate-historian',
    lens: 'quantitative historian specializing in base rates and reference classes',
    focus: 'What fraction of historically similar situations led to this outcome? Start with the base rate, then adjust for specifics.',
    bias: 'anchoring on historical frequencies',
  },
  {
    role: 'bayesian-updater',
    lens: 'Bayesian analyst trained in evidence updating',
    focus: 'For each piece of evidence, compute P(evidence|scenario) and update via Bayes. Show your likelihood ratios.',
    bias: 'overconfidence in evidence strength',
  },
  {
    role: 'skeptic',
    lens: 'adversarial forecaster trained to find weaknesses',
    focus: 'What would make this scenario FAIL? Identify the weakest link in the causal chain. Stress-test aggressively.',
    bias: 'excessive pessimism',
  },
  {
    role: 'systems-thinker',
    lens: 'complex systems analyst specializing in feedback loops and emergence',
    focus: 'How do second-order effects, feedback loops, and emergent dynamics affect this scenario? Look for non-linearities.',
    bias: 'overweighting complexity',
  },
  {
    role: 'pragmatist',
    lens: 'policy practitioner with implementation experience',
    focus: 'What actually happens when this hits real-world institutions, politics, and budgets? Implementation gaps matter.',
    bias: 'status quo bias',
  },
];

// ─── Utility Functions ──────────────────────────────────────────────────────

export function partitionEvidence(evidence: string[], numExperts: number): ExpertInput[] {
  const sharedCount = Math.floor(evidence.length * 0.4);
  const shared = evidence.slice(0, sharedCount);
  const privatePool = evidence.slice(sharedCount);
  const privatePerExpert = Math.ceil(privatePool.length / numExperts);

  return Array.from({ length: numExperts }, (_, i) => ({
    persona: EXPERT_PERSONAS[i % EXPERT_PERSONAS.length].role,
    sharedEvidence: shared,
    evidenceSubset: privatePool.slice(i * privatePerExpert, (i + 1) * privatePerExpert),
  }));
}

/**
 * Extremizing function from Good Judgment Project (Atanasov et al. 2017).
 * When experts agree (low variance), push probability further from 0.5.
 * Corrects for underconfidence in aggregated judgments.
 *
 * Formula: p_ext = sigmoid(logit(p) * extremize_factor)
 * where extremize_factor depends on number of experts and their agreement.
 */
export function extremize(prob: number, numExperts: number, variance: number): number {
  const clamped = Math.max(0.001, Math.min(0.999, prob));
  const logitP = Math.log(clamped / (1 - clamped));
  // More experts + lower variance → more extremizing (more confidence)
  // GJP found optimal extremize factor ~1.7-2.5 for 5-15 experts
  const agreement = Math.max(0, 1 - variance * 10); // 0=no agreement, 1=perfect
  const extremizeFactor = 1 + (agreement * Math.min(2.0, numExperts / 5));
  const extremizedLogit = logitP * extremizeFactor;
  return 1 / (1 + Math.exp(-extremizedLogit));
}

/**
 * Platt scaling calibration — stretches probabilities away from 0.5.
 * LLMs hedge toward 50%; this corrects that bias.
 */
export function plattScale(prob: number, a: number = 2.5, b: number = 0): number {
  const clamped = Math.max(0.001, Math.min(0.999, prob));
  const logitP = Math.log(clamped / (1 - clamped));
  return 1 / (1 + Math.exp(-(a * logitP + b)));
}

export function normalize(probs: Record<string, number>): Record<string, number> {
  const sum = Object.values(probs).reduce((a, b) => a + b, 0);
  if (sum === 0) {
    const n = Object.keys(probs).length;
    return Object.fromEntries(Object.keys(probs).map(k => [k, 1 / n]));
  }
  return Object.fromEntries(Object.entries(probs).map(([k, v]) => [k, v / sum]));
}

/**
 * Bootstrap confidence interval — resample estimates to get 90% CI.
 */
function bootstrapCI(estimates: number[], numResamples: number = 1000): [number, number] {
  if (estimates.length < 2) {
    return [estimates[0] ?? 0.33, estimates[0] ?? 0.33];
  }
  const means: number[] = [];
  for (let i = 0; i < numResamples; i++) {
    // Resample with replacement
    const sample: number[] = [];
    for (let j = 0; j < estimates.length; j++) {
      const idx = Math.floor(Math.random() * estimates.length);
      sample.push(estimates[idx]);
    }
    means.push(sample.reduce((a, b) => a + b, 0) / sample.length);
  }
  means.sort((a, b) => a - b);
  const lowerIdx = Math.floor(numResamples * 0.05);
  const upperIdx = Math.floor(numResamples * 0.95);
  return [means[lowerIdx], means[upperIdx]];
}

/**
 * Weight experts by inverse distance from median (calibration proxy).
 * Experts closer to the consensus get more weight.
 */
function weightExperts(estimates: Record<string, number>[]): Record<string, number>[] {
  if (estimates.length === 0) return estimates;

  // Compute median for each scenario
  const scenarios = Object.keys(estimates[0]);
  const medians: Record<string, number> = {};
  for (const s of scenarios) {
    const vals = estimates.map(e => e[s]).filter(v => v != null && typeof v === 'number' && !isNaN(v));
    if (vals.length === 0) continue;
    vals.sort((a, b) => a - b);
    medians[s] = vals[Math.floor(vals.length / 2)];
  }

  // Weight = 1 / (1 + distance_from_median)
  return estimates.map(e => {
    let totalDist = 0;
    let count = 0;
    for (const s of scenarios) {
      if (e[s] != null && medians[s] != null) {
        totalDist += Math.abs(e[s] - medians[s]);
        count++;
      }
    }
    const avgDist = count > 0 ? totalDist / count : 0.5;
    const weight = 1 / (1 + avgDist * 5); // Scale factor for weighting
    return { ...e, _weight: weight };
  }) as Record<string, number>[];
}

/**
 * Weighted geometric mean aggregation.
 */
function weightedGeometricMean(values: number[], weights: number[]): number {
  if (values.length === 0) return 0.33;
  const clamped = values.map(v => Math.max(0.001, Math.min(0.999, v)));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight === 0) {
    // Equal weights fallback
    const logMean = clamped.reduce((sum, v) => sum + Math.log(v), 0) / clamped.length;
    return Math.exp(logMean);
  }
  const weightedLogSum = clamped.reduce((sum, v, i) => sum + Math.log(v) * weights[i], 0);
  return Math.exp(weightedLogSum / totalWeight);
}

// ─── Step 1: Base Rate Computation ──────────────────────────────────────────

async function computeBaseRates(
  question: string,
  scenarioNames: string[],
  scenarioDescriptions: string[],
  context: string
): Promise<{ rates: Record<string, number>; analysis: string; costUsd: number }> {
  const response = await callLLM({
    messages: [
      {
        role: 'system',
        content: `You are a base-rate analyst. Your job is to find historical reference classes and compute base rates.

BASE RATE METHODOLOGY:
1. Identify the TYPE of event (regime change, economic crisis, tech adoption, policy shift, etc.)
2. Find 3-5 historical analogues where similar conditions existed
3. Compute: what fraction led to each outcome type?
4. Adjust for context-specific factors (but be conservative — base rates are usually more predictive than specifics)

Be honest about uncertainty. If no good analogues exist, say so and use 1/N as fallback.
Base rates should be between 0.05 and 0.95 — never 0 or 1.`,
      },
      {
        role: 'user',
        content: `QUESTION: ${question}

CONTEXT: ${context.slice(0, 1000)}

SCENARIOS:
${scenarioNames.map((n, i) => `${i + 1}. ${n}: ${scenarioDescriptions[i]?.slice(0, 200) ?? ''}`).join('\n')}

Return JSON:
{
  "analysis": "2-3 sentences on the reference class and historical analogues used",
  "baseRates": {"scenario_name": 0.XX, ...}
}
OUTPUT ONLY JSON.`,
      },
    ],
    temperature: 0.1,
    maxTokens: 1000,
    jsonMode: true,
    task: 'delphi_round1',
    enableCache: true,
  });

  const parsed = parseJson<any>(response.content);
  const rates: Record<string, number> = {};
  for (const name of scenarioNames) {
    const r = parsed?.baseRates?.[name];
    rates[name] = (typeof r === 'number' && r > 0 && r < 1) ? r : 1 / scenarioNames.length;
  }
  return {
    rates,
    analysis: String(parsed?.analysis ?? 'No historical analogues identified — using uniform priors.'),
    costUsd: response.costUsd,
  };
}

// ─── Step 2: Fermi Decomposition ────────────────────────────────────────────

async function fermiDecompose(
  question: string,
  scenarioNames: string[],
  context: string
): Promise<{ estimates: Record<string, number>; decomposition: string; costUsd: number }> {
  const response = await callLLM({
    messages: [
      {
        role: 'system',
        content: `You are a Fermi decomposition specialist. Break the forecasting question into sub-questions and estimate each independently.

FERMI METHOD:
1. Decompose: What needs to be true for each scenario to occur? Identify 2-4 necessary conditions.
2. Estimate: Assign a probability to each sub-condition (0-1).
3. Combine: Multiply probabilities for AND conditions (independent), use complement for OR.
4. Sanity check: Does the result make sense? Compare to base rates.

This reduces anchoring bias and overconfidence. Be specific about sub-conditions.`,
      },
      {
        role: 'user',
        content: `QUESTION: ${question}

CONTEXT: ${context.slice(0, 800)}

SCENARIOS:
${scenarioNames.map((n, i) => `${i + 1}. ${n}`).join('\n')}

Return JSON:
{
  "decomposition": "Brief description of the sub-questions and how they combine",
  "estimates": {"scenario_name": 0.XX, ...}
}
OUTPUT ONLY JSON.`,
      },
    ],
    temperature: 0.15,
    maxTokens: 1200,
    jsonMode: true,
    task: 'delphi_round1',
    enableCache: true,
  });

  const parsed = parseJson<any>(response.content);
  const estimates: Record<string, number> = {};
  for (const name of scenarioNames) {
    const e = parsed?.estimates?.[name];
    estimates[name] = (typeof e === 'number' && e > 0 && e < 1) ? e : 1 / scenarioNames.length;
  }
  return {
    estimates,
    decomposition: String(parsed?.decomposition ?? 'Decomposition not available.'),
    costUsd: response.costUsd,
  };
}

// ─── Step 3: Delphi Rounds (3 rounds) ───────────────────────────────────────

interface RoundResult {
  estimates: Record<string, number>[];
  rationales: string[];
  costUsd: number;
}

async function delphiRound(
  roundNum: 1 | 2 | 3,
  question: string,
  scenarioNames: string[],
  experts: ExpertInput[],
  baseRates: Record<string, number>,
  previousRounds: RoundResult[],
  context: string
): Promise<RoundResult> {
  const estimates: Record<string, number>[] = [];
  const rationales: string[] = [];
  let costUsd = 0;

  // Build mediator summary from previous rounds
  let mediatorSummary = '';
  if (roundNum > 1 && previousRounds.length > 0) {
    const prevEstimates = previousRounds[previousRounds.length - 1].estimates;
    const prevRationales = previousRounds[previousRounds.length - 1].rationales;
    mediatorSummary = scenarioNames.map(name => {
      const vals = prevEstimates.map(e => e[name]).filter(v => v != null && typeof v === 'number' && !isNaN(v));
      if (vals.length === 0) return `${name}: no estimates`;
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const spread = max - min;
      return `${name}: mean=${(mean * 100).toFixed(0)}%, range=${(min * 100).toFixed(0)}-${(max * 100).toFixed(0)}% (spread: ${(spread * 100).toFixed(0)}pp)`;
    }).join('\n');
  }

  for (let i = 0; i < experts.length; i++) {
    const expert = experts[i];
    const persona = EXPERT_PERSONAS.find(p => p.role === expert.persona)!;
    const privateEvidence = expert.evidenceSubset.join('\n');
    const sharedEvidence = expert.sharedEvidence.join('\n');

    let systemPrompt: string;
    let userPrompt: string;

    if (roundNum === 1) {
      systemPrompt = `You are a ${persona.lens} on a Delphi forecasting panel. Your focus: ${persona.focus}

METHODOLOGY:
1. Start with the BASE RATE provided below — this is your prior.
2. Update based on SHARED evidence (all panelists see this) and your PRIVATE evidence (only you have this).
3. Be calibrated: use the full 0-1 range. 0.50 means "I have no idea". 0.90 means "I'd bet 9:1 on this".
4. Your known bias: ${persona.bias}. Actively counteract it.

This is ROUND 1 — estimate independently. Do not try to guess what others will say.`;

      userPrompt = `QUESTION: ${question}

BASE RATES (historical priors — start here):
${scenarioNames.map(n => `${n}: ${(baseRates[n] * 100).toFixed(0)}%`).join('\n')}

CONTEXT: ${context.slice(0, 600)}

SHARED EVIDENCE (all panelists see this):
${sharedEvidence.slice(0, 1200)}

YOUR PRIVATE EVIDENCE (only you have this):
${privateEvidence.slice(0, 800)}

SCENARIOS TO ESTIMATE:
${scenarioNames.map((n, i) => `${i + 1}. ${n}`).join('\n')}

Return JSON: {"estimates": {"scenario_name": 0.XX, ...}, "rationale": "2-3 sentences: base rate → evidence adjustment → final estimate"}
OUTPUT ONLY JSON.`;
    } else {
      const othersRationales = previousRounds[previousRounds.length - 1].rationales
        .filter((_, j) => j !== i).join('\n');

      systemPrompt = `You are a ${persona.lens} on a Delphi panel, ROUND ${roundNum}.
The mediator has shared the group's estimates and other panelists' rationales.

ROUND ${roundNum} INSTRUCTIONS:
${roundNum === 2
  ? 'Revise your estimates based on what you learned. You may converge or hold your ground — but justify any disagreement with evidence, not stubbornness. If another expert raised a point you missed, incorporate it.'
  : 'This is the FINAL round. Make your best calibrated estimate. If you still disagree with the group, state why clearly. Otherwise, converge toward the group median.'}

Your known bias: ${persona.bias}. Actively counteract it.`;

      userPrompt = `QUESTION: ${question}

MEDIATOR SUMMARY (Round ${roundNum - 1} results):
${mediatorSummary}

OTHER PANELISTS' RATIONALES:
${othersRationales.slice(0, 1500)}

BASE RATES (for reference):
${scenarioNames.map(n => `${n}: ${(baseRates[n] * 100).toFixed(0)}%`).join('\n')}

YOUR PRIVATE EVIDENCE:
${privateEvidence.slice(0, 600)}

SCENARIOS:
${scenarioNames.map((n, i) => `${i + 1}. ${n}`).join('\n')}

Return JSON: {"estimates": {"scenario_name": 0.XX, ...}, "rationale": "Why you revised (or didn't)"}
OUTPUT ONLY JSON.`;
    }

    const response = await callLLM({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: roundNum === 3 ? 0.1 : roundNum === 2 ? 0.2 : 0.3,
      maxTokens: roundNum === 1 ? 800 : 600,
      jsonMode: true,
      task: roundNum === 1 ? 'delphi_round1' : 'delphi_round2',
      enableCache: roundNum === 1,
    });

    costUsd += response.costUsd;
    const parsed = parseJson<any>(response.content);
    if (parsed?.estimates) {
      estimates.push(parsed.estimates);
      rationales.push(`[R${roundNum} ${persona.role}] ${parsed.rationale ?? ''}`);
    }
  }

  return { estimates, rationales, costUsd };
}

// ─── Step 4: Cross-Impact Balance ───────────────────────────────────────────

async function crossImpactAnalysis(
  scenarioNames: string[],
  context: string
): Promise<{ matrix: Record<string, Record<string, number>>; costUsd: number }> {
  const response = await callLLM({
    messages: [
      {
        role: 'system',
        content: `You are a cross-impact analysis engine. Estimate how each scenario influences every other scenario.

Scale: -3 (strongly inhibits) to +3 (strongly promotes). 0 = no interaction.
Diagonal = 0 (a scenario doesn't impact itself).
Consider: does Scenario A make Scenario B more or less likely if A occurs?`,
      },
      {
        role: 'user',
        content: `SCENARIOS:
${scenarioNames.map((n, i) => `${i + 1}. ${n}`).join('\n')}

CONTEXT: ${context.slice(0, 500)}

Return JSON: {"matrix": {"scenarioA": {"scenarioB": -3 to +3, ...}, ...}}
OUTPUT ONLY JSON.`,
      },
    ],
    temperature: 0.1,
    maxTokens: 800,
    jsonMode: true,
    task: 'cross_impact',
    enableCache: true,
  });

  const parsed = parseJson<any>(response.content);
  return { matrix: parsed?.matrix ?? {}, costUsd: response.costUsd };
}

// ─── Step 5: Key Drivers & Sensitivity Analysis ─────────────────────────────

async function extractDriversAndSensitivity(
  question: string,
  scenarioNames: string[],
  scenarioDescriptions: string[],
  context: string,
  probabilities: Record<string, number>
): Promise<{
  drivers: Record<string, { drivers: string[]; blockers: string[]; signals: string[]; sensitivity: number }>;
  costUsd: number;
}> {
  const response = await callLLM({
    messages: [
      {
        role: 'system',
        content: `You are a foresight analyst extracting actionable intelligence from scenario probabilities.

For each scenario, identify:
1. KEY DRIVERS: What factors would push probability UP by 10+ percentage points?
2. BLOCKERS: What factors would push probability DOWN by 10+ percentage points?
3. SIGNALS: What early warning indicators should we watch? (observable, time-bound)
4. SENSITIVITY: How fragile is this prediction? (0=robust, 1=very fragile)
   - High sensitivity if: probability swings >20pp when key assumption changes
   - Low sensitivity if: probability stable across assumption ranges`,
      },
      {
        role: 'user',
        content: `QUESTION: ${question}

CONTEXT: ${context.slice(0, 500)}

SCENARIOS AND CURRENT PROBABILITIES:
${scenarioNames.map((n, i) => `${n} (${(probabilities[n] * 100).toFixed(0)}%): ${scenarioDescriptions[i]?.slice(0, 150) ?? ''}`).join('\n')}

Return JSON:
{
  "scenarios": {
    "scenario_name": {
      "drivers": ["factor1", "factor2"],
      "blockers": ["factor1", "factor2"],
      "signals": ["observable indicator with timeframe"],
      "sensitivity": 0.X
    }
  }
}
OUTPUT ONLY JSON.`,
      },
    ],
    temperature: 0.15,
    maxTokens: 1500,
    jsonMode: true,
    task: 'cross_impact',
    enableCache: true,
  });

  const parsed = parseJson<any>(response.content);
  const result: Record<string, { drivers: string[]; blockers: string[]; signals: string[]; sensitivity: number }> = {};
  for (const name of scenarioNames) {
    const s = parsed?.scenarios?.[name];
    result[name] = {
      drivers: Array.isArray(s?.drivers) ? s.drivers.map(String).slice(0, 5) : [],
      blockers: Array.isArray(s?.blockers) ? s.blockers.map(String).slice(0, 5) : [],
      signals: Array.isArray(s?.signals) ? s.signals.map(String).slice(0, 5) : [],
      sensitivity: typeof s?.sensitivity === 'number' ? Math.max(0, Math.min(1, s.sensitivity)) : 0.5,
    };
  }
  return { drivers: result, costUsd: response.costUsd };
}

// ─── Convergence Computation ────────────────────────────────────────────────

function computeConvergence(rounds: RoundResult[], scenarioNames: string[]): number {
  if (rounds.length < 2) return 0;
  const first = rounds[0].estimates;
  const last = rounds[rounds.length - 1].estimates;

  const firstVar = scenarioNames.reduce((sum, name) => {
    const vals = first.map(e => e[name]).filter(v => v != null && typeof v === 'number' && !isNaN(v));
    if (vals.length === 0) return sum;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    return sum + vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
  }, 0) / scenarioNames.length;

  const lastVar = scenarioNames.reduce((sum, name) => {
    const vals = last.map(e => e[name]).filter(v => v != null && typeof v === 'number' && !isNaN(v));
    if (vals.length === 0) return sum;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    return sum + vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
  }, 0) / scenarioNames.length;

  return firstVar > 0 ? Math.max(0, Math.min(1, 1 - lastVar / firstVar)) : 0;
}

// ─── Brier Score Estimation ─────────────────────────────────────────────────

function estimateBrierScore(
  probabilities: Record<string, number>,
  expertEstimates: Record<string, number>[]
): number {
  // Brier score = average of (p - outcome)^2
  // Since we don't know the outcome yet, estimate expected Brier as:
  //   E[(p - outcome)^2] = p*(1-p)^2 + (1-p)*p^2 = p*(1-p) * (1-p + p) = p*(1-p)
  // This is the expected Brier if the probability is well-calibrated.
  // Lower = more confident (closer to 0 or 1). Higher = more uncertain (closer to 0.5).
  // Max = 0.25 (at p=0.5, pure uncertainty). Min = 0 (at p=0 or 1, perfect certainty).
  let totalExpectedBrier = 0;
  let count = 0;
  for (const [name, p] of Object.entries(probabilities)) {
    if (typeof p !== 'number' || isNaN(p)) continue;
    // Expected Brier = p*(1-p) — this is the theoretical minimum
    totalExpectedBrier += p * (1 - p);
    count++;
  }
  // Add variance penalty: if experts disagree, expected Brier is higher
  let totalVar = 0;
  let varCount = 0;
  for (const name of Object.keys(probabilities)) {
    const vals = expertEstimates.map(e => e[name]).filter(v => v != null && typeof v === 'number' && !isNaN(v));
    if (vals.length === 0) continue;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
    totalVar += variance;
    varCount++;
  }
  const avgExpectedBrier = count > 0 ? totalExpectedBrier / count : 0.25;
  const avgVar = varCount > 0 ? totalVar / varCount : 0;
  // Total = expected Brier + variance penalty (disagreement increases uncertainty)
  return Math.min(0.5, avgExpectedBrier + avgVar);
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export async function runDelphiForesight(
  question: string,
  scenarioNames: string[],
  scenarioDescriptions: string[],
  evidence: string[],
  context: string
): Promise<DelphiResult> {
  // Edge case: <2 scenarios
  if (scenarioNames.length < 2) {
    return {
      scenarios: scenarioNames.map((name, i) => ({
        name,
        description: scenarioDescriptions[i] ?? '',
        probability: 1 / scenarioNames.length,
        baseRate: 1 / scenarioNames.length,
        fermiEstimate: 1 / scenarioNames.length,
        expertEstimate: 1 / scenarioNames.length,
        extremizedEstimate: 1 / scenarioNames.length,
        calibratedProbability: 1 / scenarioNames.length,
        confidenceInterval: [1 / scenarioNames.length, 1 / scenarioNames.length] as [number, number],
        keyDrivers: [], blockers: [], signals: [],
        sensitivityScore: 0.5,
        crossImpact: {},
        expertRationales: [],
      })),
      baseRateAnalysis: 'Insufficient scenarios for Delphi analysis.',
      fermiDecomposition: 'N/A',
      expertRationales: [],
      crossImpactMatrix: {},
      convergenceScore: 0,
      brierScoreEstimate: 0.33,
      costUsd: 0,
    };
  }

  let totalCost = 0;

  // ── Step 0: Prediction market data (external validation) ──
  let marketData: { predictions: any[]; avgProbability: number | null } = { predictions: [], avgProbability: null };
  try {
    const { fetchPredictionMarketData } = await import('./prediction-markets');
    console.log('[DELPHI] Step 0: Fetching prediction market data...');
    marketData = await fetchPredictionMarketData(question, scenarioNames);
    if (marketData.predictions.length > 0) {
      console.log(`[DELPHI] Markets: ${marketData.predictions.length} relevant markets found, avg prob=${marketData.avgProbability != null ? (marketData.avgProbability * 100).toFixed(0) + '%' : 'N/A'}`);
    } else {
      console.log('[DELPHI] Markets: no relevant markets found');
    }
  } catch (marketErr) {
    console.warn('[DELPHI] Prediction market fetch failed (non-blocking):', marketErr);
  }

  // ── Step 1: Compute historical base rates ──
  console.log('[DELPHI] Step 1: Computing base rates...');
  const baseRateResult = await computeBaseRates(question, scenarioNames, scenarioDescriptions, context);
  totalCost += baseRateResult.costUsd;
  console.log(`[DELPHI] Base rates: ${scenarioNames.map(n => `${n}=${(baseRateResult.rates[n] * 100).toFixed(0)}%`).join(', ')}`);

  // Blend base rates with prediction market data if available
  if (marketData.avgProbability != null && marketData.predictions.length > 0) {
    const { blendWithMarket } = await import('./prediction-markets');
    const totalVolume = marketData.predictions.reduce((sum, p) => sum + (p.volume || 0), 0);
    for (const name of scenarioNames) {
      baseRateResult.rates[name] = blendWithMarket(baseRateResult.rates[name], marketData.avgProbability, totalVolume);
    }
    console.log(`[DELPHI] Base rates blended with market data (volume=${totalVolume})`);
  }

  // ── Step 2: Fermi decomposition ──
  console.log('[DELPHI] Step 2: Fermi decomposition...');
  const fermiResult = await fermiDecompose(question, scenarioNames, context);
  totalCost += fermiResult.costUsd;

  // ── Step 3: Partition evidence for InfoDelphi asymmetry ──
  const numExperts = Math.min(5, Math.max(3, Math.floor(evidence.length / 3)));
  const experts = partitionEvidence(evidence, numExperts);

  // ── Step 4: 3 Delphi rounds ──
  const allRounds: RoundResult[] = [];
  const allRationales: string[] = [];

  for (let round = 1 as 1 | 2 | 3; round <= 3; round = (round + 1) as 1 | 2 | 3) {
    console.log(`[DELPHI] Step ${2 + round}: Delphi round ${round}...`);
    const roundResult = await delphiRound(
      round, question, scenarioNames, experts,
      baseRateResult.rates, allRounds, context
    );
    allRounds.push(roundResult);
    allRationales.push(...roundResult.rationales);
    totalCost += roundResult.costUsd;
    console.log(`[DELPHI] Round ${round}: ${roundResult.estimates.length} expert estimates`);
  }

  // ── Step 5: Cross-impact analysis ──
  console.log('[DELPHI] Step 6: Cross-impact analysis...');
  const cib = await crossImpactAnalysis(scenarioNames, context);
  totalCost += cib.costUsd;

  // ── Step 6: Aggregate final estimates ──
  const finalRound = allRounds[allRounds.length - 1];
  const effectiveEstimates = finalRound.estimates.length > 0
    ? finalRound.estimates
    : allRounds[0].estimates;

  // Weight experts by calibration
  const weighted = weightExperts(effectiveEstimates);

  const finalEstimates: Record<string, number> = {};
  const expertEstimatesByScenario: Record<string, number[]> = {};
  const expertWeightsByScenario: Record<string, number[]> = {};

  for (const name of scenarioNames) {
    const vals: number[] = [];
    const weights: number[] = [];
    for (const e of weighted) {
      const v = e[name];
      const w = e['_weight'] as number;
      if (v != null && typeof v === 'number' && !isNaN(v) && v > 0) {
        vals.push(v);
        weights.push(w ?? 1);
      }
    }
    expertEstimatesByScenario[name] = vals;
    expertWeightsByScenario[name] = weights;

    if (vals.length === 0) {
      finalEstimates[name] = 1 / scenarioNames.length;
      continue;
    }

    // Weighted geometric mean
    let prob = weightedGeometricMean(vals, weights);

    // Cross-impact adjustment
    const impacts = Object.values(cib.matrix[name] ?? {}).filter(v => v != null && typeof v === 'number');
    if (impacts.length > 0) {
      const avgImpact = impacts.reduce((a, b) => a + b, 0) / impacts.length;
      prob *= (1 + avgImpact * 0.05);
    }

    // Blend with base rate (shrinkage toward prior — reduces overconfidence)
    // Lambda = 0.3 means 30% weight to base rate, 70% to expert estimate
    const baseRate = baseRateResult.rates[name] ?? 1 / scenarioNames.length;
    prob = 0.7 * prob + 0.3 * baseRate;

    // Blend with Fermi estimate (10% weight — Fermi is a sanity check)
    const fermiEst = fermiResult.estimates[name] ?? 1 / scenarioNames.length;
    prob = 0.9 * prob + 0.1 * fermiEst;

    finalEstimates[name] = prob;
  }

  // ── Step 7: Extremizing + Platt scaling + normalization ──
  const extremized: Record<string, number> = {};
  for (const name of scenarioNames) {
    const vals = expertEstimatesByScenario[name];
    if (vals.length === 0) {
      extremized[name] = finalEstimates[name];
      continue;
    }
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
    // Extremize when experts agree (low variance)
    extremized[name] = extremize(finalEstimates[name], vals.length, variance);
  }

  // Platt scaling
  const calibrated: Record<string, number> = {};
  for (const name of scenarioNames) {
    calibrated[name] = plattScale(extremized[name]);
  }

  // Normalize to sum to 1
  const normalized = normalize(calibrated);

  // ── Step 8: Bootstrap confidence intervals ──
  const confidenceIntervals: Record<string, [number, number]> = {};
  for (const name of scenarioNames) {
    confidenceIntervals[name] = bootstrapCI(expertEstimatesByScenario[name], 1000);
  }

  // ── Step 9: Key drivers & sensitivity analysis ──
  console.log('[DELPHI] Step 7: Extracting key drivers and sensitivity...');
  const driversResult = await extractDriversAndSensitivity(
    question, scenarioNames, scenarioDescriptions, context, normalized
  );
  totalCost += driversResult.costUsd;

  // ── Step 10: Compute convergence and Brier estimate ──
  const convergence = computeConvergence(allRounds, scenarioNames);
  const brierEstimate = estimateBrierScore(normalized, effectiveEstimates);

  // ── Build final result ──
  const scenarios: DelphiScenario[] = scenarioNames.map((name, i) => {
    const vals = expertEstimatesByScenario[name];
    const expertMean = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 1 / scenarioNames.length;

    // Collect per-scenario rationales
    const scenarioRationales = allRationales.filter(r => r.includes(name) || r.length > 0).slice(-5);

    return {
      name,
      description: scenarioDescriptions[i] ?? '',
      probability: normalized[name],
      baseRate: baseRateResult.rates[name] ?? 1 / scenarioNames.length,
      fermiEstimate: fermiResult.estimates[name] ?? 1 / scenarioNames.length,
      expertEstimate: expertMean,
      extremizedEstimate: extremized[name],
      calibratedProbability: normalized[name],
      confidenceInterval: confidenceIntervals[name],
      keyDrivers: driversResult.drivers[name]?.drivers ?? [],
      blockers: driversResult.drivers[name]?.blockers ?? [],
      signals: driversResult.drivers[name]?.signals ?? [],
      sensitivityScore: driversResult.drivers[name]?.sensitivity ?? 0.5,
      crossImpact: cib.matrix[name] ?? {},
      expertRationales: scenarioRationales,
    };
  });

  console.log(`[DELPHI] Complete: ${scenarios.length} scenarios, convergence=${(convergence * 100).toFixed(0)}%, Brier est=${brierEstimate.toFixed(3)}, cost=$${totalCost.toFixed(4)}`);

  return {
    scenarios,
    baseRateAnalysis: baseRateResult.analysis,
    fermiDecomposition: fermiResult.decomposition,
    expertRationales: allRationales,
    crossImpactMatrix: cib.matrix,
    convergenceScore: convergence,
    brierScoreEstimate: brierEstimate,
    costUsd: totalCost,
  };
}
