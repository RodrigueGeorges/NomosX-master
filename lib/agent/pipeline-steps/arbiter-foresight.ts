/**
 * EDITORIAL ARBITER → FORESIGHT (Monte Carlo) block — V2 path.
 * Extracted from pipeline-v2.ts — identical semantics.
 *
 * Ordering is load-bearing: the arbiter generates the scenarios first, then
 * foresight refines their probabilities with the simulation (previously
 * foresight ran first → 0 scenarios → always skipped).
 *
 * Returns `{ institutePosition, analysis }` — the caller reassigns both
 * because foresight materially replaces the analysis object and the arbiter
 * output is read by the render step.
 */

import { editorialArbiter } from '../editorial-arbiter';
import { resolveCentralScenario, type CastingResult, type InstitutePosition } from '../editorial-types';
import { runPipelineForesight } from '../pipeline-foresight';
import { emitProgress } from '../pipeline-progress';

export interface ArbiterForesightDeps {
  query: string;
  topicClassification: any;
  castingResult: CastingResult | null | undefined;
  analysis: Record<string, any>;
  topSources: any[];
  debateResult: any;
  stats: Record<string, any>;
  label: string;
  detectedDomain: string;
  isStrategic: boolean;
  seedSourceIds?: string[];
  pipelineRunId: string;
  addCost: (usd: number | undefined, step: string) => void;
  /** True when upstream quality signals (critic score, groundedness) predict
   *  a held artifact — the arbiter drops from the apex model to mid-tier so
   *  premium scenario-writing tokens aren't spent on a piece that won't
   *  publish. */
  degraded?: boolean;
}

export interface ArbiterForesightOutcome {
  institutePosition: InstitutePosition | undefined;
  analysis: Record<string, any>;
}

export async function runArbiterForesight(deps: ArbiterForesightDeps): Promise<ArbiterForesightOutcome> {
  const { query, topicClassification, castingResult, topSources, debateResult, stats, label, detectedDomain, isStrategic, seedSourceIds, pipelineRunId, addCost } = deps;
  let analysis = deps.analysis;
  let institutePosition: InstitutePosition | undefined;

  if (castingResult) {
    if (deps.degraded) {
      console.log(`${label} ARBITER: degraded mode — weak upstream quality signals, running on mid-tier model`);
    }
    emitProgress(pipelineRunId, 'ARBITER', 'started', 'Formulating institute position...');
    institutePosition = await editorialArbiter({
      question: query,
      classification: topicClassification,
      casting: castingResult,
      analysis,
      sources: topSources,
      debate: debateResult,
      premium: !deps.degraded,
    });
    stats.editorialArbiter = {
      confidence: institutePosition.confidence,
      confidenceLabel: institutePosition.confidenceLabel,
      scenariosCount: institutePosition.scenarios.length,
      costUsd: institutePosition.costUsd,
    };
    addCost(institutePosition.costUsd, 'EDITORIAL ARBITER');
    emitProgress(pipelineRunId, 'ARBITER', 'completed', `Position: ${institutePosition.confidence}/100 confidence`);
    console.log(`${label} ARBITER: confidence=${institutePosition.confidence}, scenarios=${institutePosition.scenarios.length}`);

    // ── FORESIGHT (Monte Carlo + swarm) — runs AFTER arbiter creates scenarios ──
    // Bug fix: previously foresight ran before arbiter → 0 scenarios → always skipped.
    // Now arbiter generates scenario names/descriptions/priors, then foresight refines probabilities.
    const arbiterScenarios = institutePosition.scenarios;
    if (!arbiterScenarios || arbiterScenarios.length < 2) {
      stats.foresight = { skipped: true, reason: `only ${arbiterScenarios?.length ?? 0} scenarios from arbiter — Monte Carlo needs ≥ 2` };
      console.log(`${label} FORESIGHT: skipped (only ${arbiterScenarios?.length ?? 0} scenarios from arbiter)`);
    } else if (topSources.length < 10) {
      stats.foresight = { skipped: true, reason: `insufficient evidence (${topSources.length} sources) — Monte Carlo needs ≥ 10 for reliable probabilities` };
      console.log(`${label} FORESIGHT: skipped (only ${topSources.length} sources — insufficient for reliable Monte Carlo)`);
    } else {
      emitProgress(pipelineRunId, "FORESIGHT", "started", "Monte Carlo scenario distribution...");
      // Build a synthetic analysis object with arbiter scenarios for foresight
      const analysisForForesight = {
        ...analysis,
        scenarios: arbiterScenarios.map(s => ({
          name: s.name,
          description: s.description,
          probability: s.probability,
          signals: s.signals,
        })),
      };
      const foresight = await runPipelineForesight({
        question: query,
        analysis: analysisForForesight,
        domain: detectedDomain,
        sourceIds: topSources.map((s: any) => s.id),
        isStrategic,
        depth: isStrategic ? 'strategic' : 'standard',
        seedSourceIds,
      });
      if (!foresight.skipped && foresight.report) {
        analysis = foresight.analysis as typeof analysis;
        // Enrich institutePosition scenarios with empirical probabilities
        const simScenarios = foresight.report.output.scenarios;
        stats.centralScenario = resolveCentralScenario(institutePosition, simScenarios);
        analysis = { ...analysis, scenarios: institutePosition.scenarios } as typeof analysis;
        stats.foresight = {
          scenarios: foresight.report.output.scenarios.length,
          monteCarloRuns: foresight.report.output.monteCarloRuns,
          converged: foresight.report.output.monteCarloConverged,
          costUsd: foresight.costUsd,
        };
        addCost(foresight.costUsd, "FORESIGHT");
        emitProgress(pipelineRunId, "FORESIGHT", "completed", `MC: ${foresight.report.output.scenarios.length} scenarios, ${foresight.report.output.monteCarloRuns} runs`);
        console.log(`${label} FORESIGHT: ${foresight.report.output.scenarios.length} scenarios, ${foresight.report.output.monteCarloRuns} MC runs, converged=${foresight.report.output.monteCarloConverged}`);
      } else {
        stats.foresight = { skipped: true, reason: foresight.reason };
        console.log(`${label} FORESIGHT: skipped (${foresight.reason})`);
      }
    }
  }

  return { institutePosition, analysis };
}
