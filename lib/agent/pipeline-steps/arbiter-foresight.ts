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
import { deriveChainScenarios } from '../chain-scenarios';
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

      // OT-3 interim: chain-derived scenario skeletons are computed and
      // persisted for the swarm elector (OT-4/5), but NOT fed into today's
      // Monte Carlo — scenario names wouldn't match institutePosition
      // scenarios, so empirical probabilities would attach to the wrong
      // narratives. Probability path switches when OT-5 lands stable ids.
      const chainDerivation = deriveChainScenarios(
        Array.isArray(analysis.causalChain) ? analysis.causalChain : undefined,
        typeof analysis.trajectory === 'object' && analysis.trajectory
          ? String((analysis.trajectory as { horizon?: string }).horizon ?? '')
          : undefined,
      );
      stats.chainScenarios = chainDerivation
        ? {
            uncertainties: chainDerivation.uncertainties.map(u => ({
              linkId: u.linkId, kind: u.kind, downstream: u.downstream,
              claim: u.claim.slice(0, 160),
            })),
            scenarioIds: chainDerivation.scenarios.map(s => s.id),
            conditions: chainDerivation.scenarios.map(s => ({ id: s.id, conditions: s.conditions })),
            usedForForesight: false, // pending OT-5 stable-id election
          }
        : { usedForForesight: false, reason: 'insufficient_uncertainties' };
      stats.scenariosFromChain = false; // until OT-5 — no chain scenario carries probability yet
      // Fallback arbiter position (costUsd 0) means the 50/30 template ran.
      stats.templateScenariosUsed = institutePosition.costUsd === 0;

      // OT-4: independent-voter swarm over the uncertain links. Runs whenever
      // the chain yields uncertainties and ≥10 sources — its forecasts are
      // persisted for the Monte Carlo elector (OT-5) and the binary gate.
      // Non-blocking: a swarm failure degrades to 'no data', never a hold.
      if (chainDerivation && topSources.length >= 10) {
        try {
          const { runSwarmVote } = await import('../swarm-forecaster');
          const swarm = await runSwarmVote({
            question: query,
            uncertainties: chainDerivation.uncertainties.map(u => ({ linkId: u.linkId, claim: u.claim })),
            sourceIds: topSources.map((s: any) => s.id),
            horizon: typeof analysis.trajectory === 'object' && analysis.trajectory
              ? String((analysis.trajectory as { horizon?: string }).horizon ?? '') : undefined,
            runId: pipelineRunId,
          });
          stats.swarmForecasts = {
            forecasts: swarm.forecasts.map(f => ({
              linkId: f.linkId, probability: f.probability,
              variance: f.variance, iqr: f.iqr,
              validVotes: f.validVotes, families: f.families, contested: f.contested,
            })),
            rawVotes: swarm.rawVotes,
            validVotes: swarm.validVotes,
            familiesUsed: swarm.familiesUsed,
            costUsd: swarm.costUsd,
            skipped: swarm.skipped,
          };
          addCost(swarm.costUsd, 'SWARM_FORECAST');
          console.log(`${label} SWARM: ${swarm.validVotes} valid votes / ${swarm.familiesUsed.length} families / $${swarm.costUsd.toFixed(4)}`);

          // OT-5: Monte Carlo elector — the scenario central is chosen by
          // computation over the voted link distributions, not by the
          // arbiter's dominantScenario field.
          if (chainDerivation && swarm.forecasts.length >= 2) {
            try {
              const { electScenario } = await import('../mc-elector');
              const election = electScenario({
                scenarios: chainDerivation.scenarios,
                forecasts: swarm.forecasts,
                question: query,
              });
              stats.swarmElection = election ?? { skipped: 'insufficient_link_distributions' };
              if (election) {
                console.log(`${label} ELECTOR: ${election.scenarioId} p=${election.probability.toFixed(3)} contested=${election.contested} runnerUp=${election.runnerUpId ?? 'none'}`);
              }
            } catch (electErr) {
              stats.swarmElection = { error: electErr instanceof Error ? electErr.message : String(electErr) };
            }
          }
        } catch (swarmErr) {
          stats.swarmForecasts = { error: swarmErr instanceof Error ? swarmErr.message : String(swarmErr) };
          console.warn(`${label} SWARM failed (non-blocking):`, swarmErr);
        }
      }

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
