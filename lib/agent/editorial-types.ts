/**
 * Editorial V2 — position-first brief structure.
 * Detected subject → cross-domain team → scenarios → institute position.
 */

import type { TopicClassification } from './topic-classifier';
import type { DebateResult } from './debate-agent';

/** One axis of a cross-domain collision (not a silo topic). */
export interface EditorialDimension {
  domain: string;
  label: string;
  angle: string;
  confidence: number;
}

export interface CastTeamMember {
  lensId: string;
  domain: string;
  role: 'lead' | 'friction' | 'stress-test';
  mandate: string;
  frictionWith?: string;
}

export interface CastingResult {
  team: CastTeamMember[];
  collisionSummary: string;
  productiveFriction: string;
  costUsd: number;
}

export interface ScenarioOutlook {
  name: string;
  probability: string;
  description: string;
  signals?: string[];
  empiricalProbability?: number;
  // Delphi foresight fields
  confidenceInterval?: [number, number];
  baseRate?: number;
  calibratedProbability?: number;
  sensitivityScore?: number;
  keyDrivers?: string[];
  blockers?: string[];
  // PhD-level prospective fields
  narrative?: string;        // 80-150 word narrative set in future tense
  fermiEstimate?: number;    // Decomposed estimate from Fermi breakdown
  expertEstimate?: number;   // Aggregated Delphi expert judgment
  crossImpact?: string;      // Impact from other scenarios
  expertRationales?: string[]; // Per-expert reasoning summaries
  uncertaintyDrivers?: string[]; // What makes this scenario uncertain
  tippingPoint?: string;     // What would tip probability dramatically
}

/** PhD-level prospective framework — the foresight architecture behind the scenarios */
export interface ProspectiveFramework {
  /** The base rate: historical reference class and analogue (Tetlock/GJP) */
  baseRateContext?: string;
  /** The Fermi decomposition: how the question breaks into sub-questions */
  fermiDecomposition?: string;
  /** Key uncertainties: what we don't know that matters */
  keyUncertainties?: string[];
  /** Cross-impact: how scenarios interact and constrain each other */
  crossImpactSummary?: string;
  /** The horizon: time frame and why it matters */
  horizon?: string;
  /** Methodology note: how we arrived at these probabilities (Delphi, Monte Carlo, etc.) */
  methodologyNote?: string;
  /** Snow leopards: underappreciated phenomena that could have outsized impact */
  snowLeopards?: string[];
}

export interface InstitutePosition {
  headline: string;
  verdict: string;
  confidence: number;
  confidenceLabel: 'high' | 'medium' | 'low';
  scenarios: ScenarioOutlook[];
  dominantScenario?: string;
  objections: string[];
  whatChangesMind: string[];
  recommendations?: {
    immediate?: string[];
    shortTerm?: string[];
    longTerm?: string[];
    riskMitigation?: string[];
  };
  /** 3-5 bullets capturing the essence of the analysis (McKinsey "In Brief" style) */
  inBrief?: string[];
  /** Action titles for the four narrative acts — complete sentences stating conclusions */
  sectionTitles?: {
    problem?: string;
    evidence?: string;
    futures?: string;
    action?: string;
  };
  /** PhD-level prospective framework — the foresight architecture behind the scenarios */
  prospectiveFramework?: ProspectiveFramework;
  costUsd: number;
}

export interface PositionFirstBriefInput {
  question: string;
  classification: TopicClassification;
  casting: CastingResult;
  position: InstitutePosition;
  analysis: Record<string, unknown>;
  sources: Array<{
    id?: string;
    title?: string;
    year?: number | null;
    provider?: string;
    authors?: Array<{ name?: string }>;
    doi?: string | null;
  }>;
  debate?: DebateResult | null;
  isStrategic?: boolean;
  /** Think tank style profile — adapts labels and structure (e.g. 'montaigne' uses French labels) */
  styleProfile?: 'harvard' | 'france-strategie' | 'montaigne' | 'mckinsey' | 'rand' | 'chatham' | 'caps' | 'default';
}

export function dimensionsFromClassification(tc: TopicClassification): EditorialDimension[] {
  if (tc.dimensions?.length) return tc.dimensions;

  return tc.domains.slice(0, 4).map((d) => ({
    domain: d.domain,
    label: formatDomainLabel(d.domain),
    angle: d.researcher.focusAreas[0] ?? `Analytical lens on ${formatDomainLabel(d.domain)}`,
    confidence: d.confidence,
  }));
}

export function formatDomainLabel(domain: string): string {
  return domain
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function collisionLabel(dimensions: EditorialDimension[]): string {
  if (dimensions.length === 0) return 'Cross-domain inquiry';
  if (dimensions.length === 1) return dimensions[0].label;
  return dimensions.map((d) => d.label).join(' × ');
}
