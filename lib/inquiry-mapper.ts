import type { InquiryCardData, InquiryWatermark } from "@/components/signature";
import type { InquiryDepth } from "@/lib/types/inquiry";

const WATERMARKS: InquiryWatermark[] = ["map", "chart", "globe"];

export type BriefLike = {
  id: string;
  title: string;
  summary: string;
  type: string;
  publishedAt: string;
  readTime: number;
  sources: number;
  topics: string[];
  trustScore?: number | null;
  displayType?: string;
  hasForesight?: boolean;
};

export function inferInquiryDepth(type: string): InquiryDepth {
  // Canonical 1:1 mapping
  if (type === "STRATEGIC_REPORT") return "strategic";
  if (type === "ARTICLE") return "deep";
  if (type === "DECISION_MEMO") return "standard";
  if (type === "SUMMARY_BRIEF") return "surface";
  // Legacy → canonical depth
  if (type === "DOSSIER") return "strategic";
  if (type === "RESEARCH_BRIEF" || type === "EXECUTIVE_BRIEF" || type === "POLICY_NOTE") return "standard";
  if (type === "UPDATE_NOTE" || type === "DATA_NOTE") return "surface";
  return "deep";
}

export function mapBriefToInquiryCard(b: BriefLike, index = 0): InquiryCardData {
  return {
    id: b.id,
    slug: b.id,
    title: b.title,
    summary: b.summary,
    domain: (b.topics?.[0] ?? b.displayType?.replace(/_/g, " ") ?? "General").toUpperCase(),
    watermark: WATERMARKS[index % WATERMARKS.length],
    verdict:
      b.trustScore != null
        ? { value: `${b.trustScore}%`, label: "Confidence" }
        : undefined,
    sourceCount: b.sources,
    publishedAt: b.publishedAt,
    readTime: b.readTime,
    hasForesight: b.hasForesight,
    formatLabel: b.displayType,
  };
}

export function mapBriefToInquiryWithMeta(
  b: BriefLike,
  index = 0
): InquiryCardData & { depth: InquiryDepth; searchText: string } {
  const domain = (b.topics?.[0] ?? b.displayType?.replace(/_/g, " ") ?? "General").toUpperCase();
  const depth = inferInquiryDepth(b.type);
  return {
    ...mapBriefToInquiryCard(b, index),
    depth,
    searchText: `${b.title} ${b.summary} ${domain}`.toLowerCase(),
  };
}
