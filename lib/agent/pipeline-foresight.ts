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

export function applySimulationToAnalysis(
  analysis: Record<string, unknown>,
  report: SimulationReport
): Record<string, unknown> {
  const scenarios = analysis.scenarios as Array<Record<string, unknown>> | undefined;
  if (!scenarios?.length || !report.output.scenarios.length) {
    return { ...analysis, _simulationReport: report, _foresightRun: report.output };
  }

  const enrichedScenarios = scenarios.map((s, i) => {
    const sim =
      report.output.scenarios.find((o) => o.name === s.name) ?? report.output.scenarios[i];
    if (!sim) return s;
    return {
      ...s,
      probability: `${(sim.empiricalProbability * 100).toFixed(0)}%`,
      empiricalProbability: sim.empiricalProbability,
      confidenceInterval: sim.confidenceInterval,
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
