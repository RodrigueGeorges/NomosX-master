/**
 * NomosX ORCHESTRATOR AGENT — Adaptive Pipeline Controller
 * 
 * Unlike a static sequential pipeline, the Orchestrator makes decisions
 * at each step and can loop back when quality is insufficient:
 * 
 * 1. ASSESS — Evaluate source quality after SCOUT. Not enough? Re-scout with broader terms.
 * 2. DEEPEN — After READER, check if abstracts are sufficient. Need full-text? Trigger PDF extraction.
 * 3. CHALLENGE — After ANALYST, check confidence. Low? Request more sources or a targeted debate.
 * 4. PIVOT — If Knowledge Graph reveals a related angle, suggest pivoting the analysis.
 * 
 * This is what makes NomosX behave like a senior analyst, not a script.
 */

import { callLLM } from '../llm/unified-llm';
import { computeCalibration } from './agent-memory';

// ============================================================================
// TYPES
// ============================================================================

export type OrchestratorAction =
  | "PROCEED"       // Continue to next step
  | "RE_SCOUT"      // Re-search with broader/different terms
  | "DEEPEN"        // Get full-text for key sources
  | "RE_ANALYZE"    // Re-run analyst with different focus
  | "DEBATE"        // Trigger adversarial debate on a specific point
  | "PIVOT"         // Shift analysis angle based on new evidence
  | "ABORT";        // Stop pipeline — insufficient data

export interface OrchestratorDecision {
  action: OrchestratorAction;
  reason: string;
  params?: {
    newTerms?: string[];       // For RE_SCOUT
    sourceIds?: string[];      // For DEEPEN
    focus?: string;            // For RE_ANALYZE
    debateTopic?: string;      // For DEBATE
    suggestedAngle?: string;   // For PIVOT
  };
}

export interface PipelineState {
  query: string;
  iteration: number;
  maxIterations: number;

  // Source metrics
  sourcesFound: number;
  sourcesWithAbstract: number;
  sourcesWithFullText: number;
  avgQualityScore: number;
  providerDiversity: number;

  // Analysis quality
  analystConfidence: string | null;
  citationCoverage: number | null;
  trustScore: number | null;

  // Context
  contextPrimed: boolean;
  knownConceptCount: number;
  priorBriefCount: number;

  // History of decisions
  decisions: OrchestratorDecision[];

  // Calibrated thresholds (from AgentMemory — overrides static THRESHOLDS when set)
  thresholds?: typeof THRESHOLDS;
}

// ============================================================================
// THRESHOLDS — Calibrated for think-tank quality
// ============================================================================

const THRESHOLDS = {
  // Minimum sources to proceed with analysis
  MIN_SOURCES: 5,
  MIN_SOURCES_STRATEGIC: 10,

  // Minimum % of sources with abstracts
  MIN_ABSTRACT_COVERAGE: 0.6,

  // Minimum average quality score (0-100)
  MIN_AVG_QUALITY: 55,

  // Minimum provider diversity (distinct providers)
  MIN_PROVIDER_DIVERSITY: 2,
  MIN_PROVIDER_DIVERSITY_STRATEGIC: 3,

  // Trust score threshold for publication
  MIN_TRUST_SCORE: 65,

  // Citation coverage threshold
  MIN_CITATION_COVERAGE: 0.5,

  // Max iterations to prevent infinite loops
  MAX_ITERATIONS: 3,
};

/**
 * Load calibrated thresholds from AgentMemory.
 * Falls back to static THRESHOLDS if no history exists.
 * Called once per pipeline run to avoid repeated DB queries.
 */
export async function loadCalibratedThresholds(domain?: string): Promise<typeof THRESHOLDS> {
  try {
    const [analystCal, scoutCal] = await Promise.all([
      computeCalibration("analyst", domain as any, 90),
      computeCalibration("strategic-analyst", domain as any, 90),
    ]);

    // Use the better-performing agent's calibration
    const bestCal = analystCal.totalRuns >= scoutCal.totalRuns ? analystCal : scoutCal;

    if (bestCal.totalRuns < 3) {
      // Not enough history — use static thresholds
      return THRESHOLDS;
    }

    // Adjust MIN_TRUST_SCORE based on historical average
    // If agent consistently scores 80+, raise the bar; if struggling, keep it achievable
    const adjustedTrustScore = Math.max(
      55,
      Math.min(80, bestCal.avgTrustScore > 0 ? Math.round(bestCal.avgTrustScore * 0.85) : THRESHOLDS.MIN_TRUST_SCORE)
    );

    // Adjust MIN_AVG_QUALITY based on calibration
    const adjustedQuality = Math.max(
      45,
      Math.min(70, bestCal.minQualityThreshold)
    );

    return {
      ...THRESHOLDS,
      MIN_TRUST_SCORE: adjustedTrustScore,
      MIN_AVG_QUALITY: adjustedQuality,
    };
  } catch {
    return THRESHOLDS;
  }
}

// ============================================================================
// CHECKPOINT EVALUATORS
// ============================================================================

/**
 * Checkpoint 1: After SCOUT — Are sources sufficient?
 */
export function assessAfterScout(state: PipelineState): OrchestratorDecision {
  const T = state.thresholds ?? THRESHOLDS;
  const isStrategic = state.maxIterations > 1;
  const minSources = isStrategic ? T.MIN_SOURCES_STRATEGIC : T.MIN_SOURCES;
  const minDiversity = isStrategic ? T.MIN_PROVIDER_DIVERSITY_STRATEGIC : T.MIN_PROVIDER_DIVERSITY;

  // Not enough sources
  if (state.sourcesFound < minSources) {
    if (state.iteration >= T.MAX_ITERATIONS) {
      return {
        action: "PROCEED",
        reason: `Only ${state.sourcesFound} sources found (min: ${minSources}), but max iterations reached. Proceeding with available data.`,
      };
    }
    return {
      action: "RE_SCOUT",
      reason: `Only ${state.sourcesFound} sources found (min: ${minSources}). Broadening search.`,
      params: { newTerms: [] },
    };
  }

  // Low provider diversity
  if (state.providerDiversity < minDiversity) {
    if (state.iteration >= T.MAX_ITERATIONS) {
      return {
        action: "PROCEED",
        reason: `Low provider diversity (${state.providerDiversity}/${minDiversity}), but max iterations reached.`,
      };
    }
    return {
      action: "RE_SCOUT",
      reason: `Low provider diversity: ${state.providerDiversity} providers (min: ${minDiversity}). Adding more sources.`,
      params: { newTerms: [] },
    };
  }

  // Low average quality
  if (state.avgQualityScore < T.MIN_AVG_QUALITY && state.iteration < T.MAX_ITERATIONS) {
    return {
      action: "RE_SCOUT",
      reason: `Average quality ${state.avgQualityScore.toFixed(0)} below threshold ${T.MIN_AVG_QUALITY}. Searching for higher-quality sources.`,
      params: { newTerms: [] },
    };
  }

  return {
    action: "PROCEED",
    reason: `${state.sourcesFound} sources from ${state.providerDiversity} providers, avg quality ${state.avgQualityScore.toFixed(0)}. Sufficient for analysis.`,
  };
}

/**
 * Checkpoint 2: After READER — Is extracted content sufficient?
 */
export function assessAfterReader(state: PipelineState): OrchestratorDecision {
  const T = state.thresholds ?? THRESHOLDS;
  const abstractCoverage = state.sourcesFound > 0
    ? state.sourcesWithAbstract / state.sourcesFound
    : 0;

  // Very low abstract coverage
  if (abstractCoverage < T.MIN_ABSTRACT_COVERAGE) {
    if (state.iteration >= T.MAX_ITERATIONS) {
      return {
        action: "PROCEED",
        reason: `Low abstract coverage (${(abstractCoverage * 100).toFixed(0)}%), but max iterations reached.`,
      };
    }
    return {
      action: "DEEPEN",
      reason: `Only ${(abstractCoverage * 100).toFixed(0)}% of sources have abstracts (min: ${T.MIN_ABSTRACT_COVERAGE * 100}%). Attempting full-text extraction.`,
      params: { sourceIds: [] },
    };
  }

  return {
    action: "PROCEED",
    reason: `${state.sourcesWithAbstract}/${state.sourcesFound} sources have abstracts (${(abstractCoverage * 100).toFixed(0)}%). Sufficient for analysis.`,
  };
}

/**
 * Checkpoint 3: After ANALYST — Is analysis quality sufficient?
 */
export function assessAfterAnalyst(state: PipelineState): OrchestratorDecision {
  const T = state.thresholds ?? THRESHOLDS;
  // Low confidence from analyst
  if (state.analystConfidence === "low" && state.iteration < T.MAX_ITERATIONS) {
    return {
      action: "RE_ANALYZE",
      reason: "Analyst confidence is LOW. Re-analyzing with narrower focus.",
      params: { focus: "Focus on the strongest evidence and most cited claims only." },
    };
  }

  // Low citation coverage
  if (state.citationCoverage !== null && state.citationCoverage < T.MIN_CITATION_COVERAGE) {
    if (state.iteration >= T.MAX_ITERATIONS) {
      return {
        action: "PROCEED",
        reason: `Citation coverage ${(state.citationCoverage * 100).toFixed(0)}% below threshold, but max iterations reached.`,
      };
    }
    return {
      action: "RE_ANALYZE",
      reason: `Citation coverage only ${(state.citationCoverage * 100).toFixed(0)}% (min: ${T.MIN_CITATION_COVERAGE * 100}%). Re-analyzing with stronger citation requirements.`,
      params: { focus: "Ensure every claim is backed by at least one [SRC-N] citation." },
    };
  }

  return {
    action: "PROCEED",
    reason: `Analysis quality acceptable: confidence=${state.analystConfidence || "N/A"}, citations=${state.citationCoverage ? (state.citationCoverage * 100).toFixed(0) + "%" : "N/A"}.`,
  };
}

/**
 * Checkpoint 4: After CRITICAL LOOP — Final quality gate
 */
export function assessAfterCriticalLoop(state: PipelineState): OrchestratorDecision {
  const T = state.thresholds ?? THRESHOLDS;
  if (state.trustScore !== null && state.trustScore < T.MIN_TRUST_SCORE) {
    if (state.iteration >= T.MAX_ITERATIONS) {
      return {
        action: "PROCEED",
        reason: `Trust score ${state.trustScore} below ${T.MIN_TRUST_SCORE}, but max iterations reached. Publishing with disclaimer.`,
      };
    }
    return {
      action: "DEBATE",
      reason: `Trust score ${state.trustScore} below ${T.MIN_TRUST_SCORE}. Triggering adversarial debate to strengthen weak points.`,
      params: { debateTopic: state.query },
    };
  }

  return {
    action: "PROCEED",
    reason: `Trust score ${state.trustScore ?? "N/A"} meets threshold. Ready for publication.`,
  };
}

// ============================================================================
// LLM-POWERED QUERY EXPANSION (for RE_SCOUT)
// ============================================================================

/**
 * When the Orchestrator decides to RE_SCOUT, use LLM to generate
 * better search terms based on what was found (or not found).
 */
export async function generateExpandedTerms(
  originalQuery: string,
  currentSourceCount: number,
  existingProviders: string[]
): Promise<{ terms: string[]; costUsd: number }> {
  const result = await callLLM({
    messages: [
      {
        role: "system",
        content: "You are a research librarian. Given a query that returned insufficient results, generate 3-5 alternative search terms that would find more relevant academic sources. Return JSON: { \"terms\": [\"term1\", \"term2\", ...] }",
      },
      {
        role: "user",
        content: `Original query: "${originalQuery}"\nCurrent results: ${currentSourceCount} sources from providers: ${existingProviders.join(", ")}\n\nGenerate broader/alternative search terms to find more relevant sources.`,
      },
    ],
    temperature: 0.3,
    maxTokens: 200,
    jsonMode: true,
  });

  try {
    const parsed = JSON.parse(result.content);
    return {
      terms: parsed.terms || [],
      costUsd: result.costUsd,
    };
  } catch {
    return { terms: [], costUsd: result.costUsd };
  }
}

// ============================================================================
// STATE FACTORY
// ============================================================================

/**
 * Create initial pipeline state.
 */
export function createPipelineState(
  query: string,
  isStrategic: boolean = false
): PipelineState {
  return {
    query,
    iteration: 0,
    maxIterations: isStrategic ? 3 : 2,
    sourcesFound: 0,
    sourcesWithAbstract: 0,
    sourcesWithFullText: 0,
    avgQualityScore: 0,
    providerDiversity: 0,
    analystConfidence: null,
    citationCoverage: null,
    trustScore: null,
    contextPrimed: false,
    knownConceptCount: 0,
    priorBriefCount: 0,
    decisions: [],
    thresholds: undefined,
  };
}

/**
 * Record a decision in the pipeline state.
 */
export function recordDecision(state: PipelineState, decision: OrchestratorDecision): PipelineState {
  console.log(`[ORCHESTRATOR] Decision: ${decision.action} — ${decision.reason}`);
  return {
    ...state,
    iteration: decision.action !== "PROCEED" ? state.iteration + 1 : state.iteration,
    decisions: [...state.decisions, decision],
  };
}
