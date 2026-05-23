/**
 * NomosX Foresight Engine — institutional architecture layer
 *
 * MiroFish  → swarm simulation + social dynamics
 * Palantir  → graph intelligence + operational telemetry
 * France Stratégie → scenario planning + executive synthesis
 *
 * This module is the canonical public interface for foresight data.
 * Implementation lives in lib/agent/foresight-*.ts + simulation-agent.ts
 */

export type {
  ForesightBundle,
  ForesightScenarioOutcome,
  ForesightTelemetry,
  ForesightPersonaSnapshot,
  ForesightSensitivity,
  ForesightTrajectory,
  ForesightChatRequest,
} from "./types";

export {
  extractForesightFromInquiry,
  extractForesightFromPublicationMeta,
  extractForesightFromLineage,
  buildForesightPersistPayload,
  emptyForesight,
} from "./adapter";

export { FORESIGHT_LAYERS, FORESIGHT_METHODOLOGY } from "./constants";
export { getForesightConfig, isForesightEnabled } from "./config";
export { resolvePublicationPersona } from "./persona-gate";
export { renderSimulationHtmlSection, appendSimulationToHtml, htmlHasForesightSection } from "./html-section";
export { persistForesightRun } from "./persist-run";
export type { PersistForesightRunInput } from "./persist-run";
