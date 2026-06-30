/** Public labels for prospective foresight UI */

export const FORESIGHT_METHODOLOGY =
  "NomosX Prospective Engine — cross-domain graph, Monte Carlo distributions, adversarial gate";

export const FORESIGHT_LAYERS = [
  { id: "graph", label: "Evidence graph", detail: "Entities & relations from cited corpus [SRC-N]" },
  { id: "distribution", label: "Distribution", detail: "Probabilistic trajectory runs across scenarios" },
  { id: "signals", label: "Signal layer", detail: "Polarization & momentum dynamics" },
  { id: "montecarlo", label: "Monte Carlo", detail: "2500+ runs, empirical convergence" },
  { id: "multiseed", label: "Multi-seed", detail: "Independent trajectories aggregated" },
  { id: "adversarial", label: "Red team", detail: "Steel-man counter-scenario required" },
] as const;
