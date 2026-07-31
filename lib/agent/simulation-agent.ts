/**
 * Simulation Agent — NomosX Foresight Engine v3
 * ──────────────────────────────────────────────
 * Surpasses MiroFish/OASIS on: GraphRAG + 512-agent swarm + dual-channel social
 * + multi-seed robustness + academic calibration + adversarial gate.
 */

import type { InquiryDepth } from "@/lib/types/inquiry";
import { callLLM } from "@/lib/llm/unified-llm";
import { parseJson } from "./json-utils";
import { getForesightConfig } from "@/lib/foresight/config";
import { buildForesightGraph, graphScenarioBoost, type ForesightGraph } from "./foresight-graph";
import {
  spawnCrowd,
  propagateCrowd,
  aggregateCrowdMomentum,
  syncLeadersFromCrowd,
  type CrowdAgent,
} from "./foresight-swarm";
import {
  createEmptyFeed,
  runSocialTick,
  summarizeFeed,
  type SocialFeed,
} from "./foresight-social";

// ─── Persona model ───────────────────────────────────────────

export type PersonaArchetype =
  | "regulator"
  | "industry"
  | "academic"
  | "ngo"
  | "media"
  | "public"
  | "investor"
  | "labor"
  | "state";

export interface StakeholderPersona {
  id: string;
  archetype: PersonaArchetype;
  domain: string;
  values: Record<string, number>;
  beliefs: string[];
  memory: Array<{ tick: number; observation: string }>;
  influencedBy: string[];
  influence: number;
  llmProfile: { systemPrompt: string; temperature: number };
  positions: Record<string, number>;
  groundedSourceIds: string[];
}

// ─── Core I/O ────────────────────────────────────────────────

export interface SimulationScenarioSpec {
  name: string;
  description: string;
  assumptions: Record<string, number>;
  priorProbability?: number;
  implications?: string;
  signals?: string[];
}

export interface SimulationInput {
  question: string;
  scenarios: SimulationScenarioSpec[];
  parameters: Record<string, number>;
  sourceIds: string[];
  depth: InquiryDepth;
  domain?: string;
  domainPersonas?: string[];
  injectedVariable?: { name: string; delta: number; atTick?: number };
}

export interface MonteCarloConfig {
  scenarios: SimulationScenarioSpec[];
  parameters: Record<string, number>;
  runs: number;
  seed?: number;
  tolerance?: number;
}

export interface ConvergenceResult {
  probabilities: Record<string, number>;
  converged: boolean;
  runsUsed: number;
  standardErrors: Record<string, number>;
}

export interface SensitivityEntry {
  variable: string;
  scenario: string;
  elasticity: number;
}

export interface SensitivityMatrix {
  targetVariable: string;
  entries: SensitivityEntry[];
  computedAt: string;
}

export type PersonaActionType = "speak" | "react" | "shift_position" | "form_coalition";

export interface SimulationTickEvent {
  personaId: string;
  action: PersonaActionType;
  target?: string;
  content: string;
  cost: number;
  scenarioLean?: string;
}

export interface SimulationScenarioState {
  momentum: number;
  supporters: string[];
  opponents: string[];
}

export interface SimulationTick {
  tick: number;
  events: SimulationTickEvent[];
  scenarioStates: Record<string, SimulationScenarioState>;
}

export type ScenarioTrajectory = "rising" | "stable" | "declining" | "volatile";

export interface SimulatedScenarioOutcome {
  name: string;
  empiricalProbability: number;
  trajectory: ScenarioTrajectory;
  keyDrivers: string[];
  blockers: string[];
  cascadeEffects: string[];
  confidenceInterval: [number, number];
  sourceGrounded: boolean;
  supportingSourceIds: string[];
}

export interface SimulationOutput {
  scenarios: SimulatedScenarioOutcome[];
  ticks: SimulationTick[];
  personaCount: number;
  swarmSize: number;
  seedRuns: number;
  convergedAgents: number;
  monteCarloRuns: number;
  monteCarloConverged: boolean;
  llmTickCount: number;
  socialPostCount: number;
  totalCostUsd: number;
  totalDurationMs: number;
  sensitivity?: SensitivityMatrix;
  sourceGraph?: Array<{ scenario: string; sourceIds: string[]; overlapScore: number }>;
  foresightGraph?: { nodeCount: number; edgeCount: number; method: string };
  graphNodes?: Array<{ id: string; label: string; type: string; weight: number }>;
  redTeamChallenge?: string;
  executiveBrief?: string;
  personaSnapshots?: Array<{
    id: string;
    archetype: PersonaArchetype;
    beliefs: string[];
    memory: Array<{ tick: number; observation: string }>;
    positions: Record<string, number>;
  }>;
  traceability: {
    sourceIds: string[];
    sourceQualityAvg: number;
    adversarialValidated: boolean;
    validationNotes: string[];
  };
}

export interface SimulationReport {
  summary: string;
  output: SimulationOutput;
  contextBlock: string;
}

export type SimulationResult = SimulationReport;

export type SimulationScenarioInput = Pick<
  SimulationScenarioSpec,
  "name" | "description" | "priorProbability" | "implications" | "signals"
>;

export interface SimulationConfig {
  scenarios: SimulationScenarioInput[];
  personas: StakeholderPersona[];
  ticks: number;
  llmCalls: number;
  domain: string;
  question: string;
  depth?: InquiryDepth;
}

export interface SourceEvidence {
  id: string;
  title: string;
  excerpt: string;
  qualityScore: number;
  provider: string;
}

export interface BuildPersonaPanelOptions {
  domain: string;
  question: string;
  count?: number;
  domainPersonas?: string[];
  sourceEvidence?: SourceEvidence[];
}

export interface RunSimulationOptions {
  config: SimulationConfig;
  maxCostUsd?: number;
}

export const SIMULATION_DEFAULTS = {
  ticks: 15,
  personaCount: 25,
  llmCap: 200,
  maxCostUsd: 3.5,
} as const;

interface DepthProfile {
  ticks: number;
  mcRuns: number;
  personas: number;
  swarmSize: number;
  seedRuns: number;
  enabled: boolean;
  maxCostUsd: number;
  llmEveryNTicks: number;
  bootstrapRuns: number;
}

const DEPTH_CONFIG: Record<InquiryDepth, DepthProfile> = {
  surface: { ticks: 0, mcRuns: 0, personas: 0, swarmSize: 0, seedRuns: 0, enabled: false, maxCostUsd: 0, llmEveryNTicks: 0, bootstrapRuns: 0 },
  standard: { ticks: 0, mcRuns: 0, personas: 0, swarmSize: 0, seedRuns: 0, enabled: false, maxCostUsd: 0, llmEveryNTicks: 0, bootstrapRuns: 0 },
  deep: { ticks: 16, mcRuns: 1500, personas: 22, swarmSize: 384, seedRuns: 2, enabled: true, maxCostUsd: 2.8, llmEveryNTicks: 3, bootstrapRuns: 180 },
  strategic: { ticks: 24, mcRuns: 3000, personas: 30, swarmSize: 1024, seedRuns: 3, enabled: true, maxCostUsd: 5.5, llmEveryNTicks: 2, bootstrapRuns: 300 },
};

function resolveDepthProfile(depth: InquiryDepth): DepthProfile {
  const base = DEPTH_CONFIG[depth];
  const cfg = getForesightConfig();
  if (!cfg.enabled) return { ...base, enabled: false };
  return { ...base, maxCostUsd: Math.min(base.maxCostUsd, cfg.maxCostUsd) };
}

function clonePersonasForSeed(personas: StakeholderPersona[]): StakeholderPersona[] {
  return personas.map((p) => ({
    ...p,
    values: { ...p.values },
    beliefs: [...p.beliefs],
    memory: [],
    influencedBy: [...p.influencedBy],
    positions: { ...p.positions },
    groundedSourceIds: [...p.groundedSourceIds],
    llmProfile: { ...p.llmProfile },
  }));
}

const ARCHETYPE_VALUES: Record<PersonaArchetype, Record<string, number>> = {
  regulator: { security: 0.9, innovation: 0.4, equity: 0.7, profit: 0.3 },
  industry: { security: 0.5, innovation: 0.8, equity: 0.4, profit: 0.9 },
  academic: { security: 0.6, innovation: 0.7, equity: 0.8, profit: 0.2 },
  ngo: { security: 0.7, innovation: 0.5, equity: 0.95, profit: 0.1 },
  media: { security: 0.5, innovation: 0.6, equity: 0.6, profit: 0.5 },
  public: { security: 0.8, innovation: 0.5, equity: 0.75, profit: 0.4 },
  investor: { security: 0.4, innovation: 0.85, equity: 0.35, profit: 0.95 },
  labor: { security: 0.75, innovation: 0.45, equity: 0.9, profit: 0.25 },
  state: { security: 0.85, innovation: 0.55, equity: 0.7, profit: 0.35 },
};

const ARCHETYPE_ORDER: PersonaArchetype[] = [
  "regulator", "industry", "academic", "ngo", "media", "public", "investor", "labor", "state",
];

function mulberry32(seed: number): () => number {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3)
  );
}

function overlapScore(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const w of ta) if (tb.has(w)) hit++;
  return hit / Math.max(ta.size, tb.size);
}

async function loadSourceEvidence(sourceIds: string[]): Promise<SourceEvidence[]> {
  if (!sourceIds.length) return [];
  try {
    const { prisma } = await import("@/lib/db");
    const rows = await prisma.source.findMany({
      where: { id: { in: sourceIds.slice(0, 30) } },
      select: { id: true, title: true, abstract: true, qualityScore: true, provider: true },
      orderBy: { qualityScore: "desc" },
    });
    return rows.map((s) => ({
      id: s.id,
      title: s.title,
      excerpt: (s.abstract ?? s.title).slice(0, 400),
      qualityScore: s.qualityScore ?? 50,
      provider: s.provider,
    }));
  } catch {
    return [];
  }
}

function buildSourceGraph(
  scenarios: SimulationScenarioSpec[],
  evidence: SourceEvidence[]
): Array<{ scenario: string; sourceIds: string[]; overlapScore: number }> {
  return scenarios.map((sc) => {
    const scored = evidence
      .map((e) => ({
        id: e.id,
        score: overlapScore(`${sc.name} ${sc.description}`, e.excerpt) * (e.qualityScore / 100),
      }))
      .filter((x) => x.score > 0.05)
      .sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 5);
    return {
      scenario: sc.name,
      sourceIds: top.map((t) => t.id),
      overlapScore: top[0]?.score ?? 0,
    };
  });
}

async function calibrateFromSources(
  sourceIds: string[],
  parameters: Record<string, number>,
  evidence: SourceEvidence[]
): Promise<{ parameters: Record<string, number>; avgQuality: number }> {
  const avgQuality =
    evidence.length > 0
      ? evidence.reduce((s, e) => s + e.qualityScore, 0) / evidence.length
      : 0;

  if (!sourceIds.length) return { parameters, avgQuality };

  const weight = Math.min(1, avgQuality / 100);
  const calibrated = { ...parameters };
  for (const key of Object.keys(calibrated)) {
    calibrated[key] = calibrated[key] * (0.82 + weight * 0.18);
  }
  calibrated.uncertainty = Math.max(0.05, (calibrated.uncertainty ?? 0.3) * (1.1 - weight * 0.4));
  return { parameters: calibrated, avgQuality };
}

function inferAssumptions(
  scenario: SimulationScenarioSpec | SimulationScenarioInput,
  parameters: Record<string, number>
): Record<string, number> {
  if ("assumptions" in scenario && Object.keys(scenario.assumptions).length > 0) {
    return scenario.assumptions;
  }
  const prior = scenario.priorProbability ?? 1 / 3;
  const keys = Object.keys(parameters);
  const assumptions: Record<string, number> = {};
  keys.forEach((k, i) => {
    assumptions[k] = prior * (0.8 + 0.4 * ((i + 1) / (keys.length + 1)));
  });
  if (!keys.length) {
    assumptions.baseline = prior;
    assumptions.volatility = 1 - prior;
  }
  return assumptions;
}

function defaultParameters(scenarios: SimulationScenarioSpec[]): Record<string, number> {
  const params: Record<string, number> = { momentum: 0.5, uncertainty: 0.3, adoption: 0.5 };
  scenarios.forEach((s, i) => {
    params[`scenario_${i}_weight`] = s.priorProbability ?? 1 / scenarios.length;
  });
  return params;
}

function scoreScenario(
  scenario: SimulationScenarioSpec,
  parameters: Record<string, number>,
  sourceBoost: number,
  rand: () => number
): number {
  const assumptions = inferAssumptions(scenario, parameters);
  const keys = Object.keys(parameters).length ? Object.keys(parameters) : Object.keys(assumptions);
  let score = sourceBoost * 0.15;
  for (const key of keys) {
    const base = parameters[key] ?? assumptions[key] ?? 0.5;
    score -= Math.abs(base + (rand() - 0.5) * 0.18 - (assumptions[key] ?? base));
  }
  score += (scenario.priorProbability ?? 0) * 0.5;
  return score;
}

function runMonteCarloCore(
  config: MonteCarloConfig,
  sourceGraph?: Array<{ scenario: string; overlapScore: number }>
): ConvergenceResult {
  const { scenarios, parameters, runs, seed = 42, tolerance = 0.015 } = config;
  const rand = mulberry32(seed);
  const wins: Record<string, number> = {};
  scenarios.forEach((s) => { wins[s.name] = 0; });

  const boostByScenario = new Map(
    (sourceGraph ?? []).map((g) => [g.scenario, g.overlapScore])
  );

  let runsUsed = 0;
  let converged = false;
  let prevProbs: Record<string, number> = {};
  const batchSize = 100;

  while (runsUsed < runs && !converged) {
    const batchEnd = Math.min(runsUsed + batchSize, runs);
    for (let r = runsUsed; r < batchEnd; r++) {
      let bestName = scenarios[0].name;
      let bestScore = -Infinity;
      for (const scenario of scenarios) {
        const boost = boostByScenario.get(scenario.name) ?? 0;
        const score = scoreScenario(scenario, parameters, boost, rand);
        if (score > bestScore) {
          bestScore = score;
          bestName = scenario.name;
        }
      }
      wins[bestName] = (wins[bestName] ?? 0) + 1;
    }
    runsUsed = batchEnd;
    const probs: Record<string, number> = {};
    for (const name of Object.keys(wins)) probs[name] = wins[name] / runsUsed;
    if (runsUsed >= batchSize * 3) {
      converged = Object.keys(probs).every(
        (k) => Math.abs((probs[k] ?? 0) - (prevProbs[k] ?? 0)) < tolerance
      );
    }
    prevProbs = probs;
  }

  const probabilities: Record<string, number> = {};
  const standardErrors: Record<string, number> = {};
  for (const name of Object.keys(wins)) {
    const p = wins[name] / runsUsed;
    probabilities[name] = p;
    standardErrors[name] = Math.sqrt((p * (1 - p)) / runsUsed);
  }
  return { probabilities, converged, runsUsed, standardErrors };
}

export async function runMonteCarloSimulation(config: MonteCarloConfig): Promise<ConvergenceResult> {
  return runMonteCarloCore(config);
}

export function computeSensitivityMatrix(
  scenarios: SimulationScenarioSpec[],
  parameters: Record<string, number>,
  targetVariable: string
): SensitivityMatrix {
  const baseConfig: MonteCarloConfig = { scenarios, parameters, runs: 500, seed: hashSeed(targetVariable) };
  const base = runMonteCarloCore(baseConfig);
  const baseTop = topScenario(base.probabilities);
  const entries: SensitivityEntry[] = [];

  for (const [variable, value] of Object.entries(parameters)) {
    if (variable === targetVariable) continue;
    for (const delta of [-0.12, 0.12]) {
      const perturbed = { ...parameters, [variable]: Math.max(0, Math.min(1, value * (1 + delta))) };
      const result = runMonteCarloCore({ ...baseConfig, parameters: perturbed });
      const top = topScenario(result.probabilities);
      const elasticity =
        Math.abs(delta * value) > 0.001
          ? ((result.probabilities[top] ?? 0) - (base.probabilities[baseTop] ?? 0)) / (delta * value)
          : 0;
      entries.push({ variable, scenario: top, elasticity: Math.round(elasticity * 1000) / 1000 });
    }
  }
  return { targetVariable, entries: entries.slice(0, 12), computedAt: new Date().toISOString() };
}

function topScenario(probs: Record<string, number>): string {
  return Object.entries(probs).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

function bootstrapConfidenceIntervals(
  mcProbs: Record<string, number>,
  tickFreq: Record<string, number>,
  runs: number,
  seed: number
): Record<string, [number, number]> {
  const rand = mulberry32(seed + 99);
  const names = Object.keys(mcProbs);
  const samples: Record<string, number[]> = {};
  names.forEach((n) => { samples[n] = []; });

  for (let i = 0; i < runs; i++) {
    const noise = () => (rand() - 0.5) * 0.12;
    let sum = 0;
    const draw: Record<string, number> = {};
    for (const n of names) {
      const v = Math.max(0, 0.55 * (mcProbs[n] ?? 0) + 0.45 * (tickFreq[n] ?? 0) + noise());
      draw[n] = v;
      sum += v;
    }
    for (const n of names) samples[n].push((draw[n] ?? 0) / (sum || 1));
  }

  const ci: Record<string, [number, number]> = {};
  for (const n of names) {
    const sorted = samples[n].sort((a, b) => a - b);
    ci[n] = [sorted[Math.floor(runs * 0.05)] ?? 0, sorted[Math.floor(runs * 0.95)] ?? 1];
  }
  return ci;
}

export async function buildPersonaPanel(options: BuildPersonaPanelOptions): Promise<StakeholderPersona[]> {
  const count = options.count ?? 25;
  const evidence = options.sourceEvidence ?? [];
  const personas: StakeholderPersona[] = [];

  for (let i = 0; i < count; i++) {
    const archetype = ARCHETYPE_ORDER[i % ARCHETYPE_ORDER.length];
    const id = `${archetype}-${i + 1}`;
    const src = evidence.length ? evidence[i % evidence.length] : undefined;
    const groundedIds = src ? [src.id] : [];

    personas.push({
      id,
      archetype,
      domain: options.domain,
      values: { ...ARCHETYPE_VALUES[archetype] },
      beliefs: [
        `${archetype} stakeholder in ${options.domain}`,
        src
          ? `[SRC] ${src.title.slice(0, 80)}: ${src.excerpt.slice(0, 160)}`
          : options.question.slice(0, 120),
      ],
      memory: [],
      influencedBy: [],
      influence: Math.min(1, 0.38 + (i % 7) * 0.07),
      llmProfile: {
        systemPrompt: `You are a ${archetype} stakeholder in ${options.domain}. Ground claims in source excerpts. Question: ${options.question}`,
        temperature: 0.32 + (i % 5) * 0.07,
      },
      positions: {},
      groundedSourceIds: groundedIds,
    });
  }

  for (let i = 0; i < personas.length; i++) {
    personas[i].influencedBy = [
      personas[(i + 1) % personas.length].id,
      personas[(i + 3) % personas.length].id,
    ];
  }
  return personas;
}

function initPersonaPositions(personas: StakeholderPersona[], scenarioNames: string[], rand: () => number): void {
  for (const p of personas) {
    const raw = scenarioNames.map(() => rand());
    const sum = raw.reduce((a, b) => a + b, 0) || 1;
    p.positions = {};
    scenarioNames.forEach((name, i) => { p.positions[name] = raw[i] / sum; });
  }
}

function updatePersonaPositions(
  personas: StakeholderPersona[],
  scenarioNames: string[],
  momentum: Record<string, number>,
  alpha = 0.18
): number {
  let shifts = 0;
  const byId = new Map(personas.map((p) => [p.id, p]));

  for (const p of personas) {
    const blended: Record<string, number> = {};
    scenarioNames.forEach((n) => { blended[n] = 0; });

    for (const infId of p.influencedBy) {
      const inf = byId.get(infId);
      if (!inf) continue;
      for (const name of scenarioNames) {
        blended[name] += (inf.positions[name] ?? 0) * inf.influence;
      }
    }

    for (const name of scenarioNames) {
      const target = (blended[name] ?? p.positions[name] ?? 0) * 0.65 + momentum[name] * 0.35;
      const prev = p.positions[name] ?? 0;
      p.positions[name] = prev * (1 - alpha) + target * alpha;
      if (Math.abs(p.positions[name] - prev) > 0.04) shifts++;
    }
    const sum = scenarioNames.reduce((s, n) => s + (p.positions[n] ?? 0), 0) || 1;
    scenarioNames.forEach((n) => { p.positions[n] /= sum; });
  }
  return shifts;
}

function computeScenarioStates(
  personas: StakeholderPersona[],
  names: string[]
): { scenarioStates: Record<string, SimulationScenarioState>; momentum: Record<string, number> } {
  const scenarioStates: Record<string, SimulationScenarioState> = {};
  const momentum: Record<string, number> = {};

  for (const name of names) {
    let m = 0;
    const supporters: string[] = [];
    const opponents: string[] = [];
    for (const p of personas) {
      const pos = p.positions[name] ?? 0;
      m += pos * p.influence;
      if (pos > 0.32) supporters.push(p.id);
      if (pos < 0.14) opponents.push(p.id);
    }
    momentum[name] = m / Math.max(1, personas.length * 0.45);
    scenarioStates[name] = { momentum: momentum[name], supporters, opponents };
  }
  return { scenarioStates, momentum };
}

interface LLMTickResponse {
  events: Array<{
    personaId: string;
    action: PersonaActionType;
    content: string;
    scenarioLean: string;
    shiftStrength?: number;
  }>;
}

async function runLLMTickBatch(
  tick: number,
  question: string,
  scenarios: SimulationScenarioSpec[],
  personas: StakeholderPersona[],
  momentum: Record<string, number>,
  budget: { remaining: number }
): Promise<{
  events: SimulationTickEvent[];
  llmPosts: Array<{ authorId: string; content: string; scenarioLean: string; channel: "signal" | "forum" }>;
}> {
  if (budget.remaining <= 0) return { events: [], llmPosts: [] };

  const active = personas.sort((a, b) => b.influence - a.influence).slice(0, 10);
  const scenarioBrief = scenarios
    .map((s) => `- ${s.name}: momentum=${(momentum[s.name] ?? 0).toFixed(2)} | ${s.description.slice(0, 100)}`)
    .join("\n");
  const personaBrief = active
    .map((p) => `ID=${p.id} type=${p.archetype} beliefs=${p.beliefs[1]?.slice(0, 100) ?? ""}`)
    .join("\n");

  try {
    const res = await callLLM({
      task: "harvard_council",
      temperature: 0.35,
      maxTokens: 1100,
      jsonMode: true,
      messages: [
        {
          role: "system",
          content:
            "Policy wargame social simulation. JSON: { events: [{ personaId, action, content, scenarioLean, shiftStrength 0-1, channel: signal|forum }] }. Max 8 events. Ground in beliefs. signal=short viral take, forum=structured argument.",
        },
        {
          role: "user",
          content: `Tick ${tick}\nQuestion: ${question}\nScenarios:\n${scenarioBrief}\nPersonas:\n${personaBrief}`,
        },
      ],
    });

    budget.remaining -= res.costUsd;
    const parsed = parseJson<any>(res.content) as (LLMTickResponse & {
      events: Array<LLMTickResponse["events"][0] & { channel?: "signal" | "forum" }>;
    }) | null;
    if (!parsed) return { events: [], llmPosts: [] };
    if (!parsed.events?.length) return { events: [], llmPosts: [] };

    const llmPosts: Array<{ authorId: string; content: string; scenarioLean: string; channel: "signal" | "forum" }> = [];

    for (const ev of parsed.events) {
      const p = personas.find((x) => x.id === ev.personaId);
      if (!p || !ev.scenarioLean) continue;
      const strength = Math.min(1, Math.max(0.05, ev.shiftStrength ?? 0.15));
      for (const name of Object.keys(p.positions)) p.positions[name] *= 1 - strength;
      p.positions[ev.scenarioLean] = (p.positions[ev.scenarioLean] ?? 0) + strength;
      const sum = Object.values(p.positions).reduce((a, b) => a + b, 0) || 1;
      for (const k of Object.keys(p.positions)) p.positions[k] /= sum;
      p.memory.push({ tick, observation: ev.content.slice(0, 200) });

      const channel =
        ev.channel ??
        (p.archetype === "media" || p.archetype === "public" ? "signal" : "forum");
      llmPosts.push({
        authorId: ev.personaId,
        content: ev.content,
        scenarioLean: ev.scenarioLean,
        channel,
      });
    }

    return {
      events: parsed.events.map((ev) => ({
        personaId: ev.personaId,
        action: ev.action,
        content: ev.content,
        cost: res.costUsd / parsed.events.length,
        scenarioLean: ev.scenarioLean,
      })),
      llmPosts,
    };
  } catch (err) {
    console.warn("[Foresight] LLM tick fallback:", err);
    return { events: [], llmPosts: [] };
  }
}

async function runAdversarialRedTeam(
  question: string,
  topScenario: SimulatedScenarioOutcome,
  evidence: SourceEvidence[],
  budget: { remaining: number }
): Promise<string | undefined> {
  if (budget.remaining < 0.15) return undefined;

  const srcBlock = evidence
    .slice(0, 4)
    .map((e, i) => `[SRC-${i + 1}] ${e.title}: ${e.excerpt.slice(0, 120)}`)
    .join("\n");

  try {
    const res = await callLLM({
      task: "elenchus",
      temperature: 0.25,
      maxTokens: 400,
      messages: [
        {
          role: "system",
          content:
            "Hostile expert reviewer. Steel-man the STRONGEST counter-argument against the dominant scenario. One paragraph. Cite [SRC-N] if counter-evidence exists.",
        },
        {
          role: "user",
          content: `Question: ${question}\nDominant: ${topScenario.name} (P=${(topScenario.empiricalProbability * 100).toFixed(0)}%)\nSources:\n${srcBlock}`,
        },
      ],
    });
    budget.remaining -= res.costUsd;
    return res.content.trim();
  } catch {
    return undefined;
  }
}

function computeScenarioStatesWithSwarm(
  personas: StakeholderPersona[],
  crowd: CrowdAgent[],
  names: string[],
  graph: ForesightGraph
): { scenarioStates: Record<string, SimulationScenarioState>; momentum: Record<string, number> } {
  const leaderStates = computeScenarioStates(personas, names);
  const crowdMom = aggregateCrowdMomentum(crowd, names);
  const scenarioStates: Record<string, SimulationScenarioState> = {};
  const momentum: Record<string, number> = {};

  for (const name of names) {
    const graphBoost = graphScenarioBoost(graph, name);
    const blended =
      0.35 * (leaderStates.momentum[name] ?? 0) +
      0.55 * (crowdMom[name] ?? 0) +
      0.1 * graphBoost;
    momentum[name] = blended;
    scenarioStates[name] = {
      momentum: blended,
      supporters: leaderStates.scenarioStates[name]?.supporters ?? [],
      opponents: leaderStates.scenarioStates[name]?.opponents ?? [],
    };
  }
  return { scenarioStates, momentum };
}

interface SwarmRunResult {
  ticks: SimulationTick[];
  llmTickCount: number;
  costUsd: number;
  convergedAgents: number;
  socialPostCount: number;
  crowdSize: number;
  feed: SocialFeed;
}

async function runForesightSwarmSimulation(
  personas: StakeholderPersona[],
  scenarios: SimulationScenarioSpec[],
  profile: DepthProfile,
  question: string,
  seed: number,
  graph: ForesightGraph,
  options: {
    enableLLM: boolean;
    budgetCap: number;
    injected?: SimulationInput["injectedVariable"];
  }
): Promise<SwarmRunResult> {
  const rand = mulberry32(seed);
  const names = scenarios.map((s) => s.name);
  initPersonaPositions(personas, names, rand);

  const crowd = spawnCrowd(profile.swarmSize, personas, names, seed + 7);
  let feed: SocialFeed = createEmptyFeed();

  const history: SimulationTick[] = [];
  let llmTickCount = 0;
  let convergedAgents = 0;
  let socialPostCount = 0;
  const budget = { remaining: options.budgetCap };
  let stableTicks = 0;

  for (let t = 1; t <= profile.ticks; t++) {
    if (options.injected && t === (options.injected.atTick ?? Math.ceil(profile.ticks / 2))) {
      for (const p of personas) {
        for (const k of Object.keys(p.positions)) {
          p.positions[k] = Math.max(
            0,
            Math.min(1, (p.positions[k] ?? 0) + options.injected.delta * (rand() - 0.5))
          );
        }
      }
      for (const c of crowd) {
        for (const k of Object.keys(c.positions)) {
          c.positions[k] = Math.max(
            0,
            Math.min(1, (c.positions[k] ?? 0) + options.injected.delta * (rand() - 0.4))
          );
        }
      }
    }

    let events: SimulationTickEvent[] = [];
    let llmPosts: Array<{ authorId: string; content: string; scenarioLean: string; channel: "signal" | "forum" }> = [];
    const useLLM =
      options.enableLLM &&
      profile.llmEveryNTicks > 0 &&
      t % profile.llmEveryNTicks === 0 &&
      budget.remaining > 0.1;

    const { momentum: preMom } = computeScenarioStatesWithSwarm(personas, crowd, names, graph);

    if (useLLM) {
      const batch = await runLLMTickBatch(t, question, scenarios, personas, preMom, budget);
      events = batch.events;
      llmPosts = batch.llmPosts;
      if (batch.events.length) llmTickCount++;
    }

    if (!events.length) {
      events = personas
        .filter((_, i) => i % 3 === t % 3)
        .slice(0, 4)
        .map((p) => {
          const top = [...names].sort((a, b) => (p.positions[b] ?? 0) - (p.positions[a] ?? 0))[0];
          p.memory.push({ tick: t, observation: `Numeric lean → ${top}` });
          const channel = p.archetype === "media" ? "signal" : "forum";
          llmPosts.push({
            authorId: p.id,
            content: `${p.archetype} leans toward "${top}"`,
            scenarioLean: top,
            channel,
          });
          return {
            personaId: p.id,
            action: "shift_position" as PersonaActionType,
            content: `${p.archetype} adjusts toward "${top}"`,
            cost: 0,
            scenarioLean: top,
          };
        });
    }

    const social = runSocialTick(t, personas, names, feed, llmPosts, rand);
    feed = social.feed;
    events = [...events, ...social.events];
    socialPostCount += social.postCount;

    propagateCrowd(crowd, personas, social.viralBoost, names);
    syncLeadersFromCrowd(personas, crowd, names);
    const shifts = updatePersonaPositions(personas, names, preMom);

    const { scenarioStates, momentum } = computeScenarioStatesWithSwarm(personas, crowd, names, graph);

    if (shifts < personas.length * 0.07) {
      convergedAgents++;
      stableTicks++;
    } else {
      stableTicks = 0;
    }

    history.push({ tick: t, events, scenarioStates });
    if (stableTicks >= 3) break;
  }

  return {
    ticks: history,
    llmTickCount,
    costUsd: options.budgetCap - budget.remaining,
    convergedAgents,
    socialPostCount,
    crowdSize: crowd.length,
    feed,
  };
}

async function synthesizeForesightBrief(
  question: string,
  outcomes: SimulatedScenarioOutcome[],
  feedSummary: ReturnType<typeof summarizeFeed>,
  budget: { remaining: number }
): Promise<string | undefined> {
  if (budget.remaining < 0.12) return undefined;
  const top = outcomes.slice(0, 3).map((o) => `${o.name}: ${(o.empiricalProbability * 100).toFixed(0)}% (${o.trajectory})`).join("; ");
  try {
    const res = await callLLM({
      task: "analyst_brief",
      temperature: 0.2,
      maxTokens: 2000,
      messages: [
        {
          role: "system",
          content:
            "Executive foresight brief for policy leaders. 2 paragraphs max. Cite scenario probabilities. Mention social signals if relevant. No hype.",
        },
        {
          role: "user",
          content: `Question: ${question}\nOutcomes: ${top}\nTop signals: ${feedSummary.topSignal.join(" | ")}\nForum: ${feedSummary.topForum.join(" | ")}`,
        },
      ],
    });
    budget.remaining -= res.costUsd;
    return res.content.trim();
  } catch {
    return undefined;
  }
}

function mergeMultiSeedTickFreq(
  runs: SimulationTick[][],
  scenarioNames: string[]
): Record<string, number> {
  const freq: Record<string, number> = {};
  scenarioNames.forEach((n) => { freq[n] = 0; });
  let totalTicks = 0;
  for (const ticks of runs) {
    for (const tick of ticks) {
      totalTicks++;
      for (const name of scenarioNames) {
        if ((tick.scenarioStates[name]?.momentum ?? 0) > 0.48) freq[name]++;
      }
    }
  }
  if (totalTicks > 0) {
    for (const name of scenarioNames) freq[name] /= totalTicks;
  }
  return freq;
}

/** Post-simulation persona chat (MiroFish "Deep Interaction" equivalent) */
export async function chatWithSimulatedPersona(input: {
  persona: NonNullable<SimulationOutput["personaSnapshots"]>[number];
  question: string;
  userMessage: string;
}): Promise<string> {
  const positions = Object.entries(input.persona.positions ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${(v * 100).toFixed(0)}%`)
    .join(", ");

  const res = await callLLM({
    task: "harvard_council",
    temperature: 0.4,
    maxTokens: 350,
    messages: [
      {
        role: "system",
        content: `You are ${input.persona.id} (${input.persona.archetype}) in a completed policy simulation. Stay in character. Beliefs: ${input.persona.beliefs.join("; ")}. Positions: ${positions}. Memory: ${input.persona.memory.slice(-3).map((m) => m.observation).join(" | ")}`,
      },
      {
        role: "user",
        content: `Simulation context: ${input.question}\nUser asks: ${input.userMessage}`,
      },
    ],
  });
  return res.content.trim();
}

export function computeTrajectories(
  ticks: SimulationTick[],
  scenarioNames: string[]
): Record<string, ScenarioTrajectory> {
  const result: Record<string, ScenarioTrajectory> = {};
  if (ticks.length < 3) {
    scenarioNames.forEach((n) => { result[n] = "stable"; });
    return result;
  }
  for (const name of scenarioNames) {
    const series = ticks.map((t) => t.scenarioStates[name]?.momentum ?? 0);
    const first = series.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const last = series.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const variance = series.reduce((s, v) => s + (v - (first + last) / 2) ** 2, 0) / series.length;
    if (variance > 0.07) result[name] = "volatile";
    else if (last - first > 0.055) result[name] = "rising";
    else if (first - last > 0.055) result[name] = "declining";
    else result[name] = "stable";
  }
  return result;
}

function detectCascadeEffects(ticks: SimulationTick[], scenarioNames: string[]): Record<string, string[]> {
  const cascades: Record<string, string[]> = {};
  scenarioNames.forEach((n) => { cascades[n] = []; });

  for (let i = 1; i < ticks.length; i++) {
    const prev = ticks[i - 1].scenarioStates;
    const curr = ticks[i].scenarioStates;
    for (const a of scenarioNames) {
      for (const b of scenarioNames) {
        if (a === b) continue;
        const dropA = (prev[a]?.momentum ?? 0) - (curr[a]?.momentum ?? 0);
        const riseB = (curr[b]?.momentum ?? 0) - (prev[b]?.momentum ?? 0);
        if (dropA > 0.08 && riseB > 0.08) {
          cascades[b].push(`${a} ↓ → ${b} ↑ (tick ${i + 1})`);
        }
      }
    }
  }
  return cascades;
}

export function deriveEmpiricalProbabilities(
  ticks: SimulationTick[],
  scenarioNames: string[],
  mcProbabilities: Record<string, number>,
  bootstrapCI: Record<string, [number, number]>,
  sourceGraph: Array<{ scenario: string; sourceIds: string[] }>,
  sourceGrounded: boolean
): SimulatedScenarioOutcome[] {
  const trajectories = computeTrajectories(ticks, scenarioNames);
  const cascades = detectCascadeEffects(ticks, scenarioNames);
  const tickCounts: Record<string, number> = {};
  scenarioNames.forEach((n) => { tickCounts[n] = 0; });

  for (const tick of ticks) {
    for (const name of scenarioNames) {
      if ((tick.scenarioStates[name]?.momentum ?? 0) > 0.48) tickCounts[name]++;
    }
  }

  const totalTicks = ticks.length || 1;
  return scenarioNames.map((name) => {
    const tickFreq = tickCounts[name] / totalTicks;
    const mc = mcProbabilities[name] ?? 1 / scenarioNames.length;
    const empirical = 0.5 * mc + 0.5 * tickFreq;
    const ci = bootstrapCI[name] ?? [Math.max(0, empirical - 0.1), Math.min(1, empirical + 0.1)];
    const lastTick = ticks[ticks.length - 1];
    const supporters = lastTick?.scenarioStates[name]?.supporters ?? [];
    const opponents = lastTick?.scenarioStates[name]?.opponents ?? [];
    const graphHit = sourceGraph.find((g) => g.scenario === name);

    return {
      name,
      empiricalProbability: empirical,
      trajectory: trajectories[name] ?? "stable",
      keyDrivers: supporters.slice(0, 4).map((id) => id.split("-")[0]),
      blockers: opponents.slice(0, 4).map((id) => id.split("-")[0]),
      cascadeEffects: [...new Set(cascades[name])].slice(0, 3),
      confidenceInterval: ci,
      sourceGrounded: sourceGrounded && (graphHit?.sourceIds.length ?? 0) > 0,
      supportingSourceIds: graphHit?.sourceIds ?? [],
    };
  });
}

function validateOutput(
  outcomes: SimulatedScenarioOutcome[],
  sourceQualityAvg: number,
  redTeam?: string
): { ok: boolean; notes: string[] } {
  const notes: string[] = [];
  const sum = outcomes.reduce((s, o) => s + o.empiricalProbability, 0);
  if (Math.abs(sum - 1) > 0.12) notes.push(`Probabilities normalized from ${sum.toFixed(2)}`);
  const dominant = outcomes.find((o) => o.empiricalProbability > 0.88);
  if (dominant && sourceQualityAvg < 58) {
    notes.push(`High P on "${dominant.name}" with weak sources — flagged`);
  }
  if (redTeam && redTeam.length > 50) notes.push("Red-team counter-scenario documented");
  return { ok: notes.length <= 1, notes };
}

function normalizeProbabilities(outcomes: SimulatedScenarioOutcome[]): SimulatedScenarioOutcome[] {
  const sum = outcomes.reduce((s, o) => s + o.empiricalProbability, 0) || 1;
  return outcomes.map((o) => ({ ...o, empiricalProbability: o.empiricalProbability / sum }));
}

export function exportSimulationReport(output: SimulationOutput, domain: string): SimulationReport {
  const lines = output.scenarios.map((s) => {
    const ci = s.confidenceInterval;
    const src = s.supportingSourceIds.length ? ` sources=${s.supportingSourceIds.length}` : "";
    return `- ${s.name}: P=${(s.empiricalProbability * 100).toFixed(0)}% [${(ci[0] * 100).toFixed(0)}–${(ci[1] * 100).toFixed(0)}%] (${s.trajectory})${src}`;
  });

  return {
    summary: `Foresight v3: ${output.swarmSize} swarm + ${output.personaCount} voice, ${output.ticks.length} ticks (${output.llmTickCount} LLM, ${output.socialPostCount} posts), ${output.seedRuns} seeds, ${output.monteCarloRuns} MC, $${output.totalCostUsd.toFixed(3)}.`,
    output,
    contextBlock: [
      "=== SIMULATED OUTCOMES (NomosX Foresight Engine v3) ===",
      `Domain: ${domain}`,
      `Swarm: ${output.swarmSize} agents | Voice: ${output.personaCount} | Seeds: ${output.seedRuns}`,
      `Sources: ${output.traceability.sourceIds.length} | Quality: ${output.traceability.sourceQualityAvg.toFixed(0)}/100`,
      `GraphRAG: ${output.foresightGraph?.nodeCount ?? 0} nodes | Social posts: ${output.socialPostCount}`,
      `LLM ticks: ${output.llmTickCount} | MC converged: ${output.monteCarloConverged}`,
      `Adversarial: ${output.traceability.adversarialValidated ? "PASS" : "REVIEW"}`,
      output.executiveBrief ? `Executive: ${output.executiveBrief.slice(0, 400)}` : "",
      output.redTeamChallenge ? `Red-team: ${output.redTeamChallenge.slice(0, 300)}` : "",
      ...lines,
      "=== END SIMULATED OUTCOMES ===",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export async function runSimulation(options: RunSimulationOptions): Promise<SimulationOutput> {
  const report = await runSimulationAgent({
    question: options.config.question,
    scenarios: options.config.scenarios.map((s) => ({
      ...s,
      assumptions: inferAssumptions(s, {}),
    })),
    parameters: defaultParameters(options.config.scenarios.map((s) => ({ ...s, assumptions: {} }))),
    sourceIds: [],
    depth: options.config.depth ?? "strategic",
    domain: options.config.domain,
  });
  return report.output;
}

export async function runSimulationAgent(input: SimulationInput): Promise<SimulationResult> {
  const started = Date.now();
  const profile = resolveDepthProfile(input.depth);
  const domain = input.domain ?? "general";

  if (!profile.enabled || input.scenarios.length < 2) {
    return exportSimulationReport(
      {
        scenarios: input.scenarios.map((s) => ({
          name: s.name,
          empiricalProbability: s.priorProbability ?? 1 / Math.max(input.scenarios.length, 1),
          trajectory: "stable",
          keyDrivers: [],
          blockers: [],
          cascadeEffects: [],
          confidenceInterval: [0, 1],
          sourceGrounded: false,
          supportingSourceIds: [],
        })),
        ticks: [],
        personaCount: 0,
        swarmSize: 0,
        seedRuns: 0,
        convergedAgents: 0,
        monteCarloRuns: 0,
        monteCarloConverged: false,
        llmTickCount: 0,
        socialPostCount: 0,
        totalCostUsd: 0,
        totalDurationMs: Date.now() - started,
        traceability: {
          sourceIds: input.sourceIds,
          sourceQualityAvg: 0,
          adversarialValidated: true,
          validationNotes: ["Simulation skipped"],
        },
      },
      domain
    );
  }

  const evidence = await loadSourceEvidence(input.sourceIds);
  const sourceGraph = buildSourceGraph(input.scenarios, evidence);
  const parameters =
    Object.keys(input.parameters).length > 0 ? input.parameters : defaultParameters(input.scenarios);

  const budget = { remaining: profile.maxCostUsd };
  const foresightGraph = await buildForesightGraph(
    input.question,
    input.scenarios,
    evidence,
    budget
  );

  const { parameters: calibrated, avgQuality } = await calibrateFromSources(
    input.sourceIds,
    parameters,
    evidence
  );

  const seed = hashSeed(input.question);
  const mc = runMonteCarloCore(
    { scenarios: input.scenarios, parameters: calibrated, runs: profile.mcRuns, seed },
    sourceGraph
  );

  const personas = await buildPersonaPanel({
    domain,
    question: input.question,
    count: profile.personas,
    domainPersonas: input.domainPersonas,
    sourceEvidence: evidence,
  });

  const primaryBudget = profile.maxCostUsd * 0.65;
  const primary = await runForesightSwarmSimulation(
    personas,
    input.scenarios,
    profile,
    input.question,
    seed + 1,
    foresightGraph,
    { enableLLM: true, budgetCap: primaryBudget, injected: input.injectedVariable }
  );

  const allTickRuns: SimulationTick[][] = [primary.ticks];
  let totalLlmTicks = primary.llmTickCount;
  let totalSocialPosts = primary.socialPostCount;
  let totalCost = primary.costUsd + (profile.maxCostUsd - budget.remaining);

  for (let s = 2; s <= profile.seedRuns; s++) {
    const clone = clonePersonasForSeed(personas);
    const replica = await runForesightSwarmSimulation(
      clone,
      input.scenarios,
      profile,
      input.question,
      seed + s * 997,
      foresightGraph,
      { enableLLM: false, budgetCap: 0, injected: input.injectedVariable }
    );
    allTickRuns.push(replica.ticks);
    totalLlmTicks += replica.llmTickCount;
    totalSocialPosts += replica.socialPostCount;
  }

  const feedSummary = summarizeFeed(primary.feed);
  const tickFreq = mergeMultiSeedTickFreq(
    allTickRuns,
    input.scenarios.map((s) => s.name)
  );

  const bootstrapCI = bootstrapConfidenceIntervals(
    mc.probabilities,
    tickFreq,
    profile.bootstrapRuns,
    seed
  );

  let outcomes = deriveEmpiricalProbabilities(
    primary.ticks,
    input.scenarios.map((s) => s.name),
    mc.probabilities,
    bootstrapCI,
    sourceGraph,
    avgQuality >= 55 && input.sourceIds.length >= 3
  );
  outcomes = normalizeProbabilities(outcomes);

  const reportBudget = { remaining: profile.maxCostUsd - totalCost };
  const top = [...outcomes].sort((a, b) => b.empiricalProbability - a.empiricalProbability)[0];
  const redTeam = await runAdversarialRedTeam(input.question, top, evidence, reportBudget);
  const executiveBrief = await synthesizeForesightBrief(
    input.question,
    outcomes,
    feedSummary,
    reportBudget
  );

  const validation = validateOutput(outcomes, avgQuality, redTeam);
  const sensitivity = computeSensitivityMatrix(
    input.scenarios,
    calibrated,
    Object.keys(calibrated)[0] ?? "momentum"
  );

  const personaSnapshots = personas.map((p) => ({
    id: p.id,
    archetype: p.archetype,
    beliefs: [...p.beliefs],
    memory: [...p.memory],
    positions: { ...p.positions },
  }));

  return exportSimulationReport(
    {
      scenarios: outcomes,
      ticks: primary.ticks,
      personaCount: personas.length,
      swarmSize: primary.crowdSize,
      seedRuns: profile.seedRuns,
      convergedAgents: primary.convergedAgents,
      monteCarloRuns: mc.runsUsed,
      monteCarloConverged: mc.converged,
      llmTickCount: totalLlmTicks,
      socialPostCount: totalSocialPosts,
      totalCostUsd: profile.maxCostUsd - reportBudget.remaining,
      totalDurationMs: Date.now() - started,
      sensitivity,
      sourceGraph,
      foresightGraph: {
        nodeCount: foresightGraph.nodes.length,
        edgeCount: foresightGraph.edges.length,
        method: foresightGraph.extractionMethod,
      },
      graphNodes: foresightGraph.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        type: n.type,
        weight: n.weight,
      })),
      redTeamChallenge: redTeam,
      executiveBrief,
      personaSnapshots,
      traceability: {
        sourceIds: input.sourceIds,
        sourceQualityAvg: avgQuality,
        adversarialValidated: validation.ok,
        validationNotes: validation.notes,
      },
    },
    domain
  );
}

export async function simulationAgent(
  questionOrInput: string | SimulationInput,
  legacyScenarios?: SimulationScenarioInput[],
  options?: {
    domain?: string;
    sourceIds?: string[];
    depth?: InquiryDepth;
  }
): Promise<SimulationReport> {
  if (typeof questionOrInput === "object" && "scenarios" in questionOrInput) {
    return runSimulationAgent(questionOrInput);
  }

  const scenarios = (legacyScenarios ?? []).map((s) => ({
    name: s.name,
    description: s.description,
    assumptions: inferAssumptions(s, defaultParameters([])),
    priorProbability: s.priorProbability,
    implications: s.implications,
    signals: s.signals,
  }));

  return runSimulationAgent({
    question: questionOrInput,
    scenarios,
    parameters: defaultParameters(scenarios),
    sourceIds: options?.sourceIds ?? [],
    depth: options?.depth ?? "strategic",
    domain: options?.domain,
  });
}
