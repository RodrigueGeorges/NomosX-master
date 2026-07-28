export const PUBLICATION_FORMATS = [
  // ── Primary format 1: ARTICLE (Le Shift Project / LawZero style) ──
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
  // ── Primary format 2: STRATEGIC REPORT (McKinsey / France Stratégie style) ──
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
  // ── Signal formats (for breaking news / auto-scan) ──
  {
    type: "SUMMARY_BRIEF",
    label: "Signal Brief",
    shortLabel: "Signal",
    family: "signals",
    access: "Open",
    pages: "1-2 pages",
    sourceDepth: "5+ sources",
    description: "Fast synthesis of a verified weak signal, policy move, or emerging evidence shift.",
  },
  // ── Legacy aliases (kept for backward compat, map to ARTICLE) ──
  {
    type: "RESEARCH_BRIEF",
    label: "Research Brief",
    shortLabel: "Brief",
    family: "articles",
    access: "Open",
    pages: "8-15 pages",
    sourceDepth: "15+ sources",
    description: "Legacy label — now maps to Article format.",
  },
  {
    type: "EXECUTIVE_BRIEF",
    label: "Decision Brief",
    shortLabel: "Decision",
    family: "articles",
    access: "Open",
    pages: "8-15 pages",
    sourceDepth: "15+ sources",
    description: "Legacy label — now maps to Article format.",
  },
  {
    type: "POLICY_NOTE",
    label: "Policy Memo",
    shortLabel: "Memo",
    family: "articles",
    access: "Open",
    pages: "8-15 pages",
    sourceDepth: "15+ sources",
    description: "Legacy label — now maps to Article format.",
  },
  // ── Future format ──
  {
    type: "DOSSIER",
    label: "Research Dossier",
    shortLabel: "Dossier",
    family: "dossiers",
    access: "Open",
    pages: "30-50 pages",
    sourceDepth: "50+ sources",
    description: "Appendix-heavy evidence file for analysts and researchers.",
  },
] as const;

export type PublicationFormatType = typeof PUBLICATION_FORMATS[number]["type"];
export type PublicationFormatFamily = typeof PUBLICATION_FORMATS[number]["family"];

export const FORMAT_FILTERS = [
  { value: "all", label: "All Formats" },
  { value: "articles", label: "Articles" },
  { value: "reports", label: "Strategic Reports" },
  { value: "signals", label: "Signals" },
  { value: "dossiers", label: "Dossiers" },
] as const;

export const PUBLICATION_FORMAT_BY_TYPE = Object.fromEntries(
  PUBLICATION_FORMATS.map((format) => [format.type, format])
) as Record<string, typeof PUBLICATION_FORMATS[number]>;

export const FORMAT_TYPES_BY_FAMILY = PUBLICATION_FORMATS.reduce((acc, format) => {
  acc[format.family] = [...(acc[format.family] || []), format.type];
  return acc;
}, {} as Record<string, string[]>);

const FORMAT_ALIASES: Record<string, string> = {
  RESEARCH_BRIEF: "ARTICLE",
  EXECUTIVE_BRIEF: "ARTICLE",
  POLICY_NOTE: "ARTICLE",
  UPDATE_NOTE: "SUMMARY_BRIEF",
  DATA_NOTE: "SUMMARY_BRIEF",
};

export function resolveFormatType(type?: string | null): string {
  if (!type) return "ARTICLE";
  return FORMAT_ALIASES[type] || type;
}

export function getPublicationFormat(type?: string | null) {
  const resolved = resolveFormatType(type);
  return PUBLICATION_FORMAT_BY_TYPE[resolved] || PUBLICATION_FORMAT_BY_TYPE.ARTICLE;
}

export function getPublicationFormatLabel(type?: string | null) {
  return getPublicationFormat(type).label;
}
