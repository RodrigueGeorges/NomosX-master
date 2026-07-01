/**
 * ENHANCED RANKER - A+ LEVEL QUALITY FILTERING
 * 
 * Amélioration du système de ranking pour atteindre les standards A+
 * - Seuil qualité augmenté à 80%
 * - Filtrage sources académiques premium
 * - Diversité améliorée
 * - Extraction données quantitatives
 */

import { prisma } from '../db';
import type { Source } from '@prisma/client';

export interface EnhancedRankOptions {
  limit?: number;
  mode?: 'quality' | 'novelty' | 'balanced';
  // CRITICAL: Scope to specific source IDs (from current SCOUT run)
  sourceIds?: string[];           // If set, only rank these sources
  // A+ LEVEL: Enhanced quality controls
  minQuality?: number;           // Augmenté à 85% (standards A+)
  requireAbstract?: boolean;      // Obligatoire
  minAbstractLength?: number;     // Minimum 300 mots
  academicPriority?: boolean;     // Priorité sources académiques
  quantitativeData?: boolean;    // Exige données quantitatives
  // Enhanced diversity controls
  maxPerProvider?: number;        // Max 6 par provider
  maxPerYear?: number;           // Max 4 par année
  minProviderDiversity?: number; // Min 4 providers différents
  // Content quality
  excludeLowQuality?: boolean;   // Exclure sources < 70%
  requirePeerReviewed?: boolean; // Exiger peer review quand possible
}

export interface EnhancedRankedSource extends Source {
  compositeScore: number;
  relevanceScore: number;
  academicWeight: number;
  hasQuantitativeData: boolean;
  peerReviewed: boolean;
}

/**
 * Enhanced Rank Function - A+ Level
 */
export async function enhancedRank(
  query: string,
  limitOrOptions: number | EnhancedRankOptions = 12,
  mode: 'quality' | 'novelty' | 'balanced' = 'balanced'
): Promise<EnhancedRankedSource[]> {
  
  // Parse options
  const options: EnhancedRankOptions = typeof limitOrOptions === 'number' 
    ? { limit: limitOrOptions, mode }
    : { limit: 12, mode, ...limitOrOptions };

  // Permissive defaults — let SCOUT's relevance filter + Cohere reranking do the heavy lifting
  // The ranker should NOT aggressively filter; it should RANK.
  const finalOptions = {
    minQuality: 0,                      // Don't filter by quality (freshly scouted = 0)
    requireAbstract: false,             // Many valid sources lack abstracts
    minAbstractLength: 0,               // Disabled — was killing sources without abstracts
    academicPriority: false,
    quantitativeData: false,
    maxPerProvider: 10,
    maxPerYear: 8,
    minProviderDiversity: 2,            // Lowered — some queries only hit 1-2 providers
    excludeLowQuality: false,
    requirePeerReviewed: false,
    ...options
  };

  console.log(`[ENHANCED RANK] Starting WAR MACHINE ranking with optimized thresholds:`, {
    minQuality: finalOptions.minQuality,
    requireAbstract: finalOptions.requireAbstract,
    maxPerProvider: finalOptions.maxPerProvider,
    limit: finalOptions.limit
  });

  // Build enhanced WHERE clause
  // NOTE: requireAbstract is applied post-query to exempt news sources
  const whereConditions: any[] = [
    { deletedAt: null },
    // CRITICAL: Scope to SCOUT sourceIds if provided (prevents querying entire DB)
    finalOptions.sourceIds?.length ? { id: { in: finalOptions.sourceIds } } : null,
    finalOptions.excludeLowQuality ? { 
      qualityScore: { gte: finalOptions.minQuality } 
    } : null
  ].filter(Boolean);

  if (whereConditions.length === 0) {
    console.warn('[ENHANCED RANK] No valid conditions, returning empty');
    return [];
  }

  // Query with enhanced filters
  let sources = await prisma.source.findMany({
    where: {
      AND: whereConditions
    },
    include: {
      authors: true,
      institutions: true
    },
    orderBy: [
      { qualityScore: 'desc' },
      { noveltyScore: 'desc' },
      { createdAt: 'desc' }
    ],
    take: finalOptions.limit! * 3 // Get 3x more for filtering
  });

  // Post-query filtering for abstract (Prisma doesn't support length in where)
  // News sources are EXEMPT — they have shorter abstracts but are valuable real-time intelligence
  const newsProviders = ['gdelt-news', 'newsapi', 'mediastack', 'thenewsapi', 'gnews', 'eventregistry', 'linkup'];
  if (finalOptions.requireAbstract || (finalOptions.minAbstractLength && finalOptions.minAbstractLength > 0)) {
    const beforeAbstractFilter = sources.length;
    sources = sources.filter(source => {
      const isNews = newsProviders.includes(source.provider || '');
      if (isNews) return true; // News sources bypass abstract filter
      if (finalOptions.requireAbstract && !source.abstract) return false;
      if (finalOptions.minAbstractLength && finalOptions.minAbstractLength > 0) {
        if (!source.abstract || source.abstract.length < finalOptions.minAbstractLength) return false;
      }
      return true;
    });
    const newsCount = sources.filter(s => newsProviders.includes(s.provider || '')).length;
    if (sources.length < beforeAbstractFilter) {
      console.log(`[ENHANCED RANK] Abstract filter: ${beforeAbstractFilter} → ${sources.length} (${newsCount} news exempted, min ${finalOptions.minAbstractLength || 'has abstract'} chars)`);
    }
  }

  const isScoped = !!(finalOptions as any).sourceIds?.length;
  console.log(`[ENHANCED RANK] Found ${sources.length} sources before scoring (scoped: ${isScoped})`);

  // Enhanced scoring algorithm with relevance filtering
  let rejectedCount = 0;
  const enhancedSources = sources.map(source => {
    const qualityScore = source.qualityScore || 0;
    const noveltyScore = source.noveltyScore || 0;
    
    const relevanceScore = calculateRelevanceScore(query, source);
    
    // When scoped to SCOUT sourceIds, use very low threshold (sources already query-matched)
    // When querying whole DB, use stricter threshold
    const relevanceThreshold = isScoped ? 0.0 : 1.0;
    if (relevanceScore < relevanceThreshold) {
      rejectedCount++;
      return null;
    }
    
    // A+ LEVEL: Academic weight calculation
    const academicWeight = calculateSourceAuthorityWeight(source);
    
    // A+ LEVEL: Quantitative data detection
    const hasQuantitativeData = detectQuantitativeData(source);
    
    // A+ LEVEL: Peer review detection
    const peerReviewed = detectPeerReview(source);
    
    // Composite score with relevance as critical factor
    const compositeScore = calculateCompositeScore({
      quality: qualityScore,
      novelty: noveltyScore,
      relevance: relevanceScore * 10, // Boost relevance importance
      academic: academicWeight,
      quantitative: hasQuantitativeData ? 1 : 0,
      peerReviewed: peerReviewed ? 1 : 0,
      mode: finalOptions.mode || 'balanced'
    });
    
    return {
      ...source,
      compositeScore,
      relevanceScore,
      academicWeight,
      hasQuantitativeData,
      peerReviewed
    };
  }).filter((source): source is typeof source & { compositeScore: number; relevanceScore: number; academicWeight: number; hasQuantitativeData: boolean; peerReviewed: boolean } => 
    source !== null && 'compositeScore' in source
  ); // Type guard to keep only valid enhanced sources

  if (rejectedCount > 0) {
    console.log(`[ENHANCED RANK] Rejected ${rejectedCount}/${sources.length} sources (relevance < ${isScoped ? '0.0' : '1.0'})`);
  }

  // Apply enhanced diversity and quality filters
  const filteredSources = applyEnhancedFilters(enhancedSources, finalOptions);

  // Sort by composite score and limit
  const finalSources = filteredSources
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .slice(0, finalOptions.limit!);

  // SAFETY NET: If we ended up with too few sources after filtering, relax and take what we have
  if (finalSources.length < 3 && enhancedSources.length > finalSources.length) {
    console.warn(`[ENHANCED RANK] Only ${finalSources.length} sources after diversity filter — relaxing to top ${Math.min(finalOptions.limit!, enhancedSources.length)} by composite score`);
    const relaxed = enhancedSources
      .sort((a, b) => b.compositeScore - a.compositeScore)
      .slice(0, finalOptions.limit!);
    console.log(`[ENHANCED RANK] Relaxed selection: ${relaxed.length} sources`);
    return relaxed;
  }

  console.log(`[ENHANCED RANK] Final selection: ${finalSources.length} sources`);
  if (finalSources.length > 0) {
    console.log(`[ENHANCED RANK] Quality stats:`, {
      avgQuality: Math.round(finalSources.reduce((sum, s) => sum + (s.qualityScore || 0), 0) / finalSources.length),
      academicSources: finalSources.filter(s => s.academicWeight > 0.7).length,
      quantitativeSources: finalSources.filter(s => s.hasQuantitativeData).length,
      peerReviewedSources: finalSources.filter(s => s.peerReviewed).length,
      providers: [...new Set(finalSources.map(s => s.provider))].join(', ')
    });
  }

  return finalSources;
}

/**
 * Calculate source authority weight — replaces academic-only weight.
 * News sources from authority domains get high weight (0.8+),
 * academic sources get weight from DOI/citations/abstract quality.
 * No source type is structurally penalized.
 */
function calculateSourceAuthorityWeight(source: any): number {
  const newsProviders = ['gdelt-news', 'newsapi', 'mediastack', 'thenewsapi', 'gnews', 'eventregistry', 'linkup'];
  const isNews = newsProviders.includes(source.provider || '');

  if (isNews) {
    // News authority domains get high weight
    const newsAuthorityDomains = [
      'reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk', 'nytimes.com', 'ft.com',
      'wsj.com', 'washingtonpost.com', 'theguardian.com', 'bloomberg.com', 'economist.com',
      'politico.eu', 'euronews.com', 'lemonde.fr', 'figaro.fr', 'liberation.fr',
      'bruegel.org', 'csis.org', 'brookings.edu', 'chathamhouse.org', 'cfr.org',
      'rand.org', 'carnegieendowment.org', 'ecfr.eu', 'sipri.org',
    ];
    const sourceUrl = source.url || '';
    const sourceDomain = sourceUrl ? sourceUrl.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '') : '';
    const isAuthorityDomain = newsAuthorityDomains.some(d => sourceDomain === d || sourceDomain.endsWith('.' + d));

    if (isAuthorityDomain) return 0.9;   // Tier-1 news = same as top academic
    if (source.abstract && source.abstract.length > 200) return 0.75; // Substantial content
    return 0.65; // Base news weight — still better than old 0.5
  }

  // Academic weight calculation (original logic)
  let weight = 0.5;
  if (source.doi) weight += 0.1;
  if (source.citationCount && source.citationCount > 100) weight += 0.1;
  if (source.abstract && source.abstract.length > 500) weight += 0.05;
  if (source.year && source.year >= 2020) weight += 0.05;
  return Math.min(weight, 1.0);
}

/**
 * Detect quantitative data in source content
 */
function detectQuantitativeData(source: any): boolean {
  const content = `${source.title} ${source.abstract || ''}`.toLowerCase();
  
  // Quantitative indicators
  const quantitativePatterns = [
    /\d+%/g,                    // Percentages
    /\d+\.\d+%/g,              // Decimal percentages
    /\$[\d,]+/g,               // Dollar amounts
    /\d+(?:,\d{3})*(?:\.\d+)?\s*(?:million|billion|thousand)/g, // Large numbers
    /\d+(?:\.\d+)?\s*(?:increase|decrease|growth|decline)/g, // Changes
    /p-value\s*<\s*0\.05/gi,   // Statistical significance
    /confidence interval/gi,    // Statistical intervals
    /standard deviation/gi,     // Statistical measures
    /correlation coefficient/gi // Statistical measures
  ];
  
  return quantitativePatterns.some(pattern => pattern.test(content));
}

/**
 * Detect peer review status
 */
function detectPeerReview(source: any): boolean {
  // Heuristics for peer review detection
  const peerReviewedIndicators = [
    source.doi && source.doi.includes('10.'),
    source.year && new Date().getFullYear() - source.year <= 2, // Recent publications
    !(source.title || '').toLowerCase().includes('preprint'),
    !(source.title || '').toLowerCase().includes('working paper')
  ];
  
  return peerReviewedIndicators.filter(Boolean).length >= 2;
}

/**
 * Composite score calculation with A+ weights
 */
function calculateCompositeScore(params: {
  quality: number;
  novelty: number;
  relevance: number;
  academic: number;
  quantitative: number;
  peerReviewed: number;
  mode: 'quality' | 'novelty' | 'balanced';
}): number {
  const { quality, novelty, relevance, academic, quantitative, peerReviewed, mode } = params;
  
  // Base weights by mode
  let weights: { quality: number; novelty: number; relevance: number };
  
  switch (mode) {
    case 'quality':
      weights = { quality: 0.4, novelty: 0.2, relevance: 0.4 };
      break;
    case 'novelty':
      weights = { quality: 0.2, novelty: 0.5, relevance: 0.3 };
      break;
    case 'balanced':
    default:
      weights = { quality: 0.3, novelty: 0.3, relevance: 0.4 };
      break;
  }
  
  // Calculate base composite score
  let composite = 
    (quality / 100) * weights.quality +
    (novelty / 100) * weights.novelty +
    (relevance / 3) * weights.relevance; // relevance max is 3.0
  
  // Apply bonuses (additive, not multiplicative — multiplying by 0 zeroes everything)
  composite *= academic;                        // Academic weight (0.5-1.0 range, safe)
  composite += quantitative * 0.05;             // +5% bonus for quantitative data
  composite += peerReviewed * 0.05;             // +5% bonus for peer review
  
  return Math.min(composite * 100, 100);
}

/**
 * Calculate relevance score — general-purpose keyword matching.
 * Works for ANY query (no hardcoded domain list).
 */
function calculateRelevanceScore(query: string, source: any): number {
  if (!query || !source) return 0;
  
  // Extract meaningful terms (skip stop words)
  const stopWords = new Set(['the','and','for','are','but','not','you','all','can','had','her','was','one','our','out','with','from','this','that','have','been','they','what','when','where','which','their','about','would','there','could','other','into','more','some','than','them','very','after','also','over','such','only','these','will','each','make','like','just','between']);
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2 && !stopWords.has(t));
  
  if (queryTerms.length === 0) return 1.0; // No meaningful terms, give base score
  
  const title = (source.title || '').toLowerCase();
  const abstract = (source.abstract || '').toLowerCase();
  const topics = (source.topics || []).join(' ').toLowerCase();
  
  let score = 0;
  let titleMatches = 0;
  let abstractMatches = 0;
  let topicMatches = 0;
  
  for (const term of queryTerms) {
    if (title.includes(term)) { score += 2.0; titleMatches++; }
    if (abstract.includes(term)) { score += 0.8; abstractMatches++; }
    if (topics.includes(term)) { score += 1.0; topicMatches++; }
  }
  
  // Coverage bonus
  const totalMatches = titleMatches + abstractMatches + topicMatches;
  const uniqueTermsMatched = new Set([
    ...queryTerms.filter(t => title.includes(t)),
    ...queryTerms.filter(t => abstract.includes(t)),
    ...queryTerms.filter(t => topics.includes(t)),
  ]).size;
  const coverage = uniqueTermsMatched / queryTerms.length;
  score += coverage * 3.0;
  
  return Math.max(0, score);
}

/**
 * Apply enhanced diversity and quality filters
 */
function applyEnhancedFilters(
  sources: EnhancedRankedSource[], 
  options: EnhancedRankOptions
): EnhancedRankedSource[] {
  let filtered = [...sources];
  
  // Provider diversity filter
  if (options.maxPerProvider && options.minProviderDiversity) {
    const providerCounts: Record<string, number> = {};
    filtered = filtered.filter(source => {
      const provider = source.provider || 'unknown';
      providerCounts[provider] = (providerCounts[provider] || 0) + 1;
      return providerCounts[provider] <= options.maxPerProvider!;
    });
    
    // Ensure minimum provider diversity
    const uniqueProviders = new Set(filtered.map(s => s.provider || 'unknown'));
    if (uniqueProviders.size < options.minProviderDiversity) {
      console.warn(`[ENHANCED RANK] Provider diversity warning: ${uniqueProviders.size} < ${options.minProviderDiversity}`);
    }
  }
  
  // Year diversity filter
  if (options.maxPerYear) {
    const yearCounts: Record<number, number> = {};
    filtered = filtered.filter(source => {
      const year = source.year || 2020;
      yearCounts[year] = (yearCounts[year] || 0) + 1;
      return yearCounts[year] <= options.maxPerYear!;
    });
  }
  
  // Academic priority filter
  if (options.academicPriority) {
    const academicSources = filtered.filter(s => s.academicWeight > 0.7);
    const nonAcademicSources = filtered.filter(s => s.academicWeight <= 0.7);
    
    // Ensure at least 60% academic sources
    const targetAcademic = Math.ceil(options.limit! * 0.6);
    if (academicSources.length >= targetAcademic) {
      filtered = [
        ...academicSources.slice(0, targetAcademic),
        ...nonAcademicSources.slice(0, options.limit! - targetAcademic)
      ];
    }
  }
  
  // Quantitative data filter
  if (options.quantitativeData) {
    const quantitativeSources = filtered.filter(s => s.hasQuantitativeData);
    if (quantitativeSources.length === 0) {
      console.warn('[ENHANCED RANK] No sources with quantitative data found');
    } else {
      // Ensure at least 30% have quantitative data
      const targetQuantitative = Math.ceil(options.limit! * 0.3);
      if (quantitativeSources.length < targetQuantitative) {
        console.warn(`[ENHANCED RANK] Quantitative data warning: ${quantitativeSources.length} < ${targetQuantitative}`);
      }
    }
  }
  
  return filtered;
}
