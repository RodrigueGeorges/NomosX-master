export const PUBLICATION_FORMATS = [
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
  {
    type: "UPDATE_NOTE",
    label: "Update Note",
    shortLabel: "Update",
    family: "signals",
    access: "Open",
    pages: "1-2 pages",
    sourceDepth: "3+ sources",
    description: "A concise change log when new evidence modifies an existing position.",
  },
  {
    type: "DATA_NOTE",
    label: "Data Note",
    shortLabel: "Data",
    family: "data",
    access: "Open",
    pages: "2-3 pages",
    sourceDepth: "dataset-led",
    description: "A quantitative readout centered on datasets, indicators, and measurement caveats.",
  },
  {
    type: "POLICY_NOTE",
    label: "Policy Memo",
    shortLabel: "Memo",
    family: "memos",
    access: "Open",
    pages: "3-5 pages",
    sourceDepth: "8+ sources",
    description: "Options, trade-offs, recommendation, risks, and implementation constraints.",
  },
  {
    type: "RESEARCH_BRIEF",
    label: "Research Brief",
    shortLabel: "Brief",
    family: "briefs",
    access: "Open",
    pages: "4-6 pages",
    sourceDepth: "10+ sources",
    description: "Decision-ready synthesis with consensus, disagreements, and evidence quality.",
  },
  {
    type: "EXECUTIVE_BRIEF",
    label: "Decision Brief",
    shortLabel: "Decision",
    family: "briefs",
    access: "Open",
    pages: "4-6 pages",
    sourceDepth: "10+ sources",
    description: "Legacy executive brief records surfaced under the new decision brief label.",
  },
  {
    type: "STRATEGIC_REPORT",
    label: "Strategic Report",
    shortLabel: "Report",
    family: "reports",
    access: "Open",
    pages: "10-15 pages",
    sourceDepth: "20+ sources",
    description: "Deep analysis with scenarios, stakeholder impact, risks, and roadmap.",
  },
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
  { value: "signals", label: "Signals" },
  { value: "data", label: "Data Notes" },
  { value: "briefs", label: "Briefs" },
  { value: "memos", label: "Policy Memos" },
  { value: "reports", label: "Reports" },
  { value: "dossiers", label: "Dossiers" },
] as const;

export const PUBLICATION_FORMAT_BY_TYPE = Object.fromEntries(
  PUBLICATION_FORMATS.map((format) => [format.type, format])
) as Record<string, typeof PUBLICATION_FORMATS[number]>;

export const FORMAT_TYPES_BY_FAMILY = PUBLICATION_FORMATS.reduce((acc, format) => {
  acc[format.family] = [...(acc[format.family] || []), format.type];
  return acc;
}, {} as Record<string, string[]>);

export function getPublicationFormat(type?: string | null) {
  return PUBLICATION_FORMAT_BY_TYPE[type || ""] || PUBLICATION_FORMAT_BY_TYPE.RESEARCH_BRIEF;
}

export function getPublicationFormatLabel(type?: string | null) {
  return getPublicationFormat(type).label;
}
