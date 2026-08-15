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
    minQualityScore: 70,
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

/**
 * Adaptive minimum source count — adjusts based on domain and evidence availability.
 * Emerging/niche domains get lower thresholds than mature, well-studied fields.
 * This replaces the rigid fixed minSourceCount with a context-aware value.
 */
export function getAdaptiveMinSourceCount(
  formatType: string,
  domain?: string | null,
  availableSourceCount?: number,
): number {
  const baseRule = getPublicationQualityRule(formatType);
  const baseMin = baseRule.minSourceCount;

  // Domains with typically abundant literature — keep full threshold
  const abundantLiteratureDomains = ['economics', 'finance', 'technology', 'health', 'policy'];
  // Emerging/niche domains — reduce threshold (fewer sources exist)
  const nicheDomains = ['cognitive-science', 'bioethics', 'complexity-science', 'urban-studies', 'development-economics'];

  if (domain && nicheDomains.includes(domain)) {
    return Math.max(5, Math.round(baseMin * 0.5));
  }

  // If we know how many sources are available, don't demand more than what exists
  // (but still require a minimum to prevent hallucination)
  if (availableSourceCount !== undefined && availableSourceCount < baseMin) {
    // Accept 70% of available if at least 5, else floor at 5
    return Math.max(5, Math.round(availableSourceCount * 0.7));
  }

  // For non-abundant domains, reduce slightly
  if (domain && !abundantLiteratureDomains.includes(domain)) {
    return Math.max(8, Math.round(baseMin * 0.7));
  }

  return baseMin;
}

export function evaluatePublicationReadiness(publication: {
  type?: string | null;
  trustScore?: number | null;
  qualityScore?: number | null;
  citationCoverage?: number | null;
  wordCount?: number | null;
  sourceIds?: string[] | null;
  domain?: string | null;
}) {
  const rule = getPublicationQualityRule(publication.type);
  const sourceCount = publication.sourceIds?.length || 0;

  // Adaptive thresholds: relax word count and citation coverage when evidence is scarce
  // This prevents niche/emerging topics from being blocked by metrics designed for mature fields
  const adaptiveMinWordCount = sourceCount < 10
    ? Math.round(rule.minWordCount * 0.5)
    : sourceCount < 15
      ? Math.round(rule.minWordCount * 0.75)
      : rule.minWordCount;
  const adaptiveMinCitationCoverage = sourceCount < 8
    ? Math.max(0.20, rule.minCitationCoverage * 0.5)
    : sourceCount < 15
      ? Math.max(0.30, rule.minCitationCoverage * 0.75)
      : rule.minCitationCoverage;

  const failures: string[] = [];

  if ((publication.trustScore ?? 0) < rule.minTrustScore) {
    failures.push(`trustScore ${(publication.trustScore ?? 0)}/100 < ${rule.minTrustScore}`);
  }
  if ((publication.qualityScore ?? 0) < rule.minQualityScore) {
    failures.push(`qualityScore ${(publication.qualityScore ?? 0)}/100 < ${rule.minQualityScore}`);
  }
  if ((publication.citationCoverage ?? 0) < adaptiveMinCitationCoverage) {
    failures.push(`citationCoverage ${Math.round((publication.citationCoverage ?? 0) * 100)}% < ${Math.round(adaptiveMinCitationCoverage * 100)}%`);
  }
  if ((publication.wordCount ?? 0) < adaptiveMinWordCount) {
    failures.push(`wordCount ${(publication.wordCount ?? 0)} < ${adaptiveMinWordCount}`);
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
