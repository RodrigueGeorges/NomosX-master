/**
 * Adaptive Topology Selection — NomosX
 *
 * Inspired by AdaptOrch (arXiv 2026):
 * - Automatically selects pipeline topology (parallel vs sequential vs hierarchical)
 *   based on query complexity and task DAG analysis.
 * - Performance Convergence Scaling Law: when LLMs converge in capability,
 *   orchestration dominates model selection. +12-23% on SWE-bench/GPQA.
 *
 * The NomosX pipeline is currently sequential fixed:
 *   SCOUT → INDEX → RANK → READER → ANALYST → EDITOR → GUARD → PUBLISHER
 *
 * This module determines which stages CAN run in parallel based on query
 * characteristics, and provides a topology plan that the pipeline can follow.
 *
 * Key insight: simple factual queries benefit from parallel retrieval
 * (multiple providers at once), while complex analytical queries benefit
 * from hierarchical decomposition (break into sub-questions, solve each,
 * then synthesize). The current pipeline already does parallel SCOUT
 * (multiple providers), so this module formalizes the decision.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type TopologyType = 'sequential' | 'parallel' | 'hierarchical' | 'hybrid';

export interface TopologyPlan {
  topology: TopologyType;
  /** Stages that can run in parallel */
  parallelStages: string[];
  /** Stages that must run sequentially */
  sequentialStages: string[];
  /** Estimated speedup factor (1.0 = no speedup, 2.0 = 2x faster) */
  estimatedSpeedup: number;
  /** Reasoning for the topology choice */
  rationale: string;
}

export interface QueryComplexitySignals {
  wordCount: number;
  isStrategic: boolean;
  hasMultipleDomains: boolean;
  hasTemporalIndicators: boolean;
  hasComparativeElements: boolean;
  hasCausalReasoning: boolean;
  sourceCount: number;
}

// ─── Topology Selection ─────────────────────────────────────────────────────

/**
 * Analyze query characteristics and recommend a pipeline topology.
 *
 * Decision matrix:
 * - Simple factual (<10 words, single domain) → parallel (fast retrieval)
 * - Complex analytical (>15 words, multi-domain) → hierarchical (decompose)
 * - Comparative (X vs Y) → hybrid (parallel sub-analyses + sequential synthesis)
 * - Default → sequential (current behavior, safe)
 */
export function selectTopology(signals: QueryComplexitySignals): TopologyPlan {
  const {
    wordCount,
    isStrategic,
    hasMultipleDomains,
    hasTemporalIndicators,
    hasComparativeElements,
    hasCausalReasoning,
    sourceCount,
  } = signals;

  // Complexity score: 0-10
  let complexity = 0;
  if (wordCount > 15) complexity += 2;
  if (wordCount > 30) complexity += 1;
  if (isStrategic) complexity += 3;
  if (hasMultipleDomains) complexity += 2;
  if (hasTemporalIndicators) complexity += 1;
  if (hasComparativeElements) complexity += 1;
  if (hasCausalReasoning) complexity += 1;

  // ── Hierarchical: complex multi-domain strategic queries ──
  // Break into sub-questions, solve each independently, then synthesize.
  // This is what the MoA (Mixture of Agents) already does partially.
  if (complexity >= 7) {
    return {
      topology: 'hierarchical',
      parallelStages: ['SCOUT', 'READER', 'ANALYST'],
      sequentialStages: ['INDEX', 'RANK', 'EDITOR', 'GUARD', 'PUBLISHER'],
      estimatedSpeedup: 1.4,
      rationale: `High complexity (${complexity}/10): ${wordCount} words, ${hasMultipleDomains ? 'multi-domain' : 'single-domain'}, ` +
        `${isStrategic ? 'strategic' : 'brief'}. Decompose into sub-questions, solve in parallel, synthesize sequentially.`,
    };
  }

  // ── Hybrid: comparative queries ──
  // Run parallel sub-analyses for each comparison axis, then sequential synthesis.
  if (hasComparativeElements && complexity >= 4) {
    return {
      topology: 'hybrid',
      parallelStages: ['SCOUT', 'READER'],
      sequentialStages: ['INDEX', 'RANK', 'ANALYST', 'EDITOR', 'GUARD', 'PUBLISHER'],
      estimatedSpeedup: 1.2,
      rationale: `Comparative query (${complexity}/10): parallel retrieval for each comparison axis, ` +
        `sequential synthesis to merge perspectives.`,
    };
  }

  // ── Parallel: simple queries with many sources ──
  // All retrieval stages can run in parallel, only synthesis is sequential.
  if (complexity < 4 && sourceCount > 10) {
    return {
      topology: 'parallel',
      parallelStages: ['SCOUT', 'INDEX', 'RANK', 'READER'],
      sequentialStages: ['ANALYST', 'EDITOR', 'GUARD', 'PUBLISHER'],
      estimatedSpeedup: 1.6,
      rationale: `Simple query (${complexity}/10) with ${sourceCount} sources: ` +
        `parallel retrieval pipeline, sequential synthesis.`,
    };
  }

  // ── Sequential: default (current behavior) ──
  return {
    topology: 'sequential',
    parallelStages: [],
    sequentialStages: ['SCOUT', 'INDEX', 'RANK', 'READER', 'ANALYST', 'EDITOR', 'GUARD', 'PUBLISHER'],
    estimatedSpeedup: 1.0,
    rationale: `Moderate complexity (${complexity}/10): sequential pipeline is optimal. ` +
      `No parallelization benefit outweighs the coordination overhead.`,
  };
}

/**
 * Extract complexity signals from a query and pipeline context.
 */
export function extractComplexitySignals(
  query: string,
  isStrategic: boolean,
  sourceCount: number,
): QueryComplexitySignals {
  const wordCount = query.split(/\s+/).filter(Boolean).length;
  const hasTemporalIndicators = /\b(will|forecast|predict|project|by\s+20\d\d|future|trajectory|emerging|evolve|outlook)\b/i.test(query);
  const hasComparativeElements = /\b(vs|versus|compared?|comparison|contrast|better|worse|alternative)\b/i.test(query);
  const hasCausalReasoning = /\b(because|cause|effect|impact|consequence|lead\s+to|result\s+in|due\s+to)\b/i.test(query);
  const hasMultipleDomains = /\b(economic|political|social|technological|environmental|legal|cultural|military)\b/gi.test(query)
    ? (query.match(/\b(economic|political|social|technological|environmental|legal|cultural|military)\b/gi) || []).length > 1
    : false;

  return {
    wordCount,
    isStrategic,
    hasMultipleDomains,
    hasTemporalIndicators,
    hasComparativeElements,
    hasCausalReasoning,
    sourceCount,
  };
}
