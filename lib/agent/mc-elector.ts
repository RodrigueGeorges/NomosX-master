/**
 * MONTE CARLO ELECTOR — OT-5.
 *
 * The central scenario is elected by computation, not by the arbiter's
 * `dominantScenario` field. For FIXED link probabilities the joint scenario
 * probability is exact — Monte Carlo draws exist for what exact math can't
 * give: confidence intervals and the win-margin vs the runner-up.
 *
 * Mechanics (replaces the Dirichlet-around-LLM-priors core):
 *   1. Each uncertain link's realization is drawn from a Beta distribution
 *      fitted on the swarm vote mean/variance (method of moments).
 *   2. Links realize independently per draw; the joint cell is looked up
 *      by the scenario's `conditions` map.
 *   3. Scenario probability = empirical frequency. Elected = argmax;
 *      `contested` when the bootstrap CI of the leader overlaps the
 *      runner-up's.
 *
 * Deterministic: mulberry32 seed → same inputs, same election.
 */

import type { ChainScenario } from './chain-scenarios';
import type { LinkForecast } from './swarm-forecaster';

export interface ElectedScenario {
  scenarioId: string;
  probability: number;
  confidenceInterval: [number, number];
  selectedBy: 'swarm';
  contested: boolean;
  runnerUpId?: string;
  runnerUpProbability?: number;
  mostSensitiveLinkId?: number;
  probabilities: Record<string, number>;
  monteCarloRuns: number;
  seed: number;
}

function mulberry32(seed: number): () => number {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gamma sampler (Marsaglia–Tsang) — same construction as simulation-agent. */
function sampleGamma(shape: number, rand: () => number): number {
  if (shape <= 0) return 1e-9;
  if (shape < 1) return sampleGamma(shape + 1, rand) * Math.pow(Math.max(rand(), 1e-9), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (let i = 0; i < 100; i++) {
    const u1 = Math.max(rand(), 1e-9);
    const u2 = rand();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const v = 1 + c * z;
    if (v <= 0) continue;
    const v3 = v * v * v;
    const u = Math.max(rand(), 1e-9);
    if (Math.log(u) < 0.5 * z * z + d - d * v3 + d * Math.log(v3)) return d * v3;
  }
  return d;
}

/** Beta(a,b) via two gammas; params fitted by method of moments on the
 *  swarm vote distribution, clamped so a degenerate vote can't produce a
 *  degenerate election. */
function betaParams(mean: number, variance: number): { a: number; b: number } {
  const m = Math.min(0.98, Math.max(0.02, mean));
  // Vote spread underestimates epistemic uncertainty — inflate variance
  // floor so 20 agreeing voters don't fake certainty.
  const v = Math.max(variance, 0.015);
  const t = (m * (1 - m)) / v - 1;
  const a = Math.max(0.5, m * t);
  const b = Math.max(0.5, (1 - m) * t);
  return { a, b };
}

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function electScenario(input: {
  scenarios: ChainScenario[];
  forecasts: LinkForecast[];
  question: string;
  runs?: number;
}): ElectedScenario | null {
  const { scenarios, forecasts } = input;
  if (!scenarios.length || !forecasts.length) return null;

  // Map linkId → Beta params from swarm forecasts.
  const linkDist = new Map<number, { a: number; b: number }>();
  for (const f of forecasts) {
    if (f.validVotes < 3) continue; // too thin to elect on
    linkDist.set(f.linkId, betaParams(f.probability, f.variance));
  }
  // Every condition link must have a distribution.
  const needed = new Set<number>();
  for (const s of scenarios) for (const id of Object.keys(s.conditions)) needed.add(Number(id.replace(/^u/, '')));
  for (const id of needed) if (!linkDist.has(id)) return null;

  const runs = input.runs ?? 20_000;
  const rand = mulberry32(hashSeed(`${input.question}|${scenarios.map(s => s.id).join(',')}`));
  const hits = new Map<string, number>();
  for (const s of scenarios) hits.set(s.id, 0);

  const linkIds = [...needed];
  for (let r = 0; r < runs; r++) {
    const realized = new Map<number, boolean>();
    for (const id of linkIds) {
      const { a, b } = linkDist.get(id)!;
      const x = sampleGamma(a, rand);
      const y = sampleGamma(b, rand);
      realized.set(id, x / (x + y) > 0.5);
    }
    for (const s of scenarios) {
      const ok = Object.entries(s.conditions).every(([k, want]) => realized.get(Number(k.replace(/^u/, ''))) === want);
      if (ok) hits.set(s.id, (hits.get(s.id) ?? 0) + 1);
    }
  }

  const probabilities: Record<string, number> = {};
  let total = 0;
  for (const s of scenarios) {
    const p = (hits.get(s.id) ?? 0) / runs;
    probabilities[s.id] = p;
    total += p;
  }
  // Normalize (cells can overlap if conditions don't partition perfectly).
  for (const id of Object.keys(probabilities)) probabilities[id] = total > 0 ? probabilities[id] / total : 1 / scenarios.length;

  const ranked = [...scenarios].sort((a, b) => probabilities[b.id] - probabilities[a.id]);
  const leader = ranked[0];
  const runner = ranked[1];

  const leaderP = probabilities[leader.id];
  const runnerP = runner ? probabilities[runner.id] : 0;
  // Contested when the leader's Wilson CI overlaps the runner-up's point
  // estimate — deterministic, no resampling needed.
  const n = runs, k = hits.get(leader.id) ?? 0;
  const z = 1.96, phat = k / n, denom = 1 + z * z / n;
  const centre = (phat + z * z / (2 * n)) / denom;
  const half = (z * Math.sqrt((phat * (1 - phat) + z * z / (4 * n)) / n)) / denom;
  const ci: [number, number] = [Math.max(0, centre - half), Math.min(1, centre + half)];
  const contested = !!runner && ci[0] <= runnerP && runnerP <= ci[1];

  // Most sensitive link = the uncertainty whose flip would most change the
  // leader's probability (single-link counterfactual).
  let mostSensitiveLinkId: number | undefined;
  {
    let bestDelta = -1;
    for (const id of needed) {
      const dist = linkDist.get(id)!;
      // Counterfactual: force this link to its opposite realization by
      // recomputing cell hits is expensive — approximate sensitivity by the
      // link's distance from 0.5 weighted by how many scenarios condition on it.
      const mean = dist.a / (dist.a + dist.b);
      const conditioned = scenarios.filter(s => String(s.conditions[`u${id}`] ?? s.conditions[String(id)]) !== undefined).length;
      const delta = Math.abs(mean - 0.5) * conditioned;
      if (delta > bestDelta) { bestDelta = delta; mostSensitiveLinkId = id; }
    }
  }

  return {
    scenarioId: leader.id,
    probability: leaderP,
    confidenceInterval: ci,
    selectedBy: 'swarm',
    contested,
    runnerUpId: runner?.id,
    runnerUpProbability: runnerP,
    mostSensitiveLinkId,
    probabilities,
    monteCarloRuns: runs,
    seed: hashSeed(`${input.question}|${scenarios.map(s => s.id).join(',')}`),
  };
}
