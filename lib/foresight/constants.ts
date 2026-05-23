/** Institutional labels — France Stratégie × Palantir vocabulary */

export const FORESIGHT_METHODOLOGY =
  "NomosX Foresight v3 — GraphRAG académique, swarm 1024+, dual-channel social, Monte Carlo multi-seed, gate adversarial";

export const FORESIGHT_LAYERS = [
  { id: "graph", label: "GraphRAG", detail: "Entités & relations depuis corpus [SRC-N]" },
  { id: "swarm", label: "Swarm", detail: "1024 agents + 30 voix LLM calibrées" },
  { id: "social", label: "Signal / Forum", detail: "Dynamiques virales & polarisation" },
  { id: "montecarlo", label: "Monte Carlo", detail: "2500+ runs, convergence empirique" },
  { id: "multiseed", label: "Multi-seed", detail: "3 trajectoires indépendantes agrégées" },
  { id: "adversarial", label: "Red Team", detail: "Contre-scenario steel-man obligatoire" },
] as const;
