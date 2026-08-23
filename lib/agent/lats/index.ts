/**
 * LATS — Language Agent Tree Search module — NomosX Sprint 6 (Gap 3)
 *
 * Monte Carlo Tree Search pour le raisonnement des agents.
 * @see ROADMAP_2026.md — Gap 3
 */

export { runLATS, runLATSWithPrism } from './tree-search';
export type {
  LATSTreeNode,
  LATSConfig,
  LATSResult,
  PrismSharedMemory,
  PrismHeuristic,
  PrismFallacy,
} from './tree-search';

// ============================================================================
// K2: MOSA — Mixture-of-Search-Agents (Multi-LLM Collaborative MCTS)
// ACL 2026 (Yang et al.) — "Multi-LLM Collaborative Search for Complex Problem
// Solving"
// ============================================================================
//
// MOSA integrates diverse reasoning pathways by combining independent
// exploration with iterative refinement among multiple LLMs. Using MCTS as a
// backbone, MOSA enables multiple agents to propose and aggregate reasoning
// steps, resulting in improved accuracy.
//
// Architecture:
//   1. Multiple LLMs (DeepSeek, GLM, Kimi) each explore the tree independently
//   2. After each round, the best branches from each LLM are shared
//   3. In the next round, each LLM starts from the shared best branches
//   4. This combines independent exploration with collaborative refinement
//
// Result (paper): consistent improvements over single-agent and other
// multi-agent baselines, particularly in complex reasoning tasks.

export { runMOSA } from './mosa';
export type { MOSAConfig, MOSAResult, MOSAAgent } from './mosa';
