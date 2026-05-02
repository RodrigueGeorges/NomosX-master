const DEMO_PUBLICATION_IDS = new Set([
  "pub-1",
  "pub-2",
  "pub-3",
  "test-signal-pub-1",
]);

const DEMO_PUBLIC_IDS = new Set([
  "ai-regulation-summary-2024",
  "ai-regulation-executive-2024",
  "ai-regulation-trends-2024",
  "carbon-pricing-strategic-2024",
  "carbon-pricing-markets-2024",
  "ml-healthcare-policy-2024",
]);

const DEMO_TITLE_PATTERNS = [
  "AI Regulation: Global Trends Overview",
  "AI Regulation: Global Trends and Strategic Implications",
  "Carbon Pricing Mechanisms: Market Analysis",
  "Carbon Pricing Mechanisms: Market Evolution and Corporate Strategy",
  "Machine Learning in Healthcare: Policy Implications",
];

export const PUBLIC_PUBLICATION_MINIMUMS = {
  trustScore: 75,
  qualityScore: 75,
  citationCoverage: 0.6,
  wordCount: 300,
};

export function publicPublicationWhere(extra: Record<string, any> = {}) {
  const existingAnd = Array.isArray(extra.AND) ? extra.AND : extra.AND ? [extra.AND] : [];

  return {
    ...extra,
    status: "PUBLISHED",
    publishedAt: { not: null },
    trustScore: { gte: PUBLIC_PUBLICATION_MINIMUMS.trustScore },
    qualityScore: { gte: PUBLIC_PUBLICATION_MINIMUMS.qualityScore },
    citationCoverage: { gte: PUBLIC_PUBLICATION_MINIMUMS.citationCoverage },
    wordCount: { gte: PUBLIC_PUBLICATION_MINIMUMS.wordCount },
    AND: [
      ...existingAnd,
      { id: { notIn: [...DEMO_PUBLICATION_IDS] } },
      { OR: [{ publicId: null }, { publicId: { notIn: [...DEMO_PUBLIC_IDS] } }] },
      { NOT: { title: { in: DEMO_TITLE_PATTERNS } } },
    ],
  };
}

export function isPublicPublicationEligible(publication: {
  id?: string | null;
  publicId?: string | null;
  title?: string | null;
  status?: string | null;
  publishedAt?: Date | string | null;
  trustScore?: number | null;
  qualityScore?: number | null;
  citationCoverage?: number | null;
  wordCount?: number | null;
}) {
  if (!publication.id || DEMO_PUBLICATION_IDS.has(publication.id)) return false;
  if (publication.publicId && DEMO_PUBLIC_IDS.has(publication.publicId)) return false;
  if (publication.title && DEMO_TITLE_PATTERNS.includes(publication.title)) return false;
  if (publication.status !== "PUBLISHED" || !publication.publishedAt) return false;
  if ((publication.trustScore ?? 0) < PUBLIC_PUBLICATION_MINIMUMS.trustScore) return false;
  if ((publication.qualityScore ?? 0) < PUBLIC_PUBLICATION_MINIMUMS.qualityScore) return false;
  if ((publication.citationCoverage ?? 0) < PUBLIC_PUBLICATION_MINIMUMS.citationCoverage) return false;
  if ((publication.wordCount ?? 0) < PUBLIC_PUBLICATION_MINIMUMS.wordCount) return false;
  return true;
}
