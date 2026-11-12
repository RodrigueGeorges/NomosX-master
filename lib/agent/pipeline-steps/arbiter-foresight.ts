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
  /** Reader extractions — give swarm voters passage-level evidence. */
  readings?: any[];
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
    // ── OT-3/4/5 FIRST: chain scenarios → swarm votes → MC election, all
    // BEFORE the arbiter writes. The arbiter receives the elected branch and
    // narrates it; it no longer chooses probabilities (OT-6). ──
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
          usedForForesight: false,
        }
      : { usedForForesight: false, reason: 'insufficient_uncertainties' };

    let election: import('../mc-elector').ElectedScenario | null = null;
    let sentinelDrafts: import('../sentinel-writer').SentinelDraft[] = [];
    let pricedSentinels: NonNullable<import('../editorial-types').CentralScenarioDecision['sentinels']> = [];
    if (chainDerivation && topSources.length >= 10) {
      try {
        const { runSwarmVote, buildLinkCards } = await import('../swarm-forecaster');
        // Sentinels are drafted first so the same ballots price them.
        const { writeSentinels } = await import('../sentinel-writer');
        const drafted = await writeSentinels({
          question: query,
          uncertainties: chainDerivation.uncertainties.map(u => ({ linkId: u.linkId, claim: u.claim })),
          runId: pipelineRunId,
        });
        sentinelDrafts = drafted.sentinels;
        addCost(drafted.costUsd, 'SENTINEL_WRITER');
        const swarm = await runSwarmVote({
          question: query,
          uncertainties: [
            ...chainDerivation.uncertainties.map(u => ({ linkId: u.linkId, claim: u.claim, dependsOn: u.dependsOn })),
            ...drafted.sentinels.map(sn => ({ linkId: sn.voteId, claim: `By ${sn.dueAt}: ${sn.statement} (resolved as: ${sn.resolutionCriteria})` })),
          ],
          sourceIds: topSources.map((s: any) => s.id),
          cards: buildLinkCards(topSources, deps.readings, chainDerivation.uncertainties),
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
          ungroundedVotes: swarm.ungroundedVotes,
        };
        const { assessSwarmHealth } = await import('../swarm-forecaster');
        const swarmHealth = assessSwarmHealth(swarm.forecasts, chainDerivation.uncertainties.map(u => u.linkId));
        stats.swarmHealth = swarmHealth;
        // A sentinel is kept only if its own vote is healthy.
        pricedSentinels = sentinelDrafts.flatMap(sn => {
          const f = swarm.forecasts.find(x => x.linkId === sn.voteId);
          if (!f || !assessSwarmHealth([f], [sn.voteId]).healthy) return [];
          return [{
            linkId: sn.linkId, statement: sn.statement, dueAt: sn.dueAt,
            probability: Math.round(f.probability * 10000) / 10000,
            resolutionCriteria: sn.resolutionCriteria, resolutionSource: sn.resolutionSource,
          }];
        });
        stats.sentinels = { drafted: sentinelDrafts.length, rejected: drafted.rejected, priced: pricedSentinels.length };
        addCost(swarm.costUsd, 'SWARM_FORECAST');
        console.log(`${label} SWARM: ${swarm.validVotes} valid votes / ${swarm.familiesUsed.length} families / $${swarm.costUsd.toFixed(4)}`);

        if (!swarmHealth.healthy) {
          // Thin, single-family or split vote: no election. The run falls to
          // the legacy path, which can never claim selectedBy:'swarm'.
          stats.swarmElection = { skipped: 'swarm_unhealthy', issues: swarmHealth.issues };
          console.log(`${label} SWARM unhealthy — no election: ${swarmHealth.issues.join('; ')}`);
        } else if (swarm.forecasts.length >= 2) {
          try {
            // OT-7: fold the resolved track record into the forecasts —
            // systematic overconfidence (avg Brier > 0.20 over ≥20 resolved)
            // shrinks every link probability toward 0.5 before election.
            const { getCalibrationShrink } = await import('../prediction-tracker');
            const calib = await getCalibrationShrink();
            stats.swarmCalibration = calib;
            if (calib.factor < 1) {
              for (const f of swarm.forecasts) {
                f.probability = 0.5 + (f.probability - 0.5) * calib.factor;
              }
              for (const sn of pricedSentinels) {
                sn.probability = Math.round((0.5 + (sn.probability - 0.5) * calib.factor) * 10000) / 10000;
              }
              console.log(`${label} CALIBRATION: shrink=${calib.factor.toFixed(2)} applied (brier=${calib.avgBrier?.toFixed(3)}, n=${calib.resolved})`);
            }
            const { electScenario } = await import('../mc-elector');
            election = electScenario({
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

    const electedChainScenario = election
      ? chainDerivation?.scenarios.find(s => s.id === election!.scenarioId)
      : undefined;

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
      election: election && electedChainScenario
        ? {
            scenarioId: election.scenarioId,
            probability: election.probability,
            confidenceInterval: election.confidenceInterval,
            contested: election.contested,
            runnerUpId: election.runnerUpId,
            electedName: electedChainScenario.name,
            electedDescription: electedChainScenario.description,
            cells: chainDerivation!.scenarios.map(s => ({
              id: s.id,
              description: s.description,
              probability: election!.probabilities[s.id] ?? 0,
            })),
          }
        : null,
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

    // ── CENTRAL SCENARIO: the swarm election (OT-5/6) is authoritative when
    // it ran. The legacy Monte Carlo path remains as fallback for runs where
    // the chain couldn't yield uncertainties or the swarm produced no
    // forecasts — those still get resolveCentralScenario semantics. ──
    stats.templateScenariosUsed = institutePosition.costUsd === 0;
    const arbiterScenarios = institutePosition.scenarios;

    if (election && electedChainScenario) {
      // Source refs for the rationale: the uncertainty links' own sourceRefs.
      const chainLinks = Array.isArray(analysis.causalChain) ? analysis.causalChain as Array<{ id?: number; sourceRef?: number }> : [];
      const srcRefs = [...new Set(
        electedChainScenario.uncertaintyIds
          .map(id => chainLinks.find(l => l.id === id)?.sourceRef)
          .filter((n): n is number => typeof n === 'number' && n > 0)
      )];
      const srcSuffix = srcRefs.length ? ` Supporting links: ${srcRefs.map(n => `[SRC-${n}]`).join(' ')}.` : '';
      // Published name = the arbiter's name for the elected cell.
      const electedOutlook = institutePosition.scenarios.find(s => s.cellId === election!.scenarioId);
      stats.centralScenario = {
        name: electedOutlook?.name ?? electedChainScenario.name,
        description: electedOutlook?.narrative || electedOutlook?.description || electedChainScenario.description,
        rationale:
          `Elected by independent-voter swarm + Monte Carlo over causal-chain ` +
          `uncertainties (p=${election.probability.toFixed(3)}, 90% interval ` +
          `${election.confidenceInterval[0].toFixed(2)}-${election.confidenceInterval[1].toFixed(2)}, ` +
          `leads in ${Math.round(election.winShare * 100)}% of ${election.monteCarloRuns} draws` +
          `${election.contested ? `, CONTESTED — runner-up ${election.runnerUpId ?? 'n/a'}` : ''}).${srcSuffix}`,
        horizon: electedChainScenario.observableAt,
        implications: [`If this branch holds: ${electedChainScenario.description.slice(0, 300)}`],
        // Triggers name the claim itself — "Link #3" means nothing to a reader.
        revisionTriggers: Object.entries(electedChainScenario.conditions).map(([k, want]) => {
          const claim = chainDerivation!.uncertainties.find(u => `u${u.linkId}` === k)?.claim?.slice(0, 200) ?? `link ${k.replace(/^u/, '#')}`;
          return `${want ? 'Fails to materialize' : 'Materializes'} by ${electedChainScenario.observableAt}: ${claim}`;
        }),
        // Confidence follows the computed lead, not the mere fact of an
        // election: a 35% plurality is not a high-confidence call.
        confidence: !election.contested && election.probability >= 0.5 ? 'high'
          : !election.contested || election.probability >= 0.4 ? 'medium' : 'low',
        selectedBy: 'swarm',
        simulationDisagrees: false,
        resolutionStatement: electedChainScenario.description,
        sentinels: pricedSentinels,
        probability: election.probability,
        confidenceInterval: election.confidenceInterval,
        // Marginals: a dependent link's vote is P(child | parent), so its
        // standalone probability is the product with its parent's.
        linkProbabilities: (() => {
          const fc = ((stats.swarmForecasts as { forecasts?: Array<{ linkId: number; probability: number }> } | undefined)?.forecasts) ?? [];
          const byId = new Map(fc.map(f => [f.linkId, f.probability]));
          const out: Record<string, number> = {};
          for (const u of chainDerivation!.uncertainties) {
            const own = byId.get(u.linkId);
            if (own == null) continue;
            const parent = u.dependsOn != null ? byId.get(u.dependsOn) : undefined;
            out[String(u.linkId)] = Math.round((parent != null ? own * parent : own) * 10000) / 10000;
          }
          return out;
        })(),
      };
      stats.scenariosFromChain = true;
      // Keep analysis.scenarios in sync with the arbiter's written scenarios
      // (same as the legacy foresight path does) so renderers and persistence
      // see the elected probabilities, not stale analyst scenarios.
      analysis = { ...analysis, scenarios: institutePosition!.scenarios } as typeof analysis;
      stats.foresight = {
        elected: true,
        monteCarloRuns: election.monteCarloRuns,
        contested: election.contested,
        winShare: election.winShare,
        probabilities: election.probabilities,
        costUsd: (stats.swarmForecasts as { costUsd?: number } | undefined)?.costUsd,
      };
      emitProgress(pipelineRunId, "FORESIGHT", "completed",
        `SWARM ELECTED ${election.scenarioId} p=${election.probability.toFixed(2)}${election.contested ? ' (contested)' : ''}`);
      console.log(`${label} FORESIGHT: swarm-elected ${election.scenarioId} p=${election.probability.toFixed(3)} contested=${election.contested}`);
    } else if (!arbiterScenarios || arbiterScenarios.length < 2) {
      stats.foresight = { skipped: true, reason: `only ${arbiterScenarios?.length ?? 0} scenarios from arbiter — Monte Carlo needs ≥ 2` };
      console.log(`${label} FORESIGHT: skipped (only ${arbiterScenarios?.length ?? 0} scenarios from arbiter)`);
    } else if (topSources.length < 10) {
      stats.foresight = { skipped: true, reason: `insufficient evidence (${topSources.length} sources) — Monte Carlo needs ≥ 10 for reliable probabilities` };
      console.log(`${label} FORESIGHT: skipped (only ${topSources.length} sources — insufficient for reliable Monte Carlo)`);
    } else {
      emitProgress(pipelineRunId, "FORESIGHT", "started", "Monte Carlo scenario distribution...");
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
