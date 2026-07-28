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
  citationCoverage: 0.72,
  wordCount: 700,
};

export type PublicationQualityRule = {
  minTrustScore: number;
  minQualityScore: number;
  minCitationCoverage: number;
  minWordCount: number;
  minSourceCount: number;
};

export const PUBLICATION_QUALITY_RULES: Record<string, PublicationQualityRule> = {
  // ── Primary format 1: ARTICLE (Le Shift Project / LawZero style) ──
  ARTICLE: {
    minTrustScore: 65,
    minQualityScore: 70,
    minCitationCoverage: 0.60,
    minWordCount: 3000,
    minSourceCount: 15,
  },
  // ── Primary format 2: STRATEGIC REPORT (McKinsey / France Stratégie style) ──
  STRATEGIC_REPORT: {
    minTrustScore: 65,
    minQualityScore: 75,
    minCitationCoverage: 0.50,
    minWordCount: 5000,
    minSourceCount: 15,
  },
  // ── Signal format (breaking news) ──
  SUMMARY_BRIEF: {
    minTrustScore: 60,
    minQualityScore: 65,
    minCitationCoverage: 0.30,
    minWordCount: 700,
    minSourceCount: 5,
  },
  // ── Legacy aliases → map to ARTICLE rules ──
  RESEARCH_BRIEF: {
    minTrustScore: 65,
    minQualityScore: 70,
    minCitationCoverage: 0.60,
    minWordCount: 3000,
    minSourceCount: 15,
  },
  EXECUTIVE_BRIEF: {
    minTrustScore: 65,
    minQualityScore: 70,
    minCitationCoverage: 0.60,
    minWordCount: 3000,
    minSourceCount: 15,
  },
  POLICY_NOTE: {
    minTrustScore: 65,
    minQualityScore: 70,
    minCitationCoverage: 0.60,
    minWordCount: 3000,
    minSourceCount: 15,
  },
  // ── Future format ──
  DOSSIER: {
    minTrustScore: 72,
    minQualityScore: 78,
    minCitationCoverage: 0.45,
    minWordCount: 8000,
    minSourceCount: 35,
  },
};

export const DEFAULT_PUBLICATION_QUALITY_RULE = PUBLICATION_QUALITY_RULES.ARTICLE;

export function getPublicationQualityRule(type?: string | null) {
  return PUBLICATION_QUALITY_RULES[type || ""] || DEFAULT_PUBLICATION_QUALITY_RULE;
}

export function evaluatePublicationReadiness(publication: {
  type?: string | null;
  trustScore?: number | null;
  qualityScore?: number | null;
  citationCoverage?: number | null;
  wordCount?: number | null;
  sourceIds?: string[] | null;
}) {
  const rule = getPublicationQualityRule(publication.type);
  const sourceCount = publication.sourceIds?.length || 0;
  const failures: string[] = [];

  if ((publication.trustScore ?? 0) < rule.minTrustScore) {
    failures.push(`trustScore ${(publication.trustScore ?? 0)}/100 < ${rule.minTrustScore}`);
  }
  if ((publication.qualityScore ?? 0) < rule.minQualityScore) {
    failures.push(`qualityScore ${(publication.qualityScore ?? 0)}/100 < ${rule.minQualityScore}`);
  }
  if ((publication.citationCoverage ?? 0) < rule.minCitationCoverage) {
    failures.push(`citationCoverage ${Math.round((publication.citationCoverage ?? 0) * 100)}% < ${Math.round(rule.minCitationCoverage * 100)}%`);
  }
  if ((publication.wordCount ?? 0) < rule.minWordCount) {
    failures.push(`wordCount ${(publication.wordCount ?? 0)} < ${rule.minWordCount}`);
  }

  return {
    ok: failures.length === 0,
    rule,
    sourceCount,
    failures,
  };
}

function qualityRuleWhereClauses() {
  return Object.entries(PUBLICATION_QUALITY_RULES).map(([type, rule]) => ({
    type,
    trustScore: { gte: rule.minTrustScore },
    qualityScore: { gte: rule.minQualityScore },
    citationCoverage: { gte: rule.minCitationCoverage },
    wordCount: { gte: rule.minWordCount },
  }));
}

export function publicPublicationWhere(extra: Record<string, any> = {}) {
  const existingAnd = Array.isArray(extra.AND) ? extra.AND : extra.AND ? [extra.AND] : [];
  const { AND: _and, publishedAt: extraPublishedAt, ...rest } = extra;

  return {
    ...rest,
    status: "PUBLISHED",
    AND: [
      ...existingAnd,
      { publishedAt: { not: null } },
      ...(extraPublishedAt ? [{ publishedAt: extraPublishedAt }] : []),
      { OR: qualityRuleWhereClauses() },
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
  sourceIds?: string[] | null;
}) {
  if (!publication.id || DEMO_PUBLICATION_IDS.has(publication.id)) return false;
  if (publication.publicId && DEMO_PUBLIC_IDS.has(publication.publicId)) return false;
  if (publication.title && DEMO_TITLE_PATTERNS.includes(publication.title)) return false;
  if (publication.status !== "PUBLISHED" || !publication.publishedAt) return false;
  return evaluatePublicationReadiness(publication).ok;
}
