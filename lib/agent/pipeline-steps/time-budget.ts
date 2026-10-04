/**
 * RUN-TIME HEADROOM — shared wall-clock guards for expensive escalation
 * steps (TTS second candidate, gap-fill re-analysis, DA rewrite).
 *
 * S34 live-run finding: a TTS candidate + an outline-critic re-analysis
 * stacked ~20min of extra analyst passes on top of a 35min scout, and the
 * run died at the 75min timeout mid-pass — zero artifact judged, ~$1.5
 * burned. An escalation step that cannot finish before the pipeline
 * deadline is pure waste: better to keep the current artifact and let
 * critic/DA/render/gate run on it than to lose the whole run mid-pass.
 *
 * Deadlines mirror runPipeline's withTimeout defaults — keep in sync with
 * the timeoutMs computation in pipeline-v2.ts (free: 180min, strategic:
 * 75min, brief/memo: 65min). When the caller IS inside an execution scope,
 * getExecutionDeadlineAt() reports the real (possibly tighter) bound —
 * regen child pipelines run on a 35min scope, memo on 80min, custom
 * options.timeoutMs on whatever was passed; the scope value always wins.
 */

import { getExecutionDeadlineAt } from '../../worker/execution-scope';

const STRATEGIC_DEADLINE_MS = 4_500_000;
const BRIEF_DEADLINE_MS = 3_900_000;
const FREE_DEADLINE_MS = 10_800_000;

function deadlineBudgetMs(isStrategic: boolean): number {
  const freeRun = process.env.NOMOSX_FREE_RUN === '1' || process.env.NOMOSX_FREE_RUN === 'true';
  if (freeRun) return FREE_DEADLINE_MS;
  return isStrategic ? STRATEGIC_DEADLINE_MS : BRIEF_DEADLINE_MS;
}

/** Absolute deadline (epoch ms) for the current run: the enclosing
 * execution scope's real deadline when present, else pipelineStart plus
 * the format budget — or +Infinity when neither exists (detached
 * callers, tests). */
export function runDeadlineAt(pipelineStart: number | undefined, isStrategic: boolean): number {
  const scoped = getExecutionDeadlineAt();
  if (scoped !== undefined) return scoped;
  if (!pipelineStart) return Number.POSITIVE_INFINITY;
  return pipelineStart + deadlineBudgetMs(isStrategic);
}

export function remainingRunMs(pipelineStart: number | undefined, isStrategic: boolean): number {
  return runDeadlineAt(pipelineStart, isStrategic) - Date.now();
}

/** True when at least `headroomMs` remains before the pipeline deadline. */
export function hasRunHeadroom(pipelineStart: number | undefined, isStrategic: boolean, headroomMs: number): boolean {
  return remainingRunMs(pipelineStart, isStrategic) >= headroomMs;
}
