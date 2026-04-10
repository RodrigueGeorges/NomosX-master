/**
 * NomosX Institutional Think Tank - Type Definitions
 * 
 * Types for the signal-driven publication system
 */

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export const SIGNAL_TYPES = [
  "NEW_EVIDENCE",
  "CONTRADICTION", 
  "TREND_BREAK",
  "DATA_RELEASE",
  "POLICY_CHANGE",
  "METHODOLOGY_SHIFT"
] as const;

export type SignalType = typeof SIGNAL_TYPES[number];

export const SIGNAL_STATUSES = [
  "NEW",
  "HELD",
  "PUBLISHED",
  "REJECTED",
  "EXPIRED",
  "SILENT"
] as const;

export type SignalStatus = typeof SIGNAL_STATUSES[number];

export const PUBLICATION_TYPES = [
  // 3-Tier Model
  "SUMMARY_BRIEF",     // FREE tier - 1 page summaries
  "EXECUTIVE_BRIEF",   // EXECUTIVE tier - 2-3 pages
  "STRATEGIC_REPORT",  // STRATEGY tier - 10-15 pages
  // Legacy formats (backward compatibility)
  "RESEARCH_BRIEF",     // Maps to EXECUTIVE_BRIEF
  "UPDATE_NOTE",       // Maps to EXECUTIVE_BRIEF
  "DATA_NOTE",         // Maps to EXECUTIVE_BRIEF
  "POLICY_NOTE",       // Maps to EXECUTIVE_BRIEF
  "DOSSIER"            // Maps to STRATEGIC_REPORT
] as const;

export type PublicationType = typeof PUBLICATION_TYPES[number];

// Primary format mapping
export const FORMAT_MAPPING: Record<string, "SUMMARY_BRIEF" | "EXECUTIVE_BRIEF" | "STRATEGIC_REPORT"> = {
  SUMMARY_BRIEF: "SUMMARY_BRIEF",
  EXECUTIVE_BRIEF: "EXECUTIVE_BRIEF",
  STRATEGIC_REPORT: "STRATEGIC_REPORT",
  RESEARCH_BRIEF: "EXECUTIVE_BRIEF",
  UPDATE_NOTE: "EXECUTIVE_BRIEF",
  DATA_NOTE: "EXECUTIVE_BRIEF",
  POLICY_NOTE: "EXECUTIVE_BRIEF",
  DOSSIER: "STRATEGIC_REPORT",
};

export const CLAIM_TYPES = [
  "FACT",
  "INTERPRETATION",
  "SCENARIO",
  "OPINION"
] as const;

export type ClaimType = typeof CLAIM_TYPES[number];

export const EDITORIAL_DECISIONS = [
  "PUBLISH",
  "HOLD",
  "REJECT",
  "SILENCE"
] as const;

export type EditorialDecisionType = typeof EDITORIAL_DECISIONS[number];

export const CHECK_TYPES = [
  "CADENCE",
  "THRESHOLD",
  "QUALITY",
  "CITATION",
  "FORBIDDEN_PATTERN",
  "METHODOLOGY",
  "ADVERSARIAL",
  "CALIBRATION"
] as const;

export type CheckType = typeof CHECK_TYPES[number];

// ============================================================================
// VERTICAL CONFIGURATION
// ============================================================================

export interface VerticalConfig {
  maxPublicationsPerWeek: number;
  allowedTypes: PublicationType[];
  thresholds: {
    minTrustScore: number;
    minNoveltyScore: number;
    minImpactScore: number;
    minSources: number;
    silenceThreshold?: number; // Below this, signal results in SILENCE decision
  };
  cooldownHours: number;
  updateBurst?: {
    trigger: string;
    maxExtraPerDay: number;
    durationHours: number;
  };
}

// ============================================================================
// SIGNAL SCORING
// ============================================================================

export interface SignalScores {
  noveltyScore: number;    // 0-100
  impactScore: number;     // 0-100
  confidenceScore: number; // 0-100
  urgencyScore: number;    // 0-100
}

export interface SignalWithPriority extends SignalScores {
  priorityScore: number;   // Composite 0-100
}

// ============================================================================
// EDITORIAL CHECKS
// ============================================================================

export interface EditorialChecks {
  cadence: { passed: boolean; details: string };
  threshold: { passed: boolean; details: string };
  quality: { passed: boolean; score: number };
  citation: { passed: boolean; coverage: number };
  forbiddenPatterns: { passed: boolean; matches: string[] };
  methodology: { passed: boolean; score: number; flagged: boolean };
  adversarial: { passed: boolean; score: number; flagged: boolean };
  calibration: { passed: boolean; score: number; flagged: boolean };
}

// ============================================================================
// CRITICAL LOOP
// ============================================================================

export interface MethodologyJudgment {
  overallScore: number; // 0-100
  breakdown: {
    studyDesign: number;
    sampleSize: number;
    statisticalRigor: number;
    replicability: number;
    biasRisk: number;
  };
  concerns: string[];
  recommendations: string[];
  passThreshold: boolean; // score >= 60
}

export interface AdversarialReview {
  overallScore: number; // 0-100
  counterArguments: Array<{
    targetClaim: string;
    counterArgument: string;
    strength: "strong" | "moderate" | "weak";
    sourceSupport: string[];
  }>;
  blindSpots: string[];
  steelManVersion: string;
  recommendations: string[];
  passThreshold: boolean; // score >= 55
}

export interface CalibrationAssessment {
  overallScore: number; // 0-100
  claimAssessments: Array<{
    claim: string;
    statedConfidence: number;
    calibratedConfidence: number;
    gap: number;
    reasoning: string;
  }>;
  uncertaintyQuantification: {
    adequate: boolean;
    missing: string[];
    recommendations: string[];
  };
  hedgingQuality: {
    score: number;
    overHedged: string[];
    underHedged: string[];
  };
  passThreshold: boolean; // score >= 50
}

export interface CriticalLoopResult {
  compositeScore: number;
  methodology: MethodologyJudgment;
  adversarial: AdversarialReview;
  calibration: CalibrationAssessment;
  needsHumanReview: boolean;
  recommendations: string[];
}

// ============================================================================
// PUBLICATION PIPELINE
// ============================================================================

export interface PublicationStep {
  name: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  startedAt?: Date;
  finishedAt?: Date;
  duration?: number;
  tokensUsed?: number;
  costUsd?: number;
  error?: string;
  output?: unknown;
}

export interface PublicationTemplate {
  type: PublicationType;
  sections: Array<{
    id: string;
    title: string;
    required: boolean;
    minWords?: number;
    maxWords?: number;
    claimTypes: ClaimType[];
  }>;
  totalMinWords: number;
  totalMaxWords: number;
  minSources: number;
  forbiddenPhrases: string[];
}

// ============================================================================
// CADENCE
// ============================================================================

export interface CadenceResult {
  allowed: boolean;
  reason?: string;
  nextWindowAt?: Date;
  counters: {
    globalDaily: { current: number; max: number };
    globalWeekly: { current: number; max: number };
    verticalWeekly: { current: number; max: number };
  };
  cooldownRemaining?: number; // hours
}

// ============================================================================
// THRESHOLDS
// ============================================================================

export const SIGNAL_THRESHOLDS = {
  MIN_PRIORITY_FOR_CONSIDERATION: 50,
  MIN_PRIORITY_FOR_PUBLICATION: 65,
  HIGH_PRIORITY_THRESHOLD: 80,
  EMERGENCY_THRESHOLD: 90
} as const;

export const GLOBAL_CADENCE = {
  maxPerDay: 3,
  maxPerWeek: 12,
  quietHoursStart: 22, // UTC
  quietHoursEnd: 6,    // UTC
  publishWindows: [10, 16] // UTC hours
} as const;

// ============================================================================
// FORBIDDEN PHRASES
// ============================================================================

export const FORBIDDEN_PHRASES = [
  "il est clair que",
  "it is clear that",
  "tout le monde sait",
  "everyone knows",
  "sans aucun doute",
  "without a doubt",
  "prouve définitivement",
  "definitively proves",
  "la science a tranché",
  "science has settled",
  "les experts s'accordent",
  "experts agree",
  "il est évident",
  "it is obvious",
  "incontestablement",
  "unquestionably"
] as const;
