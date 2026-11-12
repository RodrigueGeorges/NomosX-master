/**
 * Foresight (Monte Carlo swarm) — shared between runPipelineCore and inquiry-pipeline.
 */

import { simulationAgent, type SimulationReport } from './simulation-agent';
import { isForesightEnabled } from '@/lib/foresight/config';
import type { InquiryDepth } from '@/lib/types/inquiry';

export function parsePriorProbability(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return value > 1 ? value / 100 : value;
  }
  if (typeof value === 'string') {
    const match = value.match(/([\d.]+)/);
    if (match) {
      const n = parseFloat(match[1]);
      return value.includes('%') || n > 1 ? n / 100 : n;
    }
  }
  return undefined;
}

/**
 * Round an array of probabilities (0-1) to integer percentages that sum to exactly 100.
 * Uses the largest remainder method (Hamilton's method) to avoid 99% or 101% sums.
 */
export function roundPercentages(probs: number[]): number[] {
  const total = probs.reduce((a, b) => a + b, 0);
  if (total === 0) return probs.map(() => Math.floor(100 / probs.length));
  const scaled = probs.map((p) => (p / total) * 100);
  const floored = scaled.map((v) => Math.floor(v));
  let remainder = 100 - floored.reduce((a, b) => a + b, 0);
  // Distribute remaining percentage points to the largest fractional remainders
  const fracs = scaled
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder; k++) {
    floored[fracs[k % fracs.length].i]++;
  }
  return floored;
}

export function applySimulationToAnalysis(
  analysis: Record<string, unknown>,
  report: SimulationReport
): Record<string, unknown> {
  const scenarios = analysis.scenarios as Array<Record<string, unknown>> | undefined;
  if (!scenarios?.length || !report.output.scenarios.length) {
    return { ...analysis, _simulationReport: report, _foresightRun: report.output };
  }

  // Pre-compute rounded percentages using largest remainder method so they sum to 100
  const simScenarios = scenarios.map((s, i) =>
    report.output.scenarios.find((o) => o.name === s.name) ?? report.output.scenarios[i]
  );
  const probs = simScenarios.map((sim) => sim?.empiricalProbability ?? 0);
  const roundedPcts = roundPercentages(probs);

  const enrichedScenarios = scenarios.map((s, i) => {
    const sim = simScenarios[i];
    if (!sim) return s;
    // Round stored probabilities to 4 decimals — raw MC floats
    // (0.4444135322292309) leak fake precision into analysis JSON, which
    // downstream evaluators (Devil's Advocate) rightly flag as false
    // empirical certainty. 4 decimals keeps the data honest without
    // pretending sub-permil resolution.
    const emp = Math.round((sim.empiricalProbability ?? 0) * 10000) / 10000;
    return {
      ...s,
      probability: `${roundedPcts[i]}%`,
      empiricalProbability: emp,
      confidenceInterval: sim.confidenceInterval,
      // Sync calibratedProbability with Monte Carlo result so the renderer
      // doesn't show a stale Delphi value alongside the Monte Carlo probability
      calibratedProbability: emp,
      trajectory: sim.trajectory,
      keyDrivers: sim.keyDrivers,
      blockers: sim.blockers,
      _simulation: sim,
    };
  });

  return {
    ...analysis,
    scenarios: enrichedScenarios,
    _simulationReport: report,
    _foresightRun: report.output,
  };
}

export interface PipelineForesightInput {
  question: string;
  analysis: Record<string, unknown>;
  domain: string;
  sourceIds: string[];
  isStrategic: boolean;
  depth?: InquiryDepth;
  seedSourceIds?: string[];
}

export interface PipelineForesightResult {
  analysis: Record<string, unknown>;
  report?: SimulationReport;
  skipped: boolean;
  reason?: string;
  costUsd?: number;
}

/**
 * Run Monte Carlo foresight when scenarios exist (≥2).
 * Used inside runPipelineCore (Editorial V2) and inquiry-pipeline (legacy path dedup).
 */
export async function runPipelineForesight(
  input: PipelineForesightInput
): Promise<PipelineForesightResult> {
  const { question, analysis, domain, sourceIds, isStrategic, depth, seedSourceIds } = input;

  if (analysis._simulationReport || analysis._foresightRun) {
    return { analysis, skipped: true, reason: 'already_run' };
  }

  if (!isForesightEnabled()) {
    return { analysis, skipped: true, reason: 'foresight_disabled' };
  }

  const runDepth = depth ?? (isStrategic ? 'strategic' : 'standard');
  // Foresight now enabled for all depths — briefs benefit from probabilistic scenarios too
  // (was: if (runDepth !== 'strategic' && runDepth !== 'deep') skip)

  const scenarios = analysis.scenarios as Array<Record<string, unknown>> | undefined;
  if (!scenarios || scenarios.length < 2) {
    return { analysis, skipped: true, reason: 'insufficient_scenarios' };
  }

  const simSourceIds = [
    ...new Set([...(seedSourceIds ?? []), ...sourceIds]),
  ];

  try {
    const simInput = scenarios.map((s) => ({
      name: String(s.name ?? 'Scenario'),
      description: String(s.description ?? ''),
      assumptions: (s.assumptions as Record<string, number>) ?? {},
      priorProbability: parsePriorProbability(s.probability),
      implications: s.implications ? String(s.implications) : undefined,
      signals: Array.isArray(s.signals) ? (s.signals as string[]) : undefined,
    }));

    const report = await simulationAgent(question, simInput, {
      domain,
      sourceIds: simSourceIds,
      depth: runDepth === 'deep' ? 'deep' : 'strategic',
    });

    return {
      analysis: applySimulationToAnalysis(analysis, report),
      report,
      skipped: false,
      costUsd: report.output.totalCostUsd,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[Pipeline Foresight] failed (non-blocking):', message);
    return { analysis, skipped: true, reason: `error:${message}` };
  }
}
