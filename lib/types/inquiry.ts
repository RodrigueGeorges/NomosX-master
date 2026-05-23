/**
 * Inquiry — The single canonical publication format of NomosX
 * ─────────────────────────────────────────────────────────────
 * Every automated research output is an Inquiry, regardless of depth.
 * Depth is expressed via sections present, not via a separate format.
 *
 * Depth levels:
 *   • surface    → summary + verdict only (tweet-length signal)
 *   • standard   → summary + debate + evidence + verdict (default brief)
 *   • deep       → + literature review + thematic analysis + stakeholder matrix
 *   • strategic  → + scenario planning + implementation roadmap (10-15 pages)
 */

export type InquiryDepth = "surface" | "standard" | "deep" | "strategic";

export type InquiryStatus =
  | "scouting"      // SCOUT agent running
  | "indexing"      // INDEX agent running
  | "ranking"       // RANK agent running
  | "reading"       // READER agent running
  | "analysing"     // ANALYST agent running
  | "simulating"    // SIMULATION agent running (optional)
  | "editing"       // EDITOR agent running
  | "reviewing"     // CITATION GUARD / quality review
  | "published"     // live
  | "archived";     // no longer featured

// ─── Probabilistic Verdict ───────────────────────────────────

export interface ProbabilisticVerdict {
  /** Human-readable label, e.g. "72%", "4.2σ", "Very Likely" */
  value: string;
  /** What the number measures, e.g. "Probability", "Confidence", "Risk Level" */
  label: string;
  /** 0-100 scale for sorting/filtering (optional internal) */
  numeric?: number;
  /** Brief explanation of how the verdict was derived */
  rationale?: string;
  /** Direction: positive / negative / neutral / uncertain */
  direction?: "positive" | "negative" | "neutral" | "uncertain";
}

// ─── Source Reference ────────────────────────────────────────

export interface InquirySource {
  id: string;           // internal ID
  title: string;
  authors?: string[];
  year?: number;
  doi?: string;
  url?: string;
  provider: string;     // e.g. "openalex", "crossref", "pubmed"
  qualityScore: number; // 0-100
  relevanceScore: number;
  /** Key claims extracted by READER agent */
  claims?: string[];
  /** Methods extracted by READER agent */
  methods?: string[];
}

// ─── Sections (depth-dependent) ──────────────────────────────

export interface InquirySectionSummary {
  type: "summary";
  headline: string;
  body: string;
  /** One-sentence elevator pitch */
  tlDr?: string;
}

export interface InquirySectionDebate {
  type: "debate";
  pro: { label: string; arguments: string[] };
  con: { label: string; arguments: string[] };
  synthesis: string;
}

export interface InquirySectionEvidence {
  type: "evidence";
  quality: "high" | "medium" | "low";
  assessment: string;
  gaps: string[];
}

export interface InquirySectionLiterature {
  type: "literature";
  overview: string;
  frameworks: string[];
  keyStudies: Array<{
    citation: string;
    contribution: string;
    limitations: string;
  }>;
}

export interface InquirySectionThematic {
  type: "thematic";
  themes: Array<{
    name: string;
    description: string;
    evidence: string;
    sourceIds: string[];
  }>;
  consensus: string;
  controversies: string;
}

export interface InquirySectionStakeholders {
  type: "stakeholders";
  matrix: Array<{
    stakeholder: string;
    impact: "high" | "medium" | "low";
    magnitude: "positive" | "negative" | "mixed";
    details: string;
  }>;
}

export interface InquirySectionScenarios {
  type: "scenarios";
  scenarios: Array<{
    name: string;
    probability: string;
    description: string;
    implications: string;
    signals: string[];
  }>;
}

export interface InquirySectionImplementation {
  type: "implementation";
  prerequisites: string[];
  timeline: string;
  resources: string;
  metrics: string[];
  obstacles: string[];
}

/** Monte Carlo + multi-agent simulation outcomes (strategic / deep) */
export interface InquirySectionSimulation {
  type: "simulation";
  methodology: string;
  personaCount: number;
  swarmSize?: number;
  seedRuns?: number;
  tickCount: number;
  llmTickCount?: number;
  socialPostCount?: number;
  monteCarloRuns: number;
  converged: boolean;
  outcomes: Array<{
    name: string;
    empiricalProbability: string;
    trajectory: string;
    confidenceInterval: [string, string];
    keyDrivers: string[];
    blockers: string[];
    cascadeEffects?: string[];
    sourceGrounded: boolean;
    supportingSourceIds?: string[];
  }>;
  sensitivity?: Array<{
    variable: string;
    scenario: string;
    elasticity: number;
  }>;
  redTeamChallenge?: string;
  executiveBrief?: string;
  traceability: {
    sourceIds: string[];
    adversarialValidated: boolean;
    sourceQualityAvg?: number;
  };
}

export type InquirySection =
  | InquirySectionSummary
  | InquirySectionDebate
  | InquirySectionEvidence
  | InquirySectionLiterature
  | InquirySectionThematic
  | InquirySectionStakeholders
  | InquirySectionScenarios
  | InquirySectionImplementation
  | InquirySectionSimulation;

// ─── Core Inquiry Type ───────────────────────────────────────

export interface Inquiry {
  id: string;
  slug: string;
  title: string;
  /** The research question that triggered this inquiry */
  question: string;
  domain: string;
  depth: InquiryDepth;
  status: InquiryStatus;

  verdict: ProbabilisticVerdict;

  /** Ordered sections — presence depends on depth */
  sections: InquirySection[];

  sources: InquirySource[];

  /** Estimated reading time in minutes */
  readTime: number;

  /** When the inquiry was published */
  publishedAt: Date;
  /** When the inquiry was last updated (e.g. new sources added) */
  updatedAt: Date;

  /** Knowledge graph concepts extracted from this inquiry */
  concepts?: string[];

  /** For SEO / social sharing */
  metaDescription?: string;
  metaImage?: string;
}

// ─── Input / Creation Types ──────────────────────────────────

export interface CreateInquiryInput {
  question: string;
  domain?: string;
  depth?: InquiryDepth;
  /** Override auto-detected depth */
  forceDepth?: InquiryDepth;
}

export interface InquiryListItem {
  id: string;
  slug: string;
  title: string;
  domain: string;
  verdict: ProbabilisticVerdict;
  sourceCount: number;
  publishedAt: Date;
  readTime: number;
}
