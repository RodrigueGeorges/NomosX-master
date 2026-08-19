/**
 * ADAS — Automated Design of Agentic Systems — NomosX Sprint 6 (Gap 2)
 *
 * @see ROADMAP_2026.md — Gap 2
 */

export {
  runADASCycle,
  generateCandidates,
  evaluateCandidate,
  computeDiscoveryScore,
  getDiscovery,
  getTopDiscoveries,
  getActiveDiscoveries,
  registerDiscovery,
  loadADASArchive,
} from './adas';
export type {
  AgentDiscovery,
  AgentProgram,
  ADASEvaluation,
  ADASConfig,
} from './adas';
