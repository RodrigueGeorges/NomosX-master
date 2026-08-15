/**
 * NomosX Publication Formats — aligned 1:1 with Inquiry depths and Engine pricing.
 *
 *   Signal Brief      → depth "surface"    → 39 €
 *   Decision Memo     → depth "standard"   → 99 €
 *   Article           → depth "deep"       → 199 €
 *   Strategic Report  → depth "strategic"  → 699 €
 *
 * Legacy aliases (RESEARCH_BRIEF, EXECUTIVE_BRIEF, UPDATE_NOTE, DATA_NOTE,
 * POLICY_NOTE, DOSSIER) are kept for DB backward-compat and mapped via
 * resolveFormatType() to one of the 4 canonical formats.
 */
export const PUBLICATION_FORMATS = [
  // ── 1. Signal Brief (surface depth) — ALERT angle ──
  // Benchmark: Carsey fact sheet (900-1000w), FAO policy brief (700w), World Bank short brief (1500w)
  {
    type: "SUMMARY_BRIEF",
    label: "Signal Brief",
    shortLabel: "Signal",
    family: "signals",
    access: "Open",
    pages: "2-4 pages",
    sourceDepth: "5+ sources",
    description: "Rigorous alert on a verified signal, policy move, or emerging evidence shift. What happened, why it matters, what to watch. 500-1,200 words.",
  },
  // ── 2. Decision Memo (standard depth) — ACTION angle ──
  // Benchmark: GNSI Decision Brief (2400w), WHO policy brief (1000-3000w), National Academies (1500-2000w), ERF (2000-2500w)
  {
    type: "DECISION_MEMO",
    label: "Decision Memo",
    shortLabel: "Memo",
    family: "memos",
    access: "Open",
    pages: "4-8 pages",
    sourceDepth: "8+ sources",
    description: "Structured decision brief for policy makers and executives — context, key evidence, options, recommendation, risks. 1,200-2,500 words.",
  },
  // ── 3. Article (deep depth) — ANALYSIS angle ──
  // Benchmark: Carsey issue brief (1800-4000w), McKinsey Quarterly article (3000-8000w)
  {
    type: "ARTICLE",
    label: "Article",
    shortLabel: "Article",
    family: "articles",
    access: "Open",
    pages: "8-15 pages",
    sourceDepth: "15+ sources",
    description: "Long-form analytical article — data-driven, narrative, rigorous. Multiple perspectives, what the evidence says. 3,000-6,000 words.",
  },
  // ── 4. Strategic Report (strategic depth) — STRATEGY angle ──
  // Benchmark: McKinsey white paper (8000-20000w), France Stratégie rapport (15000-40000w), Fraser Mustard policy study (17500-30000w)
  {
    type: "STRATEGIC_REPORT",
    label: "Strategic Report",
    shortLabel: "Report",
    family: "reports",
    access: "Open",
    pages: "20-50 pages",
    sourceDepth: "20+ sources",
    description: "Comprehensive strategic analysis with scenarios, stakeholder impact, recommendations, and implementation roadmap. 8,000-20,000 words.",
  },
] as const;

export type PublicationFormatType = typeof PUBLICATION_FORMATS[number]["type"];
export type PublicationFormatFamily = typeof PUBLICATION_FORMATS[number]["family"];

export const FORMAT_FILTERS = [
  { value: "all", label: "All Formats" },
  { value: "signals", label: "Signal Briefs" },
  { value: "memos", label: "Decision Memos" },
  { value: "articles", label: "Articles" },
  { value: "reports", label: "Strategic Reports" },
] as const;

export const PUBLICATION_FORMAT_BY_TYPE = Object.fromEntries(
  PUBLICATION_FORMATS.map((format) => [format.type, format])
) as Record<string, typeof PUBLICATION_FORMATS[number]>;

export const FORMAT_TYPES_BY_FAMILY = PUBLICATION_FORMATS.reduce((acc, format) => {
  acc[format.family] = [...(acc[format.family] || []), format.type];
  return acc;
}, {} as Record<string, string[]>);

/**
 * Legacy → canonical format migration map.
 * Old publications in DB keep their original type but are displayed
 * and priced as the canonical format.
 */
const FORMAT_ALIASES: Record<string, string> = {
  // Signal Brief family
  UPDATE_NOTE: "SUMMARY_BRIEF",
  DATA_NOTE: "SUMMARY_BRIEF",
  // Decision Memo family
  RESEARCH_BRIEF: "DECISION_MEMO",
  EXECUTIVE_BRIEF: "DECISION_MEMO",
  POLICY_NOTE: "DECISION_MEMO",
  // Strategic Report family (Dossier was never fully implemented)
  DOSSIER: "STRATEGIC_REPORT",
};

export function resolveFormatType(type?: string | null): string {
  if (!type) return "ARTICLE";
  // If it's already a canonical format, return as-is
  if (PUBLICATION_FORMAT_BY_TYPE[type]) return type;
  // Otherwise resolve via aliases
  return FORMAT_ALIASES[type] || "ARTICLE";
}

export function getPublicationFormat(type?: string | null) {
  const resolved = resolveFormatType(type);
  return PUBLICATION_FORMAT_BY_TYPE[resolved] || PUBLICATION_FORMAT_BY_TYPE.ARTICLE;
}

export function getPublicationFormatLabel(type?: string | null) {
  return getPublicationFormat(type).label;
}
