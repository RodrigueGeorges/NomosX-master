/**
 * NomosX Unified Type System
 * 
 * Single source of truth for all shared types across the agent system.
 * Prevents circular dependencies and type conflicts.
 */

// ============================================================================
// DOMAIN EXPERTISE - Centralized definition
// ============================================================================

export type DomainExpertise = 
  // CORE 9 DOMAINS
  | "economics" | "technology" | "policy" | "health" | "security" 
  | "law" | "environment" | "quantitative" | "finance"
  // ADVANCED 6 DOMAINS  
  | "social-sciences" | "humanities" | "energy-advanced" | "geopolitics" 
  | "digital-society" | "cognitive-science"
  // SPECIALIZED DOMAINS
  | "behavioral-economics" | "urban-studies" | "bioethics" | "complexity-science"
  | "computational-social-science" | "development-economics" | "risk-analysis"
  // NEW DEEP-DOMAIN LENS (added for ontological depth)
  | "anthropology" | "history" | "religious-studies" | "non-western-philosophy"
  // SUB-DISCIPLINE LENSES (Sprint 19 — PhD-level granularity)
  | "sociology" | "psychology" | "political-science" | "demography"
  | "criminology" | "education" | "philosophy" | "linguistics"
  | "media-studies" | "epidemiology" | "public-health" | "international-relations"
  // SUB-DISCIPLINE LENSES II (Sprint 19 batch 3 — toward 50 domains)
  | "migration-studies" | "science-technology-studies" | "epistemology"
  | "international-law" | "conflict-studies" | "political-economy"
  | "public-administration" | "gender-studies" | "area-studies"
  | "labor-studies" | "ethics-of-technology" | "archaeology"
  // SUB-DISCIPLINE LENSES III (Sprint 19 batch 4 — toward 62 domains)
  | "neuroscience" | "data-science" | "economic-history" | "social-psychology"
  | "organizational-studies" | "science-policy" | "development-studies"
  | "comparative-politics" | "social-theory" | "philosophy-of-science"
  | "law-and-economics" | "intelligence-studies"
  // SUB-DISCIPLINE LENSES IV (Sprint 19 batch 5 — toward 74 domains)
  | "military-studies" | "futures-studies" | "economic-sociology"
  | "historical-sociology" | "environmental-economics" | "health-economics"
  | "legal-theory" | "postcolonial-studies" | "communication-studies"
  | "public-finance" | "political-anthropology" | "food-systems";

// ============================================================================
// EXPERT ANALYSIS - Unified interface
// ============================================================================

export interface ExpertAnalysis {
  expertId: DomainExpertise;
  expertName: string;
  
  // Core analysis
  keyFindings: string[];
  methodology_critique: string;
  evidence_quality: EvidenceAssessment;
  
  // Domain-specific insights
  causal_mechanisms: string[];
  confounders: string[];
  external_validity: string;
  
  // Predictions & implications
  predictions: Prediction[];
  policy_implications: string[];
  risks: string[];
  
  // Meta
  confidence: number;
  dissent: string | null;
  blind_spots: string[];
  
  // Cost & performance
  costUsd: number;
  durationMs: number;
  
  // Additional properties for Harvard Council
  analyses: string[];
  totalCostUsd: number;
  implications: string;
}

export interface EvidenceAssessment {
  overallLevel: 1 | 2 | 3 | 4 | 5;  // Oxford CEBM: 1=systematic review, 5=expert opinion
  strengths: string[];
  weaknesses: string[];
  biasRisk: "low" | "moderate" | "high" | "critical";
  sampleAdequacy: "adequate" | "borderline" | "inadequate" | "unclear";
}

export interface Prediction {
  claim: string;
  probability: number;
  timeframe: string;
  confidence_interval: string;
  falsifiable_by: string;
}

// ============================================================================
// EXPANDED PhD RESEARCHER
// ============================================================================

export interface ExpandedPhDResearcher {
  id: string;
  name: string;
  institution: string;
  domains: string[];
  expertise: string[];
  publications: number;
  hIndex: number;
  availability: 'HIGH' | 'MEDIUM' | 'LOW';
}

// ============================================================================
// PIPELINE TYPES
// ============================================================================

export interface PipelineCoreOptions {
  isStrategic: boolean;
  providers?: string[];
  perProvider?: number;
  rankOptions?: any;
  runId?: string;
  maxCostUsd?: number;
}

export interface DataLineage {
  briefId: string;
  query: string;
  timestamp: Date;
  agents: string[];
  duration: number;
  cost: number;
  sourceLineage: Map<string, any>;
}

// ============================================================================
// AUTO PUBLISHER TYPES
// ============================================================================

export interface AutoPublisherLineage {
  runId: string;
  startedAt: Date;
  finishedAt: Date;
  config: any;
  agents: string[];
  duration: number;
  cost: number;
}

export interface PublicationResult {
  strategy: "signal" | "editorial" | "proactive" | "vertical-intelligence" | "review";
  topic: string;
  publicationId?: string;
  briefId?: string;
  trustScore: number;
  wordCount: number;
  costUsd: number;
  durationMs: number;
  providers: string[];
  status: "published" | "draft" | "failed" | "review";
  error?: string;
}

export interface AutoPublisherOutput {
  results: PublicationResult[];
  lineage: AutoPublisherLineage;
  totalPublications: number;
  totalCostUsd: number;
  totalDurationMs: number;
  summary: string;
}

// ============================================================================
// COUNCIL TYPES
// ============================================================================

export interface CouncilConfig {
  maxExperts?: number;
  timeoutMs?: number;
  enableHierarchical?: boolean;
  enableInterdisciplinary?: boolean;
  strategic?: boolean;
  runId?: string;
}

export interface EnhancedSynthesisReport {
  consensus: string;
  disagreements: string;
  confidence: number;
  domainLeads: {
    domain: DomainExpertise;
    leadExpert: ExpertAnalysis;
    consensusLevel: number;
  }[];
  interdisciplinary: {
    connections: string[];
    conflicts: string[];
    synergies: string[];
  };
  evidenceQuality: {
    overallLevel: number;
    domainBreakdown: Record<DomainExpertise, number>;
    confidence: number;
  };
  recommendations: {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
    research: string[];
  };
  totalCostUsd: number;
  totalDurationMs: number;
  expertCount: number;
}

// ============================================================================
// VERTICAL INTELLIGENCE TYPES
// ============================================================================

export interface VerticalPublisherOutput {
  totalPublications: number;
  totalCostUsd: number;
  totalDurationMs: number;
  verticalResults: any[];
  summary: string;
}

// ============================================================================
// PROVIDER TYPES
// ============================================================================

export type Providers = Array<
  // Académiques
  | "openalex" | "thesesfr" | "crossref" | "semanticscholar" 
  | "arxiv" | "hal" | "pubmed" | "base"
  | "core" | "europepmc" | "doaj" | "ssrn" | "repec"
  // Institutionnels
  | "imf" | "worldbank" | "oecd" | "brookings" | "rand" | "cnas"
  // Think tanks
  | "chatham-house" | "carnegie" | "cfr" | "csis" | "wri" | "iea"
  // Recherche privée
  | "deepmind" | "openai-research" | "microsoft-research" | "google-research"
  // Spécialisés
  | "climate-analytics" | "undp-research" | "saiia"
>;

// ============================================================================
// UTILITY TYPES
// ============================================================================

export type ReportFormat = "brief" | "strategic" | "dossier";

export interface StrategicPipelineOptions {
  providers?: Providers;
  perProvider?: number;
  rankOptions?: any;
  maxCostUsd?: number;
  runId?: string;
}
