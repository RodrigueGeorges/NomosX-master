/**
 * Witness Types — NomosX
 *
 * Types et interfaces du Witness pattern (méta-conscience).
 * Inspiré de Sakshi (bionicbutterfly13/sakshi) — le Witness observe
 * le pipeline sans faire le travail lui-même.
 *
 * Le Witness :
 * - Observe chaque cycle du pipeline via des seams typés
 * - Évalue si le résultat correspond aux attentes
 * - Peut intervenir (via WriteGuard) quand quelque chose va mal
 * - Apprend entre les runs pour améliorer les prompts et seuils
 *
 * Cycle cognitif à 6 phases :
 *   PERCEIVE → INTERPRET → EVAL → INTEND → PLAN → ACT
 *
 * Méta-loop :
 *   MONITOR → ASSESS → CONTROL
 */

// ─── Core Phase Types ───────────────────────────────────────────────────────

export type CognitivePhase =
  | 'PERCEIVE'    // Receive raw observations from the pipeline
  | 'INTERPRET'   // Make sense of what happened
  | 'EVAL'        // Evaluate against expectations
  | 'INTEND'      // Decide what to do (if anything)
  | 'PLAN'        // Plan the intervention
  | 'ACT';        // Execute the intervention (via WriteGuard)

export type MetaPhase =
  | 'MONITOR'     // Watch the overall pipeline health
  | 'ASSESS'      // Assess if the pipeline is on track
  | 'CONTROL';    // Control / steer the pipeline if needed

// ─── Cycle Trace ────────────────────────────────────────────────────────────

/**
 * Trace of one cognitive cycle of the Witness.
 * One cycle = one observation of one pipeline step.
 */
export interface CycleTrace {
  id: string;
  /** Which pipeline step was observed */
  pipelineStep: string;
  /** When the observation started */
  startedAt: number;
  /** When the observation ended */
  endedAt: number;
  /** Duration in ms */
  durationMs: number;
  /** Phase outputs */
  phases: Partial<Record<CognitivePhase, PhaseResult>>;
  /** Whether the Witness decided to intervene */
  intervened: boolean;
  /** If intervened, the intervention record */
  intervention?: InterventionRecord;
  /** Anomalies detected during this cycle */
  anomalies: AnomalyEvent[];
  /** Overall assessment */
  assessment: CycleAssessment;
}

export interface PhaseResult {
  phase: CognitivePhase;
  /** What the Witness perceived/interpreted/evaluated */
  output: string;
  /** Confidence in this phase's output (0-1) */
  confidence: number;
  /** Duration of this phase in ms */
  durationMs: number;
}

export interface CycleAssessment {
  /** Is the pipeline step on track? */
  onTrack: boolean;
  /** Severity of any issue detected */
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  /** What went wrong (if anything) */
  issues: string[];
  /** What the Witness recommends */
  recommendations: string[];
}

// ─── Anomaly Detection ──────────────────────────────────────────────────────

export type AnomalyType =
  | 'cost_overrun'        // Step cost more than expected
  | 'latency_spike'       // Step took much longer than expected
  | 'quality_drop'        // Output quality is lower than previous runs
  | 'hallucination_risk'  // Output contains likely hallucinations
  | 'citation_gap'        // Output has insufficient citations
  | 'loop_stuck'          // Agent is looping without progress
  | 'budget_depletion'    // Budget is running out
  | 'contradiction'       // Output contradicts previous findings
  | 'empty_output'        // Step produced no useful output
  | 'rate_limit'          // Provider rate-limited the call
  | 'refusal'             // LLM refused to answer
  | 'custom';             // Custom anomaly type

export interface AnomalyEvent {
  id: string;
  type: AnomalyType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  /** The metric value that triggered the anomaly */
  triggerValue?: number;
  /** The expected value / threshold */
  expectedValue?: number;
  /** Which pipeline step */
  pipelineStep: string;
  /** When detected */
  timestamp: number;
  /** Suggested intervention */
  suggestedIntervention?: InterventionType;
}

// ─── Interventions ──────────────────────────────────────────────────────────

export type InterventionType =
  | 'force_synthesis'       // Force the agent to produce output now
  | 'abort_step'            // Abort the current step, use fallback
  | 'adjust_threshold'      // Adjust a threshold (e.g., trust score)
  | 'modify_prompt'         // Modify the prompt for the next call
  | 'switch_provider'       // Switch to a different LLM provider
  | 'reduce_scope'          // Reduce the scope of the analysis
  | 'request_human_review'  // Flag for human review
  | 'skip_optional_step'    // Skip an optional step to save budget
  | 'add_step'              // Add a step to the pipeline
  | 'retry_with_feedback'   // Retry the step with feedback injected
  | 'log_only';             // Just log the anomaly, don't intervene

export interface InterventionRecord {
  id: string;
  type: InterventionType;
  /** Which pipeline step triggered the intervention */
  pipelineStep: string;
  /** Why the Witness intervened */
  reason: string;
  /** What the intervention does */
  action: string;
  /** Parameters for the intervention */
  params: Record<string, any>;
  /** Whether the WriteGuard approved the intervention */
  approved: boolean;
  /** If not approved, why */
  rejectionReason?: string;
  /** When the intervention was requested */
  requestedAt: number;
  /** When the intervention was executed (if approved) */
  executedAt?: number;
  /** Result of the intervention */
  result?: 'success' | 'failed' | 'partial';
}

// ─── Guard Verdicts ─────────────────────────────────────────────────────────

export type GuardVerdict =
  | 'permit'        // Intervention approved
  | 'deny'          // Intervention rejected
  | 'require_human' // Requires human approval
  | 'modify';       // Approved with modifications

export interface GuardDecision {
  verdict: GuardVerdict;
  reason: string;
  /** If 'modify', the modified params */
  modifiedParams?: Record<string, any>;
}

// ─── Expectations ───────────────────────────────────────────────────────────

/**
 * What the Witness expects from a pipeline step.
 * These are declared before the step runs, so the Witness can compare
 * actual results against expectations.
 */
export interface StepExpectation {
  pipelineStep: string;
  /** Expected cost range in USD */
  expectedCostUsd?: { min: number; max: number };
  /** Expected duration in seconds */
  expectedDurationSec?: { min: number; max: number };
  /** Expected output quality (0-100) */
  expectedQuality?: { min: number; max: number };
  /** Minimum citations expected in the output */
  minCitations?: number;
  /** Maximum hallucination risk (0-1) */
  maxHallucinationRisk?: number;
  /** Must produce non-empty output */
  mustProduceOutput?: boolean;
  /** Custom validation function name */
  customValidator?: string;
}

// ─── Pipeline Observation ───────────────────────────────────────────────────

/**
 * What the Witness observes about a pipeline step after it runs.
 * This is the raw input to the PERCEIVE phase.
 */
export interface PipelineObservation {
  pipelineStep: string;
  /** Whether the step succeeded */
  success: boolean;
  /** Cost in USD */
  costUsd: number;
  /** Duration in ms */
  durationMs: number;
  /** Output summary (truncated) */
  outputSummary: string;
  /** Output metrics */
  metrics: Record<string, number>;
  /** Any errors */
  errors: string[];
  /** LLM calls made during this step */
  llmCalls: Array<{
    provider: string;
    model: string;
    costUsd: number;
    tokensInput: number;
    tokensOutput: number;
    latencyMs: number;
    finishReason?: string;
  }>;
  /** When the step started */
  startedAt: number;
  /** When the step ended */
  endedAt: number;
}

// ─── Witness State ──────────────────────────────────────────────────────────

/**
 * The Witness's persistent state across cycles within a single pipeline run.
 */
export interface WitnessState {
  /** Pipeline run ID */
  runId: string;
  /** All cycle traces for this run */
  cycleTraces: CycleTrace[];
  /** All anomalies detected in this run */
  anomalies: AnomalyEvent[];
  /** All interventions in this run */
  interventions: InterventionRecord[];
  /** Total cost observed */
  totalCostUsd: number;
  /** Budget cap for this run */
  budgetCapUsd: number;
  /** Current step index */
  currentStep: number;
  /** Whether the Witness has intervened in this run */
  hasIntervened: boolean;
  /** Health score (0-100) — decreases with anomalies, increases with clean cycles */
  healthScore: number;
  /** Learning context accumulated during the run */
  learningContext: string[];
}

// ─── Cross-Run Learning ─────────────────────────────────────────────────────

/**
 * What the Witness learned from a complete pipeline run.
 * Used for cross-run improvement (the "improvement" layer).
 */
export interface RunLearning {
  runId: string;
  query: string;
  /** What went well */
  successes: string[];
  /** What went wrong */
  failures: string[];
  /** Anomalies that recurred */
  recurringAnomalies: AnomalyType[];
  /** Prompt modifications suggested */
  promptModifications: PromptModification[];
  /** Threshold adjustments suggested */
  thresholdAdjustments: ThresholdAdjustment[];
  /** Overall quality score (0-100) */
  qualityScore: number;
  /** Whether the Witness recommends changes for future runs */
  recommendsChanges: boolean;
  /** Timestamp */
  timestamp: number;
}

export interface PromptModification {
  agentId: string;
  /** Current prompt fragment */
  currentFragment: string;
  /** Suggested replacement */
  suggestedFragment: string;
  /** Why the change is suggested */
  reason: string;
  /** Confidence in the suggestion (0-1) */
  confidence: number;
}

export interface ThresholdAdjustment {
  thresholdName: string;
  currentValue: number;
  suggestedValue: number;
  reason: string;
  confidence: number;
}
