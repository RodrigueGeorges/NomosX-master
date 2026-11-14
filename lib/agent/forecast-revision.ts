/**
 * FORECAST REVISION — a published position that updates itself.
 *
 * A NomosX note elects a central scenario from link probabilities. When a
 * sentinel tied to one of those links resolves, the link is no longer what
 * the swarm thought on publication day. This module folds the resolution
 * into the link and re-runs the election on the stored state: no pipeline,
 * no LLM call, same inputs → same revision.
 *
 * The original publication is never edited. Each revision is a dated record
 * (what resolved, link before/after, scenarios before/after) that the note
 * page lists under the central scenario.
 */

import type { ChainScenario } from './chain-scenarios';
import type { LinkForecast } from './swarm-forecaster';
import { electScenario, type ElectedScenario } from './mc-elector';

/** Everything the elector needs to run again without the pipeline. */
export interface ForecastState {
  question: string;
  scenarios: Array<Pick<ChainScenario, 'id' | 'conditions' | 'name' | 'description' | 'observableAt' | 'uncertaintyIds'>>;
  links: Array<Pick<LinkForecast, 'linkId' | 'claim' | 'probability' | 'variance' | 'validVotes' | 'families'>>;
  /** Number of revisions already applied — 0 on publication day. */
  revision: number;
}

export interface SentinelResolution {
  linkId: number;
  outcome: 'occurred' | 'not_occurred';
  predictionId: string;
  evidenceUrl?: string;
  resolvedAt: string; // ISO date
}

export interface ProbabilityRevision {
  revision: number;
  resolvedAt: string;
  cause: { predictionId: string; linkId: number; outcome: SentinelResolution['outcome']; evidenceUrl?: string };
  link: { before: number; after: number };
  scenarios: { before: Record<string, number>; after: Record<string, number> };
  elected: { before: string; after: string; probabilityBefore: number; probabilityAfter: number };
  /** True when the central scenario itself changed — the note needs an update. */
  electionChanged: boolean;
}

/**
 * How much a resolved sentinel moves its link, as a likelihood ratio.
 * A sentinel is an early observable of the link, not the link itself, so
 * it is strong evidence, never proof: 3:1 for, 1:3 against. Fixed and
 * documented so every revision is reproducible; recalibrate from the
 * track record once enough sentinel/link pairs have both resolved.
 */
export const SENTINEL_LIKELIHOOD_RATIO = 3;

const clamp = (p: number) => Math.min(0.98, Math.max(0.02, p));

/** Bayesian update in odds space. */
export function reviseLinkProbability(prior: number, outcome: SentinelResolution['outcome'], lr = SENTINEL_LIKELIHOOD_RATIO): number {
  const p = clamp(prior);
  const odds = (p / (1 - p)) * (outcome === 'occurred' ? lr : 1 / lr);
  return clamp(odds / (1 + odds));
}

function elect(state: ForecastState): ElectedScenario | null {
  return electScenario({
    question: state.question,
    scenarios: state.scenarios as ChainScenario[],
    forecasts: state.links.map(l => ({ ...l, iqr: 0, contested: false })) as LinkForecast[],
    runs: 4000,
  });
}

/** Snapshot taken at publication, stored with the run. */
export function buildForecastState(
  question: string,
  scenarios: ChainScenario[],
  forecasts: LinkForecast[],
): ForecastState {
  const needed = new Set(scenarios.flatMap(s => s.uncertaintyIds));
  return {
    question,
    scenarios: scenarios.map(({ id, conditions, name, description, observableAt, uncertaintyIds }) =>
      ({ id, conditions, name, description, observableAt, uncertaintyIds })),
    links: forecasts
      .filter(f => needed.has(f.linkId))
      .map(({ linkId, claim, probability, variance, validVotes, families }) =>
      ({ linkId, claim, probability, variance, validVotes, families })),
    revision: 0,
  };
}

/**
 * Apply one sentinel resolution. Returns the new state and the revision
 * record, or null when the resolution does not concern this forecast or the
 * state can no longer be elected.
 */
export function reviseForecast(
  state: ForecastState,
  resolution: SentinelResolution,
): { state: ForecastState; revision: ProbabilityRevision } | null {
  const link = state.links.find(l => l.linkId === resolution.linkId);
  if (!link) return null;
  const before = elect(state);
  if (!before) return null;

  const after = reviseLinkProbability(link.probability, resolution.outcome);
  const next: ForecastState = {
    ...state,
    links: state.links.map(l => (l.linkId === resolution.linkId ? { ...l, probability: after } : l)),
    revision: state.revision + 1,
  };
  const reelected = elect(next);
  if (!reelected) return null;

  const round = (r: Record<string, number>) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v * 10000) / 10000]));

  return {
    state: next,
    revision: {
      revision: next.revision,
      resolvedAt: resolution.resolvedAt,
      cause: {
        predictionId: resolution.predictionId, linkId: resolution.linkId,
        outcome: resolution.outcome, evidenceUrl: resolution.evidenceUrl,
      },
      link: { before: Math.round(link.probability * 10000) / 10000, after: Math.round(after * 10000) / 10000 },
      scenarios: { before: round(before.probabilities), after: round(reelected.probabilities) },
      elected: {
        before: before.scenarioId, after: reelected.scenarioId,
        probabilityBefore: Math.round(before.probability * 10000) / 10000,
        probabilityAfter: Math.round(reelected.probability * 10000) / 10000,
      },
      electionChanged: before.scenarioId !== reelected.scenarioId,
    },
  };
}
