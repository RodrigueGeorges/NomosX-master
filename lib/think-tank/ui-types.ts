/**
 * NomosX Think Tank - UI Types
 * 
 * Centralized types for Think Tank UI components and pages
 * Avoids duplication across pages
 */

// ============================================================================
// VERTICAL
// ============================================================================

export interface VerticalSummary {
  id: string;
  slug: string;
  name: string;
  nameEn?: string;
  description?: string;
  icon?: string;
  color?: string;
  pendingSignals: number;
  publishedCount: number;
  cadence: { current: number; max: number };
}

export interface VerticalRef {
  id: string;
  slug: string;
  name: string;
  icon?: string;
  color?: string;
}

// ============================================================================
// SIGNAL
// ============================================================================

export interface UISignalScores {
  novelty: number;
  impact: number;
  confidence: number;
  urgency: number;
  priority: number;
}

export interface SignalSummary {
  id: string;
  verticalId: string;
  vertical: VerticalRef;
  signalType: string;
  title: string;
  summary: string;
  scores: UISignalScores;
  status: string;
  sourceCount: number;
  detectedAt: string;
}

// ============================================================================
// PUBLICATION
// ============================================================================

export interface PublicationSummary {
  id: string;
  verticalId: string;
  vertical: VerticalRef;
  type: string;
  title: string;
  wordCount: number;
  trustScore: number;
  qualityScore: number;
  sourceCount: number;
  publishedAt?: string | null;
  viewCount: number;
  createdAt: string;
}

export interface PublicationDetail extends PublicationSummary {
  signal?: { 
    id: string; 
    title: string; 
    signalType: string; 
    priorityScore: number;
  } | null;
  html: string;
  citationCoverage: number;
  claimCount: number;
  factClaimCount: number;
  citedClaimCount: number;
  criticalLoopResult?: any;
  sources: PublicationSource[];
  claims: PublicationClaim[];
  qualityChecks: QualityCheck[];
}

export interface PublicationSource {
  id: string;
  title: string;
  authors?: string[];
  year?: number;
  provider: string;
  qualityScore?: number;
  url?: string;
}

export interface PublicationClaim {
  id: string;
  text: string;
  claimType: string;
  section: string;
  confidence: number;
  citations: string[];
  hasContradiction: boolean;
}

export interface QualityCheck {
  checkType: string;
  passed: boolean;
  score?: number;
}

// ============================================================================
// CADENCE
// ============================================================================

export interface CadenceData {
  global: {
    daily: { current: number; max: number };
    weekly: { current: number; max: number };
  };
  nextPublishWindow: string;
  isQuietHours: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const SIGNAL_TYPE_LABELS: Record<string, string> = {
  NEW_EVIDENCE: "New Evidence",
  CONTRADICTION: "Contradiction",
  TREND_BREAK: "Trend Break",
  DATA_RELEASE: "Data Release",
  POLICY_CHANGE: "Policy Change",
  METHODOLOGY_SHIFT: "Methodology Shift"
};

export const PUBLICATION_TYPE_LABELS: Record<string, string> = {
  // Primary formats (2-format model)
  ARTICLE: "Article",
  STRATEGIC_REPORT: "Strategic Report",
  SUMMARY_BRIEF: "Signal Brief",
  // Legacy formats (for backward compatibility)
  RESEARCH_BRIEF: "Article",
  EXECUTIVE_BRIEF: "Article",
  UPDATE_NOTE: "Signal Brief",
  DATA_NOTE: "Signal Brief",
  POLICY_NOTE: "Article",
  DOSSIER: "Research Dossier"
};

export const PUBLICATION_TYPE_META: Record<string, { pages: string; audience: string }> = {
  // Primary formats (2-format model)
  ARTICLE: { pages: "8-15 pages", audience: "Open publication / StudioX" },
  STRATEGIC_REPORT: { pages: "15-30 pages", audience: "Strategy tier / StudioX" },
  SUMMARY_BRIEF: { pages: "1-2 pages", audience: "Free — all readers" },
  // Legacy formats (for backward compatibility)
  RESEARCH_BRIEF: { pages: "8-15 pages", audience: "Open publication / StudioX" },
  EXECUTIVE_BRIEF: { pages: "8-15 pages", audience: "Open publication / StudioX" },
  UPDATE_NOTE: { pages: "1-2 pages", audience: "Open publication" },
  DATA_NOTE: { pages: "1-2 pages", audience: "Open publication" },
  POLICY_NOTE: { pages: "8-15 pages", audience: "Open publication / StudioX" },
  DOSSIER: { pages: "30-50 pages", audience: "StudioX / research teams" }
};

export const SIGNAL_STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  HELD: "Held",
  PUBLISHED: "Published",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  SILENT: "Silent"
};
