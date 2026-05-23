/**
 * Foresight Engine — runtime entry point
 * Delegates to simulation-agent; use lib/foresight for types/adapters/UI
 */

export {
  runSimulationAgent,
  simulationAgent,
  chatWithSimulatedPersona,
  runMonteCarloSimulation,
  computeSensitivityMatrix,
} from "./simulation-agent";

export { buildForesightGraph, graphScenarioBoost } from "./foresight-graph";
export { spawnCrowd, aggregateCrowdMomentum } from "./foresight-swarm";
export { runSocialTick, summarizeFeed } from "./foresight-social";
