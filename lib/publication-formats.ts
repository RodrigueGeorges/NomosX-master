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
  // ── 1. Signal Brief (surface depth) ──
  {
    type: "SUMMARY_BRIEF",
    label: "Signal Brief",
    shortLabel: "Signal",
    family: "signals",
    access: "Open",
    pages: "1-2 pages",
    sourceDepth: "5+ sources",
    description: "Fast synthesis of a verified weak signal, policy move, or emerging evidence shift. 200-400 words.",
  },
  // ── 2. Decision Memo (standard depth) ──
  {
    type: "DECISION_MEMO",
    label: "Decision Memo",
    shortLabel: "Memo",
    family: "memos",
    access: "Open",
    pages: "2-3 pages",
    sourceDepth: "8+ sources",
    description: "Structured decision brief — context, evidence, options, recommendation, risks. 800-1,500 words. For policy makers and executives.",
  },
  // ── 3. Article (deep depth) ──
  {
    type: "ARTICLE",
    label: "Article",
    shortLabel: "Article",
    family: "articles",
    access: "Open",
    pages: "8-15 pages",
    sourceDepth: "15+ sources",
    description: "Long-form analytical article — data-driven, narrative, rigorous. 3,000-5,000 words.",
  },
  // ── 4. Strategic Report (strategic depth) ──
  {
    type: "STRATEGIC_REPORT",
    label: "Strategic Report",
    shortLabel: "Report",
    family: "reports",
    access: "Open",
    pages: "15-30 pages",
    sourceDepth: "20+ sources",
    description: "Comprehensive strategic analysis with scenarios, stakeholder impact, recommendations, and implementation roadmap. 5,000-10,000 words.",
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
