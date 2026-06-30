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
