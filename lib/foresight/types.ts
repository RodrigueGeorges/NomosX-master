/**
 * Foresight Engine — canonical types for UI, API, and persistence
 * Institutional grade: France Stratégie × Palantir × NomosX
 */

import type { InquirySectionSimulation } from "@/lib/types/inquiry";

export type ForesightTrajectory = "rising" | "stable" | "declining" | "volatile";

export interface ForesightScenarioOutcome {
  name: string;
  probability: number;
  probabilityLabel: string;
  confidenceInterval: [number, number];
  ciLabel: [string, string];
  trajectory: ForesightTrajectory;
  keyDrivers: string[];
  blockers: string[];
  cascadeEffects: string[];
  sourceGrounded: boolean;
  supportingSourceIds: string[];
  /** Momentum per tick (0-1) for sparkline UI */
  momentumSeries?: number[];
}

export interface ForesightTelemetry {
  swarmSize: number;
  voicePersonas: number;
  seedRuns: number;
  tickCount: number;
  llmTickCount: number;
  socialPostCount: number;
  monteCarloRuns: number;
  monteCarloConverged: boolean;
  graphNodes: number;
  graphEdges: number;
  graphMethod: string;
  sourceCount: number;
  sourceQualityAvg: number;
  adversarialValidated: boolean;
  totalCostUsd?: number;
}

export interface ForesightPersonaSnapshot {
  id: string;
  archetype: string;
  beliefs: string[];
  memory: Array<{ tick: number; observation: string }>;
  positions: Record<string, number>;
}

export interface ForesightSensitivity {
  variable: string;
  scenario: string;
  elasticity: number;
}

export interface ForesightBundle {
  available: boolean;
  question?: string;
  domain?: string;
  depth?: string;
  methodology?: string;
  executiveBrief?: string;
  redTeamChallenge?: string;
  summary?: string;
  scenarios: ForesightScenarioOutcome[];
  telemetry: ForesightTelemetry;
  sensitivity: ForesightSensitivity[];
  personas: ForesightPersonaSnapshot[];
  /** Raw graph nodes for mini-map (optional) */
  graphNodes?: Array<{ id: string; label: string; type: string; weight: number }>;
  inquirySection?: InquirySectionSimulation;
}

export interface ForesightChatRequest {
  personaId: string;
  message: string;
  question: string;
  persona: ForesightPersonaSnapshot;
}
