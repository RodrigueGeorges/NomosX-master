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

/**
 * P1-2/P1-3 — wire a resolved sentinel back into the published forecast.
 *
 * Called by the prediction tracker when a `kind='sentinel'` prediction
 * resolves CONFIRMED/REFUTED. Loads the forecast state snapshotted at
 * publication (pipelineRun.steps.stats.forecastState), re-runs the election
 * via reviseForecast, and persists:
 *   - stats.forecastState  → the advanced state (next resolution builds on it)
 *   - stats.forecastRevisions → append-only probability history (P1-3):
 *     every revision carries resolvedAt, the resolving predictionId,
 *     link before/after, per-scenario probabilities before/after, and the
 *     elected scenario before/after — the calibration series the note
 *     exposes under the central scenario.
 *   - criticalLoopResult.forecastRevisions on the publication row, plus an
 *     updated centralScenario probability/elected name when the election
 *     changed — the note reflects the re-election without rewriting history.
 *
 * Returns the revision record, or null when the prediction is not a swarm
 * sentinel of a forecasted run / the state cannot be re-elected.
 */
export async function applySentinelResolutionToRun(prediction: {
  id: string; briefId?: string | null; linkId?: string | null;
  outcome?: string | null; resolvedAt?: Date | null; resolutionSource?: string | null;
}): Promise<ProbabilityRevision | null> {
  const linkId = Number(prediction.linkId);
  if (!prediction.briefId || !Number.isFinite(linkId)) return null;
  if (prediction.outcome !== 'occurred' && prediction.outcome !== 'not_occurred') return null;

  const { prisma } = await import('../db');
  const brief = await prisma.brief.findUnique({
    where: { id: prediction.briefId },
    select: { id: true, pipelineRunId: true },
  });
  if (!brief?.pipelineRunId) return null;

  // Read-modify-write on steps.forecastRevisions must be atomic: two
  // sentinel resolutions landing on the same run concurrently used to lose
  // one revision (last writer wins on the whole JSON blob). Serializable
  // transaction + retry makes the append conflict-safe.
  let result: ReturnType<typeof reviseForecast> = null;
  let runId: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      result = await prisma.$transaction(async (tx) => {
        const run = await tx.pipelineRun.findUnique({
          where: { id: brief.pipelineRunId! },
          select: { id: true, steps: true },
        });
        const steps = (run?.steps ?? {}) as Record<string, any>;
        const state = steps?.forecastState as ForecastState | undefined;
        if (!state?.links?.length || !state.scenarios?.length) return null;

        const revisions = (steps.forecastRevisions ?? []) as ProbabilityRevision[];
        // Idempotent: a prediction resolves once, but guard against double-apply.
        if (revisions.some(r => r.cause.predictionId === prediction.id)) return null;

        const rev = reviseForecast(state, {
          linkId,
          outcome: prediction.outcome as 'occurred' | 'not_occurred',
          predictionId: prediction.id,
          evidenceUrl: prediction.resolutionSource ?? undefined,
          resolvedAt: (prediction.resolvedAt ?? new Date()).toISOString(),
        });
        if (!rev) return null;

        const nextSteps = {
          ...steps,
          forecastState: rev.state,
          forecastRevisions: [...revisions, rev.revision],
          centralScenario: rev.revision.electionChanged && steps.centralScenario
            ? {
                ...steps.centralScenario,
                probability: rev.revision.elected.probabilityAfter,
                name: steps.centralScenario.name, // published name is editorial — keep it
              }
            : steps.centralScenario,
        };
        await tx.pipelineRun.update({
          where: { id: run!.id },
          data: { steps: nextSteps as any },
        });
        return rev;
      }, { isolationLevel: 'Serializable' });
      runId = brief.pipelineRunId;
      break;
    } catch (txErr) {
      // Serialization failure / deadlock → retry with a fresh read.
      if (attempt === 2) throw txErr;
      await new Promise(r => setTimeout(r, 50 * (attempt + 1)));
    }
  }
  if (!result || !runId) return null;

  // Surface on the publication: append the revision to the note's forecast
  // history and refresh the elected probability when the election moved.
  try {
    const publication = await prisma.thinkTankPublication.findFirst({
      where: { criticalLoopResult: { path: ['briefId'], equals: brief.id } },
      select: { id: true, criticalLoopResult: true },
    });
    if (publication) {
      const clr = (publication.criticalLoopResult ?? {}) as Record<string, any>;
      const cs = clr.centralScenario as Record<string, any> | undefined;
      await prisma.thinkTankPublication.update({
        where: { id: publication.id },
        data: {
          criticalLoopResult: {
            ...clr,
            forecastRevisions: [...((clr.forecastRevisions as unknown[]) ?? []), result.revision],
            centralScenario: cs && result.revision.electionChanged
              ? { ...cs, probability: result.revision.elected.probabilityAfter, reElectedAt: result.revision.resolvedAt, reElectedFrom: result.revision.elected.before }
              : cs,
          } as any,
        },
      });
    }
  } catch (pubErr) {
    console.warn('[ForecastRevision] publication patch failed (run state already persisted):', pubErr);
  }

  console.log(`[ForecastRevision] sentinel ${prediction.id} → link ${linkId} ${result.revision.link.before}→${result.revision.link.after}; elected ${result.revision.elected.before}→${result.revision.elected.after} (p=${result.revision.elected.probabilityAfter})${result.revision.electionChanged ? ' — ELECTION CHANGED' : ''}`);
  return result.revision;
}
