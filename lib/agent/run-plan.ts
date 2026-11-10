/**
 * RUN PLAN — the orchestrator's up-front execution governor.
 *
 * Today every stage re-derives its own admission from scattered headroom
 * guards (reserve, corpus cap, P2 tiers, fact-check windows). Decisions
 * are reactive: a stage discovers at its turn that the budget is gone and
 * degrades locally — which is how live runs ended with verification
 * starved (566s < 600s flat gate → 0/21 claims LLM-verified) while
 * earlier stages had already spent the tail's window.
 *
 * The run plan inverts that: ONE deterministic computation, made right
 * after pre-flight (provider health + execution scope known), fixes the
 * execution profile and per-stage envelopes BEFORE the first LLM call.
 * Stages then consult the plan instead of re-deriving policy — the
 * orchestrator governs, agents execute inside their envelope.
 *
 * Deterministic + env-overridable + frozen-input safe: the plan is pure
 * function of its inputs, so record/replay produce identical profiles.
 */

export type RunProfile = 'full' | 'compact' | 'minimal';

export interface RunPlan {
  profile: RunProfile;
  /** Max sources admitted to the analyst context. */
  corpusCap: number;
  /** Analyst pass-2 admission tier: 'full' | 'compact' | 'skip'. */
  p2Tier: 'full' | 'compact' | 'skip';
  /** Wall-clock reserved for the post-analyst tail (checks→critic→DA→verify→render→gate). */
  tailReserveMs: number;
  /** Fact-check verification mode the tail should plan around. */
  factCheckMode: 'full' | 'partial' | 'deterministic';
  /** Debate admission: 'always' | 'on-demand' | 'skip'. */
  debateMode: 'always' | 'on-demand' | 'skip';
  /** Rough cost ceiling estimate for the whole run (USD). */
  estCostUsd: number;
  /** Human-readable reasons, persisted into stats for auditability. */
  rationale: string[];
}

const MIN = 60_000;

export interface RunPlanInput {
  isStrategic: boolean;
  /** 'brief' | 'standard' | 'deep' | 'strategic' — from format/depth. */
  depth: string;
  /** LLM providers alive after pre-flight suspension check. */
  aliveLlmProviders: number;
  /** Enclosing execution-scope budget when known (regen scopes are tight). */
  scopeBudgetMs?: number;
}

/**
 * Compute the execution profile. Rules, in priority order:
 *  1. Provider degradation (<2 LLMs alive) → compact: smaller corpus,
 *     compact P2, deterministic-leaning fact-check. A single slow provider
 *     cannot carry full passes + full verification in the window (live:
 *     glm-only runs starved the fact-checker at 566s).
 *  2. Tight scope (<50min, e.g. bounded regen) → minimal: P2 skip is
 *     already handled by the reserve; plan marks it so consumers don't
 *     re-litigate.
 *  3. Otherwise full.
 */
export function computeRunPlan(input: RunPlanInput): RunPlan {
  const degraded = input.aliveLlmProviders < 2;
  const tightScope = (input.scopeBudgetMs ?? Number.POSITIVE_INFINITY) < 50 * MIN;
  const isStrategic = input.isStrategic || input.depth === 'strategic';
  const rationale: string[] = [];

  let profile: RunProfile = 'full';
  if (degraded && tightScope) {
    profile = 'minimal';
    rationale.push('minimal: providers degraded AND tight execution scope');
  } else if (degraded) {
    profile = 'compact';
    rationale.push(`compact: only ${input.aliveLlmProviders} LLM provider(s) alive — single-provider latency cannot carry full passes + verification`);
  } else if (tightScope) {
    profile = 'compact';
    rationale.push('compact: execution scope <50min (bounded regen)');
  }

  const corpusCap =
    profile === 'full' ? (isStrategic ? 60 : 45) :
    profile === 'compact' ? (isStrategic ? 40 : 32) :
    (isStrategic ? 30 : 24);

  const p2Tier =
    profile === 'full' ? 'full' :
    profile === 'compact' ? 'compact' : 'skip';

  // Tail reserve scales with degradation: slow providers make every tail
  // step (fact-check batches, DA, render) take 2-3× longer, so producers
  // must stop earlier to leave the verification window intact.
  const tailReserveMs =
    profile === 'full' ? 30 * MIN :
    profile === 'compact' ? 40 * MIN : 45 * MIN;

  const factCheckMode =
    profile === 'full' ? 'full' :
    profile === 'compact' ? 'partial' : 'deterministic';

  const debateMode =
    profile === 'full' ? 'always' :
    profile === 'compact' ? 'on-demand' : 'skip';

  // Rough ceilings from observed live costs (glm-only ≈ $0.20-0.72/topic,
  // kimi-class ≈ $0.7-1.5). Used for early budget-constrained decisions,
  // not as a hard abort — the existing cost guard remains authoritative.
  const estCostUsd =
    profile === 'full' ? (isStrategic ? 1.5 : 0.9) :
    profile === 'compact' ? (isStrategic ? 0.9 : 0.6) : 0.4;

  if (profile !== 'full') {
    rationale.push(`profile=${profile} corpusCap=${corpusCap} p2=${p2Tier} reserve=${Math.round(tailReserveMs / MIN)}min debate=${debateMode}`);
  }

  return { profile, corpusCap, p2Tier, tailReserveMs, factCheckMode, debateMode, estCostUsd, rationale };
}
