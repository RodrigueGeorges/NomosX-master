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
 *   2. Per draw, each cell's probability is computed EXACTLY from the drawn
 *      link probabilities (product of p / 1-p). A link is never thresholded
 *      at 0.5: doing so turns two 60% links into a 62% joint instead of 36%.
 *   3. Published probability = exact cell probability at the pooled means.
 *      The draws give the 5-95% credible interval and `winShare` (share of
 *      draws where the leader beats the runner-up). `contested` = winShare
 *      below 0.8.
 *   4. When a 3-cell set drops "u2 without u1" (u2 derives from u1), u2's
 *      forecast is read as P(u2 | u1) and the "neither" cell carries the
 *      whole 1 - P(u1) mass, instead of renormalizing an independent product.
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
  /** Share of draws in which the elected cell beats the runner-up. */
  winShare: number;
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

/** Exact cell probabilities for one vector of link probabilities. */
function cellProbabilities(
  scenarios: ChainScenario[],
  p: Map<number, number>,
  conditionalChild: number | null,
  conditionalParent: number | null,
): number[] {
  const raw = scenarios.map(s => {
    let prob = 1;
    const cond = (id: number) => s.conditions[`u${id}`] ?? s.conditions[String(id)];
    for (const key of Object.keys(s.conditions)) {
      const id = Number(key.replace(/^u/, ''));
      const want = s.conditions[key];
      // Conditional child: P(child | parent) applies only when the parent
      // holds; when the parent fails the child cannot realize (prob 1 for
      // "child false", the "child true" cell does not exist).
      if (id === conditionalChild && conditionalParent != null && cond(conditionalParent) === false) {
        prob *= want ? 0 : 1;
        continue;
      }
      const pi = p.get(id) ?? 0.5;
      prob *= want ? pi : 1 - pi;
    }
    return prob;
  });
  const total = raw.reduce((a, b) => a + b, 0);
  return total > 0 ? raw.map(x => x / total) : raw.map(() => 1 / scenarios.length);
}

function linkIdOf(key: string): number {
  return Number(key.replace(/^u/, ''));
}

export function electScenario(input: {
  scenarios: ChainScenario[];
  forecasts: LinkForecast[];
  question: string;
  runs?: number;
}): ElectedScenario | null {
  const { scenarios, forecasts } = input;
  if (!scenarios.length || !forecasts.length) return null;

  const means = new Map<number, number>();
  const linkDist = new Map<number, { a: number; b: number }>();
  for (const f of forecasts) {
    if (f.validVotes < 3) continue; // too thin to elect on
    const m = Math.min(0.98, Math.max(0.02, f.probability));
    means.set(f.linkId, m);
    linkDist.set(f.linkId, betaParams(m, f.variance));
  }
  const needed = new Set<number>();
  for (const s of scenarios) for (const key of Object.keys(s.conditions)) needed.add(linkIdOf(key));
  for (const id of needed) if (!linkDist.has(id)) return null;
  const linkIds = [...needed];

  // Dependency detection: exactly two links, three cells, and the missing
  // cell is "parent false / child true" → child forecast is conditional.
  let conditionalChild: number | null = null;
  let conditionalParent: number | null = null;
  if (linkIds.length === 2 && scenarios.length === 3) {
    const [x, y] = linkIds;
    const has = (vx: boolean, vy: boolean) =>
      scenarios.some(s => s.conditions[`u${x}`] === vx && s.conditions[`u${y}`] === vy);
    if (!has(false, true) && has(true, true) && has(true, false) && has(false, false)) { conditionalParent = x; conditionalChild = y; }
    else if (!has(true, false) && has(true, true) && has(false, true) && has(false, false)) { conditionalParent = y; conditionalChild = x; }
  }

  // Point estimate: exact, at the pooled means. No sampling noise.
  const point = cellProbabilities(scenarios, means, conditionalChild, conditionalParent);
  const probabilities: Record<string, number> = {};
  scenarios.forEach((s, i) => { probabilities[s.id] = point[i]; });

  // Deterministic ranking: probability, then scenario id.
  const order = scenarios
    .map((s, i) => ({ s, i }))
    .sort((a, b) => point[b.i] - point[a.i] || a.s.id.localeCompare(b.s.id));
  const leader = order[0];
  const runner = order[1];

  // Draws: epistemic uncertainty on the link probabilities themselves.
  const runs = input.runs ?? 20_000;
  const seed = hashSeed(`${input.question}|${scenarios.map(s => s.id).join(',')}`);
  const rand = mulberry32(seed);
  const leaderDraws: number[] = new Array(runs);
  let wins = 0;
  const drawn = new Map<number, number>();
  for (let r = 0; r < runs; r++) {
    for (const id of linkIds) {
      const { a, b } = linkDist.get(id)!;
      const x = sampleGamma(a, rand);
      const y = sampleGamma(b, rand);
      drawn.set(id, x / (x + y));
    }
    const cells = cellProbabilities(scenarios, drawn, conditionalChild, conditionalParent);
    leaderDraws[r] = cells[leader.i];
    if (!runner || cells[leader.i] >= cells[runner.i]) wins++;
  }
  leaderDraws.sort((a, b) => a - b);
  const ci: [number, number] = [
    leaderDraws[Math.floor(runs * 0.05)],
    leaderDraws[Math.min(runs - 1, Math.floor(runs * 0.95))],
  ];
  const winShare = wins / runs;
  const contested = !!runner && winShare < 0.8;

  // Most sensitive link: the one whose ±0.05 move changes the leader's
  // probability the most (exact finite difference).
  let mostSensitiveLinkId: number | undefined;
  let bestDelta = -1;
  for (const id of linkIds) {
    const base = means.get(id)!;
    const up = new Map(means).set(id, Math.min(0.98, base + 0.05));
    const down = new Map(means).set(id, Math.max(0.02, base - 0.05));
    const delta = Math.abs(
      cellProbabilities(scenarios, up, conditionalChild, conditionalParent)[leader.i] -
      cellProbabilities(scenarios, down, conditionalChild, conditionalParent)[leader.i],
    );
    if (delta > bestDelta + 1e-12) { bestDelta = delta; mostSensitiveLinkId = id; }
  }

  return {
    scenarioId: leader.s.id,
    probability: point[leader.i],
    confidenceInterval: ci,
    selectedBy: 'swarm',
    contested,
    winShare,
    runnerUpId: runner?.s.id,
    runnerUpProbability: runner ? point[runner.i] : 0,
    mostSensitiveLinkId,
    probabilities,
    monteCarloRuns: runs,
    seed,
  };
}
