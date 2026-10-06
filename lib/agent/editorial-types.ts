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
  // Shell-method fields (scenario-architect)
  axisPosition?: string;     // Position on the critical-uncertainty matrix
  signatureMoment?: string;  // Vivid vignette from inside this future
  isWildcard?: boolean;      // Surprising-but-plausible outlier scenario
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
  /** Predetermined elements — certainties true in EVERY scenario (Shell: "it has rained in the mountains") */
  predeterminedElements?: string[];
  /** The two critical uncertainties structuring the scenario matrix */
  criticalUncertainties?: Array<{ name: string; poleA: string; poleB: string }>;
}

export interface InstitutePosition {
  headline: string;
  /** The lede — one striking opening (Economist discipline: the first sentence earns the second) */
  lede?: string;
  verdict: string;
  confidence: number;
  confidenceLabel: 'high' | 'medium' | 'low';
  scenarios: ScenarioOutlook[];
  dominantScenario?: string;
  centralScenarioRationale?: string;
  centralScenarioImplications?: string[];
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

export interface CentralScenarioDecision {
  name: string;
  description: string;
  rationale: string;
  horizon: string;
  implications: string[];
  revisionTriggers: string[];
  confidence: InstitutePosition['confidenceLabel'];
  selectedBy: 'editorial' | 'probability_fallback';
  simulationLeader?: string;
  simulationDisagrees: boolean;
}

export function resolveCentralScenario(
  position: InstitutePosition,
  simulation: Array<{ name: string; empiricalProbability: number }> = [],
): CentralScenarioDecision | undefined {
  const names = position.scenarios.map(s => s.name.trim().toLowerCase());
  if (names.some(name => !name) || new Set(names).size !== names.length) return undefined;
  const requested = position.dominantScenario?.trim().toLowerCase();
  // Deliberately exact-after-normalization: a partial or extended label that
  // could match several scenarios ("Stagflation trap" vs "…in Europe" /
  // "…worldwide", or "Not Central") must NOT be promoted to an explicit
  // editorial choice — it degrades to probability_fallback, which the gate
  // flags as "requires an explicit editorial choice" rather than silently
  // endorsing the arbiter's guess.
  const editorial = position.scenarios.find(s => s.name.trim().toLowerCase() === requested);
  const probability = (s: ScenarioOutlook): number => {
    if (typeof s.calibratedProbability === 'number' && Number.isFinite(s.calibratedProbability)
      && s.calibratedProbability >= 0 && s.calibratedProbability <= 1) return s.calibratedProbability;
    const match = s.probability.trim().match(/^(\d+(?:\.\d+)?)\s*%$/);
    return match && Number(match[1]) <= 100 ? Number(match[1]) / 100 : -1;
  };
  const candidates = position.scenarios.filter(s => !s.isWildcard && probability(s) >= 0)
    .sort((a, b) => probability(b) - probability(a));
  const selected = editorial ?? candidates[0];
  if (!selected) return undefined;
  const simulated = simulation.filter(s => names.includes(s.name.trim().toLowerCase())
    && Number.isFinite(s.empiricalProbability) && s.empiricalProbability >= 0 && s.empiricalProbability <= 1)
    .sort((a, b) => b.empiricalProbability - a.empiricalProbability)[0];
  return {
    name: selected.name,
    description: selected.narrative?.trim() || selected.description.trim(),
    rationale: editorial ? position.centralScenarioRationale?.trim() ?? '' : '',
    horizon: position.prospectiveFramework?.horizon?.trim() ?? '',
    implications: editorial ? (position.centralScenarioImplications ?? []).filter(s => s.trim()) : [],
    revisionTriggers: position.whatChangesMind.filter(s => s.trim()),
    confidence: position.confidenceLabel,
    selectedBy: editorial ? 'editorial' : 'probability_fallback',
    simulationLeader: simulated?.name,
    simulationDisagrees: !!simulated && simulated.name.trim().toLowerCase() !== selected.name.trim().toLowerCase(),
  };
}

export function centralScenarioIssues(decision: CentralScenarioDecision | undefined, sourceCount: number): string[] {
  if (!decision) return ['No unique central scenario selected'];
  const issues: string[] = [];
  if (!decision.name.trim() || !decision.description.trim()) issues.push('Missing central scenario narrative');
  if (decision.selectedBy !== 'editorial') issues.push('Central scenario requires an explicit editorial choice');
  const refs = [...decision.rationale.matchAll(/\[SRC-(\d+)\]/g)].map(m => Number(m[1]));
  if (!decision.rationale.trim() || refs.length === 0 || refs.some(n => n < 1 || n > sourceCount)) {
    issues.push('Central scenario requires a rationale with valid source references');
  }
  if (!decision.horizon.trim()) issues.push('Missing forecast horizon');
  if (!decision.implications.some(s => s.trim())) issues.push('Missing central scenario implications');
  if (!decision.revisionTriggers.some(s => s.trim())) issues.push('Missing observable revision triggers');
  return issues;
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
