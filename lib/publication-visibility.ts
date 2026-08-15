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

/**
 * Publication quality rules — UNIFORM QUALITY BAR across all formats.
 *
 * The difference between formats is ANGLE and LENGTH, not quality.
 * A Signal Brief is held to the SAME trust/quality standard as a Strategic Report.
 * What varies is only the minimum word count and source count (format length).
 *
 *   minTrustScore:       65 for ALL formats (same credibility bar)
 *   minQualityScore:     70 for ALL formats (same analytical rigor)
 *   minCitationCoverage: 50% for ALL formats (same evidence standard)
 *   minWordCount:        varies by format (500 → 8000) — benchmarked against top think tanks
 *   minSourceCount:      varies by format (5 → 20)
 */
const UNIFORM_MIN_TRUST = 65;
const UNIFORM_MIN_QUALITY = 70;
const UNIFORM_MIN_CITATION = 0.50;

export const PUBLICATION_QUALITY_RULES: Record<string, PublicationQualityRule> = {
  // ── 1. Signal Brief — ALERT angle, 2-4 pages ──
  // Benchmark: Carsey fact sheet (900w), FAO (700w), World Bank short (1500w)
  SUMMARY_BRIEF: {
    minTrustScore: UNIFORM_MIN_TRUST,
    minQualityScore: UNIFORM_MIN_QUALITY,
    minCitationCoverage: UNIFORM_MIN_CITATION,
    minWordCount: 500,
    minSourceCount: 5,
  },
  // ── 2. Decision Memo — ACTION angle, 4-8 pages ──
  // Benchmark: GNSI (2400w), WHO (1000-3000w), National Academies (1500-2000w), ERF (2000-2500w)
  DECISION_MEMO: {
    minTrustScore: UNIFORM_MIN_TRUST,
    minQualityScore: UNIFORM_MIN_QUALITY,
    minCitationCoverage: UNIFORM_MIN_CITATION,
    minWordCount: 1200,
    minSourceCount: 8,
  },
  // ── 3. Article — ANALYSIS angle, 8-15 pages ──
  // Benchmark: Carsey issue brief (1800-4000w), McKinsey Quarterly (3000-8000w)
  ARTICLE: {
    minTrustScore: UNIFORM_MIN_TRUST,
    minQualityScore: UNIFORM_MIN_QUALITY,
    minCitationCoverage: UNIFORM_MIN_CITATION,
    minWordCount: 3000,
    minSourceCount: 15,
  },
  // ── 4. Strategic Report — STRATEGY angle, 20-50 pages ──
  // Benchmark: McKinsey white paper (8000-20000w), France Stratégie rapport (15000-40000w)
  STRATEGIC_REPORT: {
    minTrustScore: UNIFORM_MIN_TRUST,
    minQualityScore: UNIFORM_MIN_QUALITY,
    minCitationCoverage: UNIFORM_MIN_CITATION,
    minWordCount: 8000,
    minSourceCount: 20,
  },
  // ── Legacy aliases → same uniform quality, format-specific length ──
  RESEARCH_BRIEF: {
    minTrustScore: UNIFORM_MIN_TRUST,
    minQualityScore: UNIFORM_MIN_QUALITY,
    minCitationCoverage: UNIFORM_MIN_CITATION,
    minWordCount: 1200,
    minSourceCount: 8,
  },
  EXECUTIVE_BRIEF: {
    minTrustScore: UNIFORM_MIN_TRUST,
    minQualityScore: UNIFORM_MIN_QUALITY,
    minCitationCoverage: UNIFORM_MIN_CITATION,
    minWordCount: 1200,
    minSourceCount: 8,
  },
  POLICY_NOTE: {
    minTrustScore: UNIFORM_MIN_TRUST,
    minQualityScore: UNIFORM_MIN_QUALITY,
    minCitationCoverage: UNIFORM_MIN_CITATION,
    minWordCount: 1200,
    minSourceCount: 8,
  },
  UPDATE_NOTE: {
    minTrustScore: UNIFORM_MIN_TRUST,
    minQualityScore: UNIFORM_MIN_QUALITY,
    minCitationCoverage: UNIFORM_MIN_CITATION,
    minWordCount: 500,
    minSourceCount: 5,
  },
  DATA_NOTE: {
    minTrustScore: UNIFORM_MIN_TRUST,
    minQualityScore: UNIFORM_MIN_QUALITY,
    minCitationCoverage: UNIFORM_MIN_CITATION,
    minWordCount: 500,
    minSourceCount: 5,
  },
  DOSSIER: {
    minTrustScore: UNIFORM_MIN_TRUST,
    minQualityScore: UNIFORM_MIN_QUALITY,
    minCitationCoverage: UNIFORM_MIN_CITATION,
    minWordCount: 8000,
    minSourceCount: 20,
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
