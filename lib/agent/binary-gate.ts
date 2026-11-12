/**
 * BINARY PUBLICATION GATE — OT-2 (shadow mode).
 *
 * The composite trust/quality score decides nothing here: publication is a
 * conjunction of six verifiable facts. Until the swarm elector (OT-4/5)
 * exists, `scenarios_from_chain` and `swarm_healthy` will legitimately fail —
 * that is the point of shadow mode: the checks are computed and persisted so
 * the transition is measurable before it is enforced.
 *
 * Each check is binary and evidence-bound: missing instrumentation reports
 * `passed:false` with detail 'no data' — never silently passes.
 */

export type GateCheckId =
  | 'claims_entailed'
  | 'numbers_in_ledger'
  | 'scenarios_from_chain'
  | 'swarm_healthy'
  | 'objections_answered'
  | 'predictions_registered';

export interface BinaryGateCheck {
  id: GateCheckId;
  passed: boolean;
  detail: string;
}

export interface BinaryGateInput {
  /** stats.claimBinding / atomic-claims outcome: share of factual claims with
   *  a verified claim→passage entailment. */
  claimsEntailmentRatio?: number;
  /** stats.numbersLedger / numericalGate: share of published numbers traced
   *  to an evidence card. */
  numbersTracedRatio?: number;
  /** stats.centralScenario.selectedBy — 'swarm' once OT-5 lands; 'editorial' |
   *  'probability_fallback' today. */
  centralScenarioSelectedBy?: string;
  /** True when no 50/30/20 template scenarios were injected upstream. */
  scenariosFromChain?: boolean;
  /** Swarm vote telemetry (OT-4): valid votes, distinct model families, MC
   *  convergence flag. */
  swarmVotes?: { valid: number; families: number; converged: boolean };
  /** Unanswered sourced objections from the red team / DA. */
  unansweredObjections?: number;
  /** Count of OPEN predictions with a resolvable dueAt/horizon. */
  resolvablePredictions?: number;
}

export function evaluateBinaryGate(input: BinaryGateInput): BinaryGateCheck[] {
  const checks: BinaryGateCheck[] = [];

  checks.push({
    id: 'claims_entailed',
    passed: typeof input.claimsEntailmentRatio === 'number' && input.claimsEntailmentRatio >= 0.999,
    detail: typeof input.claimsEntailmentRatio === 'number'
      ? `claim→passage entailment ${Math.round(input.claimsEntailmentRatio * 100)}% (need 100%)`
      : 'no data — claim-passage contract not measured on this run',
  });

  checks.push({
    id: 'numbers_in_ledger',
    passed: typeof input.numbersTracedRatio === 'number' && input.numbersTracedRatio >= 0.999,
    detail: typeof input.numbersTracedRatio === 'number'
      ? `numbers traced to evidence cards ${Math.round(input.numbersTracedRatio * 100)}% (need 100%)`
      : 'no data — numbers ledger not measured on this run',
  });

  const swarmElected = input.centralScenarioSelectedBy === 'swarm';
  checks.push({
    id: 'scenarios_from_chain',
    passed: swarmElected && input.scenariosFromChain === true,
    detail: swarmElected
      ? (input.scenariosFromChain === true ? 'scenario elected by swarm, derived from causal chain' : 'swarm-elected but template scenarios detected upstream')
      : `central scenario selectedBy='${input.centralScenarioSelectedBy ?? 'none'}' — swarm elector not yet active (OT-5)`,
  });

  const s = input.swarmVotes;
  checks.push({
    id: 'swarm_healthy',
    passed: !!s && s.valid >= 12 && s.families >= 3 && s.converged,
    detail: s
      ? `${s.valid} valid votes / ${s.families} families / converged=${s.converged} (need ≥12, ≥3, converged)`
      : 'no data — swarm voter not yet active (OT-4)',
  });

  checks.push({
    id: 'objections_answered',
    passed: typeof input.unansweredObjections === 'number' && input.unansweredObjections === 0,
    detail: typeof input.unansweredObjections === 'number'
      ? `${input.unansweredObjections} sourced objection(s) unanswered`
      : 'no data — objection ledger not measured on this run',
  });

  checks.push({
    id: 'predictions_registered',
    passed: typeof input.resolvablePredictions === 'number' && input.resolvablePredictions >= 3,
    detail: typeof input.resolvablePredictions === 'number'
      ? `${input.resolvablePredictions} resolvable predictions registered (need ≥3)`
      : 'no data — prediction registration not measured on this run',
  });

  return checks;
}
