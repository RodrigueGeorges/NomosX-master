/**
 * Foresight adapter — normalize pipeline / publication artifacts → ForesightBundle
 */

import type { Inquiry, InquirySectionSimulation } from "@/lib/types/inquiry";
import type {
  ForesightBundle,
  ForesightPersonaSnapshot,
  ForesightScenarioOutcome,
  ForesightTelemetry,
  ForesightTrajectory,
} from "./types";

function parsePercent(s: string): number {
  const n = parseFloat(s.replace("%", "").trim());
  return Number.isFinite(n) ? n / 100 : 0;
}

function trajectoryOf(v: string): ForesightTrajectory {
  if (v === "rising" || v === "declining" || v === "volatile") return v;
  return "stable";
}

function fromInquirySection(section: InquirySectionSimulation): ForesightBundle {
  const scenarios: ForesightScenarioOutcome[] = section.outcomes.map((o) => ({
    name: o.name,
    probability: parsePercent(o.empiricalProbability),
    probabilityLabel: o.empiricalProbability,
    confidenceInterval: [parsePercent(o.confidenceInterval[0]), parsePercent(o.confidenceInterval[1])],
    ciLabel: o.confidenceInterval,
    trajectory: trajectoryOf(o.trajectory),
    keyDrivers: o.keyDrivers,
    blockers: o.blockers,
    cascadeEffects: o.cascadeEffects ?? [],
    sourceGrounded: o.sourceGrounded,
    supportingSourceIds: o.supportingSourceIds ?? [],
  }));

  return {
    available: true,
    methodology: section.methodology,
    executiveBrief: section.executiveBrief,
    redTeamChallenge: section.redTeamChallenge,
    scenarios,
    telemetry: {
      swarmSize: section.swarmSize ?? section.personaCount,
      voicePersonas: section.personaCount,
      seedRuns: section.seedRuns ?? 1,
      tickCount: section.tickCount,
      llmTickCount: section.llmTickCount ?? 0,
      socialPostCount: section.socialPostCount ?? 0,
      monteCarloRuns: section.monteCarloRuns,
      monteCarloConverged: section.converged,
      graphNodes: 0,
      graphEdges: 0,
      graphMethod: "inquiry-section",
      sourceCount: section.traceability.sourceIds.length,
      sourceQualityAvg: section.traceability.sourceQualityAvg ?? 0,
      adversarialValidated: section.traceability.adversarialValidated,
    },
    sensitivity: section.sensitivity ?? [],
    personas: [],
    inquirySection: section,
  };
}

function extractMomentumSeries(
  ticks: Array<{ scenarioStates?: Record<string, { momentum?: number }> }> | undefined,
  scenarioName: string
): number[] | undefined {
  if (!ticks?.length) return undefined;
  return ticks.map((t) => t.scenarioStates?.[scenarioName]?.momentum ?? 0);
}

function fromSimulationOutput(raw: Record<string, unknown>): ForesightBundle | null {
  const scenariosRaw = raw.scenarios as Array<Record<string, unknown>> | undefined;
  if (!scenariosRaw?.length) return null;

  const ticks = raw.ticks as Array<{ scenarioStates?: Record<string, { momentum?: number }> }> | undefined;

  const scenarios: ForesightScenarioOutcome[] = scenariosRaw.map((s) => {
    const name = String(s.name ?? "Scenario");
    const p = typeof s.empiricalProbability === "number" ? s.empiricalProbability : 0;
    const ci = s.confidenceInterval as [number, number] | undefined;
    return {
      name,
      probability: p,
      probabilityLabel: `${(p * 100).toFixed(0)}%`,
      confidenceInterval: ci ?? [Math.max(0, p - 0.1), Math.min(1, p + 0.1)],
      ciLabel: ci
        ? [`${(ci[0] * 100).toFixed(0)}%`, `${(ci[1] * 100).toFixed(0)}%`]
        : ["—", "—"],
      trajectory: trajectoryOf(String(s.trajectory ?? "stable")),
      keyDrivers: (s.keyDrivers as string[]) ?? [],
      blockers: (s.blockers as string[]) ?? [],
      cascadeEffects: (s.cascadeEffects as string[]) ?? [],
      sourceGrounded: Boolean(s.sourceGrounded),
      supportingSourceIds: (s.supportingSourceIds as string[]) ?? [],
      momentumSeries: extractMomentumSeries(ticks, name),
    };
  });

  const trace = (raw.traceability ?? {}) as Record<string, unknown>;
  const fg = (raw.foresightGraph ?? {}) as Record<string, unknown>;
  const graphNodesRaw = raw.graphNodes as Array<{ id: string; label: string; type: string; weight: number }> | undefined;
  const personas = ((raw.personaSnapshots ?? []) as ForesightPersonaSnapshot[]).map((p) => ({
    id: p.id,
    archetype: p.archetype,
    beliefs: p.beliefs ?? [],
    memory: p.memory ?? [],
    positions: p.positions ?? {},
  }));

  const sensitivityRaw = (raw.sensitivity as Record<string, unknown> | undefined)?.entries as
    | Array<{ variable: string; scenario: string; elasticity: number }>
    | undefined;

  return {
    available: true,
    executiveBrief: raw.executiveBrief ? String(raw.executiveBrief) : undefined,
    redTeamChallenge: raw.redTeamChallenge ? String(raw.redTeamChallenge) : undefined,
    scenarios,
    telemetry: {
      swarmSize: Number(raw.swarmSize ?? raw.personaCount ?? 0),
      voicePersonas: Number(raw.personaCount ?? 0),
      seedRuns: Number(raw.seedRuns ?? 1),
      tickCount: Array.isArray(raw.ticks) ? raw.ticks.length : 0,
      llmTickCount: Number(raw.llmTickCount ?? 0),
      socialPostCount: Number(raw.socialPostCount ?? 0),
      monteCarloRuns: Number(raw.monteCarloRuns ?? 0),
      monteCarloConverged: Boolean(raw.monteCarloConverged),
      graphNodes: Number(fg.nodeCount ?? 0),
      graphEdges: Number(fg.edgeCount ?? 0),
      graphMethod: String(fg.method ?? "unknown"),
      sourceCount: Array.isArray(trace.sourceIds) ? trace.sourceIds.length : 0,
      sourceQualityAvg: Number(trace.sourceQualityAvg ?? 0),
      adversarialValidated: Boolean(trace.adversarialValidated),
      totalCostUsd: typeof raw.totalCostUsd === "number" ? raw.totalCostUsd : undefined,
    },
    sensitivity: sensitivityRaw ?? [],
    personas,
    graphNodes: graphNodesRaw,
  };
}

export function extractForesightFromInquiry(inquiry: Inquiry): ForesightBundle {
  const section = inquiry.sections.find(
    (s): s is InquirySectionSimulation => s.type === "simulation"
  );
  if (section) {
    const bundle = fromInquirySection(section);
    bundle.question = inquiry.question;
    bundle.domain = inquiry.domain;
    bundle.depth = inquiry.depth;
    return bundle;
  }
  return emptyForesight();
}

export function extractForesightFromPublicationMeta(meta: Record<string, unknown>): ForesightBundle {
  const sim = meta.simulation as Record<string, unknown> | undefined;
  if (sim) {
    const fromSim = fromSimulationOutput(sim);
    if (fromSim) {
      fromSim.question = meta.question ? String(meta.question) : fromSim.question;
      fromSim.domain = meta.domain ? String(meta.domain) : fromSim.domain;
      fromSim.depth = meta.depth ? String(meta.depth) : fromSim.depth;
      fromSim.summary = meta.simulationSummary ? String(meta.simulationSummary) : fromSim.summary;
      return fromSim;
    }
  }

  const foresight = meta.foresight as ForesightBundle | undefined;
  if (foresight?.available) return foresight;

  return emptyForesight();
}

export function extractForesightFromLineage(lineage: Record<string, unknown>): ForesightBundle {
  const sim = lineage.simulation as Record<string, unknown> | undefined;
  if (sim) {
    const bundle = fromSimulationOutput(sim);
    if (bundle) {
      bundle.summary = lineage.simulationSummary ? String(lineage.simulationSummary) : bundle.summary;
      return bundle;
    }
  }
  return emptyForesight();
}

export function buildForesightPersistPayload(
  lineage: Record<string, unknown>,
  inquiry: Inquiry
): Record<string, unknown> {
  const sim = lineage.simulation as Record<string, unknown> | undefined;
  let bundle = emptyForesight();

  if (sim) {
    const fromSim = fromSimulationOutput(sim);
    if (fromSim) bundle = fromSim;
  }
  if (!bundle.available) {
    bundle = extractForesightFromInquiry(inquiry);
  }
  if (bundle.available) {
    bundle.question = inquiry.question;
    bundle.domain = inquiry.domain;
    bundle.depth = inquiry.depth;
    bundle.summary = lineage.simulationSummary ? String(lineage.simulationSummary) : bundle.summary;
    if (sim?.graphNodes) {
      bundle.graphNodes = sim.graphNodes as ForesightBundle["graphNodes"];
    }
  }

  return {
    simulation: lineage.simulation,
    simulationSummary: lineage.simulationSummary,
    simulationContextBlock: lineage.simulationContextBlock,
    foresight: bundle.available ? bundle : undefined,
  };
}

export function emptyForesight(): ForesightBundle {
  return {
    available: false,
    scenarios: [],
    telemetry: {
      swarmSize: 0,
      voicePersonas: 0,
      seedRuns: 0,
      tickCount: 0,
      llmTickCount: 0,
      socialPostCount: 0,
      monteCarloRuns: 0,
      monteCarloConverged: false,
      graphNodes: 0,
      graphEdges: 0,
      graphMethod: "none",
      sourceCount: 0,
      sourceQualityAvg: 0,
      adversarialValidated: false,
    },
    sensitivity: [],
    personas: [],
  };
}
