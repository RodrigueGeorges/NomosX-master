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
import { filterLowQualitySources } from '../providers/source-quality-filter';

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
  trustTier?: SourceTrustTier;
  loadBearing?: boolean;       // T8: true for top sources that anchor the causal chain
  readingBudget?: 'full_text' | 'abstract' | 'skip';  // T8: concentrated reading budget
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
    // Apply quality filter whenever minQuality > 0 (not just when excludeLowQuality is set)
    finalOptions.minQuality && finalOptions.minQuality > 0 ? {
      qualityScore: { gte: finalOptions.minQuality }
    } : null,
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
    take: finalOptions.limit! * 5 // Get 5x more candidates for filtering (was 3x — too few for niche topics)
  });

  // Post-query filtering for abstract (Prisma doesn't support length in where)
  // News sources are EXEMPT — they have shorter abstracts but are valuable real-time intelligence
  const newsProviders = ['gdelt-news', 'newsapi', 'mediastack', 'thenewsapi', 'gnews', 'eventregistry'];
  // T1 primary-data providers are EXEMPT — datasets carry quantitative value, not prose
  const primaryDataProviders = ['energy-charts', 'smard', 'rte-france', 'energi-data', 'fingrid', 'entsog', 'eurostat', 'treasury-fiscal', 'fred', 'imf', 'worldbank', 'istat', 'open-primitive'];
  if (finalOptions.requireAbstract || (finalOptions.minAbstractLength && finalOptions.minAbstractLength > 0)) {
    const beforeAbstractFilter = sources.length;
    sources = sources.filter(source => {
      const isNews = newsProviders.includes(source.provider || '');
      if (isNews) return true; // News sources bypass abstract filter
      const isPrimaryData = primaryDataProviders.includes(source.provider || '');
      if (isPrimaryData) return true; // Dataset sources bypass abstract filter
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

  // ── SOURCE QUALITY FILTER (defensive second pass) ──
  // Catches any SEO farms / spam directories that slipped past the SCOUT filter.
  const beforeQualityFilter = sources.length;
  sources = filterLowQualitySources(sources as any[]) as typeof sources;
  const qualityFiltered = beforeQualityFilter - sources.length;
  if (qualityFiltered > 0) {
    console.log(`[ENHANCED RANK] Filtered ${qualityFiltered} low-quality sources (SEO farms, spam)`);
  }

  const isScoped = !!(finalOptions as any).sourceIds?.length;
  console.log(`[ENHANCED RANK] Found ${sources.length} sources before scoring (scoped: ${isScoped})`);

  // Enhanced scoring algorithm with relevance filtering
  let rejectedCount = 0;
  // When scoped to SCOUT sourceIds, sources already passed SCOUT relevance filter + Cohere rerank.
  // The keyword-overlap score here is crude (title/abstract term matching) and misses semantic relevance.
  // Use a minimal threshold (0.5) to only reject completely irrelevant sources.
  // When querying whole DB, use stricter threshold.
  const relevanceThreshold = isScoped ? 0.5 : 1.0;
  // Web and news providers use different vocabulary — exempt from relevance gate
  const webProviderList = ['linkup', 'gdelt-news', 'newsapi', 'mediastack', 'thenewsapi', 'gnews', 'eventregistry'];

  // ── RELEVANCE PENALTY PRECOMPUTE ──
  // Query terms (stop words removed) used to detect title overlap.
  // A source whose title shares NO word with the query is heavily penalized
  // (quality score ÷ 2) — it is likely off-topic even if it passed other gates.
  const stopWords = new Set(['the','and','for','are','but','not','you','all','can','had','her','was','one','our','out','with','from','this','that','have','been','they','what','when','where','which','their','about','would','there','could','other','into','more','some','than','them','very','after','also','over','such','only','these','will','each','make','like','just','between']);
  const queryTerms = (query || '').toLowerCase().split(/\s+/).filter(t => t.length > 2 && !stopWords.has(t));
  const hasQueryTerms = queryTerms.length > 0;
  let titleOverlapPenaltyCount = 0;

  const enhancedSources = sources.map(source => {
    let qualityScore = source.qualityScore || 0;
    const noveltyScore = source.noveltyScore || 0;

    // Relevance penalty: if the title contains NONE of the query terms, halve
    // the quality score. Web/news providers are exempt (different vocabulary).
    // V3.2: For low-quality sources (q < 55), apply a stricter penalty (÷3) —
    // these are typically JSTOR book chapters or generic references that
    // happen to match one keyword but are fundamentally off-topic.
    if (hasQueryTerms && !webProviderList.includes(source.provider || '')) {
      const titleLower = (source.title || '').toLowerCase();
      const abstractLower = (source.abstract || '').toLowerCase();
      const hasAnyOverlap = queryTerms.some(term => titleLower.includes(term) || abstractLower.includes(term));
      if (!hasAnyOverlap) {
        qualityScore = qualityScore / 2;
        titleOverlapPenaltyCount++;
      } else if (qualityScore < 55) {
        // Low-quality source with only abstract overlap (not title) — penalize harder
        const hasTitleOverlap = queryTerms.some(term => titleLower.includes(term));
        if (!hasTitleOverlap) {
          qualityScore = qualityScore / 3;
          titleOverlapPenaltyCount++;
        }
      }
    }
    
    const relevanceScore = calculateRelevanceScore(query, source);
    
    // Web/news sources bypass relevance threshold — they were fetched with the query
    const isWebProvider = webProviderList.includes(source.provider || '');
    if (!isWebProvider && relevanceScore < relevanceThreshold) {
      rejectedCount++;
      return null;
    }
    
    // P2.4: Trust tier classification — used as scoring multiplier
    const { tier, weight: tierWeight } = classifyTrustTier(source);

    // A+ LEVEL: Academic weight calculation (now informed by trust tier)
    const academicWeight = Math.max(calculateSourceAuthorityWeight(source), tierWeight);
    
    // A+ LEVEL: Quantitative data detection
    const hasQuantitativeData = detectQuantitativeData(source);

    // A+ LEVEL: Peer review detection
    const peerReviewed = detectPeerReview(source);

    // NomosX: Cross-domain detection — sources spanning multiple domains get a bonus
    const sourceDomains = Array.isArray(source.topics) ? source.topics.filter((t: unknown): t is string => typeof t === 'string') : [];
    const crossDomainScore = sourceDomains.length > 0 ? Math.min(1, sourceDomains.length / 4) : 0; // 4+ topics = max cross-domain

    // NomosX: Heterodox detection — sources with critique/challenge keywords get a bonus
    const heterodoxKeywords = ['critique', 'challenge', 'reconsider', 'against', 'problematic', 'dissent', 'heterodox', 'alternative', 'contrarian', 'rethink', 'paradigm'];
    const sourceText = ((source.title || '') + ' ' + (source.abstract || '')).toLowerCase();
    const heterodoxScore = Math.min(1, heterodoxKeywords.filter(kw => sourceText.includes(kw)).length / 3);

    // NomosX: Independent media detection
    const independentProviders = ['independent-media', 'gdelt-independent'];
    const independentScore = independentProviders.includes(source.provider || '') ? 1 : 0;

    // Composite score with relevance as critical factor
    const compositeScore = calculateCompositeScore({
      quality: qualityScore,
      novelty: noveltyScore,
      relevance: relevanceScore * 10, // Boost relevance importance
      academic: academicWeight,
      quantitative: hasQuantitativeData ? 1 : 0,
      peerReviewed: peerReviewed ? 1 : 0,
      crossDomain: crossDomainScore,
      heterodox: heterodoxScore,
      independent: independentScore,
      mode: finalOptions.mode || 'balanced'
    });
    
    return {
      ...source,
      compositeScore,
      relevanceScore,
      academicWeight,
      hasQuantitativeData,
      peerReviewed,
      trustTier: tier,
    } as EnhancedRankedSource & { trustTier: SourceTrustTier };
  }).filter((source): source is typeof source & { compositeScore: number; relevanceScore: number; academicWeight: number; hasQuantitativeData: boolean; peerReviewed: boolean } => 
    source !== null && 'compositeScore' in source
  ); // Type guard to keep only valid enhanced sources

  if (rejectedCount > 0) {
    console.log(`[ENHANCED RANK] Rejected ${rejectedCount}/${sources.length} sources (relevance < ${relevanceThreshold})`);
  }
  if (titleOverlapPenaltyCount > 0) {
    console.log(`[ENHANCED RANK] Penalized ${titleOverlapPenaltyCount} sources (quality ÷ 2 — no query-term overlap in title)`);
  }

  // Apply enhanced diversity and quality filters
  const filteredSources = applyEnhancedFilters(enhancedSources, finalOptions);

  // Sort by composite score and limit
  let finalSources = filteredSources
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .slice(0, finalOptions.limit!);

  // Post-slice diversity enforcement: sort+slice can undo redistribution
  // by selecting all top-scoring sources from a single provider.
  // Re-cap per provider and fill from remaining sources to maintain diversity.
  if (finalOptions.maxPerProvider && finalSources.length > 0) {
    const providerCounts: Record<string, number> = {};
    const capped: typeof finalSources = [];
    const remaining: typeof finalSources = [];
    for (const s of finalSources) {
      const p = s.provider || 'unknown';
      providerCounts[p] = (providerCounts[p] || 0) + 1;
      if (providerCounts[p] <= finalOptions.maxPerProvider) {
        capped.push(s);
      } else {
        remaining.push(s);
      }
    }
    // If capping reduced the list, try to fill from sources that were sliced off
    if (capped.length < finalSources.length) {
      const usedIds = new Set(capped.map(s => s.id));
      const overflow = filteredSources
        .filter(s => !usedIds.has(s.id))
        .sort((a, b) => b.compositeScore - a.compositeScore);
      for (const s of overflow) {
        if (capped.length >= (finalOptions.limit || 25)) break;
        const p = s.provider || 'unknown';
        providerCounts[p] = (providerCounts[p] || 0) + 1;
        if (providerCounts[p] <= finalOptions.maxPerProvider) {
          capped.push(s);
        }
      }
    }
    finalSources = capped;
    const finalProviderList = [...new Set(finalSources.map(s => s.provider || 'unknown'))];
    if (finalProviderList.length === 1 && finalSources.length > 1) {
      console.warn(`[ENHANCED RANK] Post-slice: all ${finalSources.length} sources from single provider '${finalProviderList[0]}' — diversity enforcement failed`);
    }
  }

  // SAFETY NET: If we ended up with too few sources after filtering, relax and take what we have
  if (finalSources.length < 8 && enhancedSources.length > finalSources.length) {
    console.warn(`[ENHANCED RANK] Only ${finalSources.length} sources after diversity filter — relaxing to top ${Math.min(finalOptions.limit!, enhancedSources.length)} by composite score`);
    const relaxed = enhancedSources
      .sort((a, b) => b.compositeScore - a.compositeScore)
      .slice(0, finalOptions.limit!);
    // T8: Mark load-bearing on relaxed selection too
    const lbCount = Math.max(3, Math.ceil(relaxed.length * 0.3));
    const absCount = Math.ceil(relaxed.length * 0.8);
    const markedRelaxed = relaxed.map((s, i) => ({
      ...s,
      loadBearing: i < lbCount,
      readingBudget: (i < lbCount ? 'full_text' : i < absCount ? 'abstract' : 'skip') as 'full_text' | 'abstract' | 'skip',
    }));
    console.log(`[ENHANCED RANK] Relaxed selection: ${markedRelaxed.length} sources`);
    return markedRelaxed;
  }

  // T8: Mark load-bearing sources and assign reading budgets
  // Top 30% by composite score are load-bearing → full-text reading priority
  // Next 50% get abstract reading
  // Bottom 20% get skip (minimal reading)
  if (finalSources.length > 0) {
    const loadBearingCount = Math.max(3, Math.ceil(finalSources.length * 0.3));
    const abstractCount = Math.ceil(finalSources.length * 0.8);
    finalSources = finalSources.map((s, i) => {
      if (i < loadBearingCount) {
        return { ...s, loadBearing: true, readingBudget: 'full_text' as const };
      } else if (i < abstractCount) {
        return { ...s, loadBearing: false, readingBudget: 'abstract' as const };
      } else {
        return { ...s, loadBearing: false, readingBudget: 'skip' as const };
      }
    });
    const lbCount = finalSources.filter(s => s.loadBearing).length;
    const fullTextCount = finalSources.filter(s => s.readingBudget === 'full_text').length;
    console.log(`[ENHANCED RANK] T8: ${lbCount} load-bearing sources (full-text), ${fullTextCount - lbCount + finalSources.filter(s => s.readingBudget === 'abstract').length} abstract, ${finalSources.filter(s => s.readingBudget === 'skip').length} skip`);
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
 * Source Trust Tier Classification (P2.4)
 *
 * Inspired by geodocs.dev — classify sources into 4 tiers based on
 * origin, review status, and content quality. Used as a hard filter
 * and as a scoring multiplier in the ranker.
 *
 * canonical: DOI + peer-reviewed + 100+ citations (weight: 1.0)
 * verified:  DOI + substantive abstract (weight: 0.85)
 * community: preprint, working paper, no DOI but has abstract (weight: 0.65)
 * untrusted: no DOI, short/no abstract, unknown provider (weight: 0.40)
 */
export type SourceTrustTier = 'canonical' | 'verified' | 'community' | 'untrusted';

export function classifyTrustTier(source: any): { tier: SourceTrustTier; weight: number } {
  const newsProviders = ['gdelt-news', 'newsapi', 'mediastack', 'thenewsapi', 'gnews', 'eventregistry'];
  const isNews = newsProviders.includes(source.provider || '');

  // Global consolidated RSS providers (80+ international organizations)
  const globalProviders = ['global-intelligence', 'global-orgs', 'global-think-tanks', 'global-science'];
  const isGlobalProvider = globalProviders.includes(source.provider || '');

  // Global providers: tier based on provider type (before news branch)
  if (isGlobalProvider) {
    const provider = source.provider || '';
    // AI labs within global-science are industry research (not peer-reviewed)
    const aiLabProviders = ['openai-research', 'deepmind', 'google-research', 'msr', 'meta-ai', 'amazon-science'];
    // Bellingcat (OSINT) within global-intelligence is community-tier
    const sourceUrl = source.url || '';
    const sourceDomain = sourceUrl ? sourceUrl.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '') : '';
    const isBellingcat = sourceDomain === 'bellingcat.com' || sourceDomain.endsWith('.bellingcat.com');

    if (provider === 'global-orgs') {
      // Official international organizations (UN agencies, WTO, ICC, etc.) — highly authoritative
      return { tier: 'canonical', weight: 0.90 };
    }
    if (provider === 'global-intelligence') {
      // Bellingcat is OSINT — community tier
      if (isBellingcat) return { tier: 'community', weight: 0.70 };
      // Official government/intelligence agency publications — authoritative but not peer-reviewed
      return { tier: 'verified', weight: 0.85 };
    }
    if (provider === 'global-think-tanks') {
      // Policy analysis from reputable think tanks — strong analytical value, institutional bias
      return { tier: 'verified', weight: 0.80 };
    }
    if (provider === 'global-science') {
      // AI labs are industry research (not peer-reviewed) — community tier
      if (aiLabProviders.includes(source.provider || '')) return { tier: 'community', weight: 0.75 };
      // Official science/research organizations — authoritative
      return { tier: 'verified', weight: 0.85 };
    }
  }

  // News sources: tier based on domain authority
  if (isNews) {
    const newsAuthorityDomains = [
      // Mainstream (Tier A — canonical)
      'reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk', 'nytimes.com', 'ft.com',
      'wsj.com', 'washingtonpost.com', 'theguardian.com', 'bloomberg.com', 'economist.com',
      'politico.eu', 'euronews.com', 'lemonde.fr', 'figaro.fr', 'liberation.fr',
      'bruegel.org', 'csis.org', 'brookings.edu', 'chathamhouse.org', 'cfr.org',
      'rand.org', 'carnegieendowment.org', 'ecfr.eu', 'sipri.org',
      // Independent investigative journalism (Tier A — canonical for investigative work)
      'theintercept.com', 'propublica.org', 'icij.org', 'occrp.org', 'bellingcat.com',
      'mediapart.fr',
      // Heterodox / independent analysis (Tier A- — verified, high editorial quality)
      'jacobin.com', 'nakedcapitalism.com', 'roarmag.org', 'novaramedia.com',
      'currentaffairs.org', 'versobooks.com',
      // Expert blogs (Tier B+ — verified, domain expertise)
      'marginalrevolution.com', 'overcomingbias.com', 'lesswrong.com',
      'astralcodexten.substack.com',
      // Global South / non-Western (Tier A- — canonical for non-Western perspectives)
      'africaisacountry.com', 'scroll.in', 'thewire.in', 'scmp.com',
    ];
    const sourceUrl = source.url || '';
    const sourceDomain = sourceUrl ? sourceUrl.replace(/^https:\/\//, '').split('/')[0].replace(/^www\./, '') : '';
    const isAuthorityDomain = newsAuthorityDomains.some(d => sourceDomain === d || sourceDomain.endsWith('.' + d));

    if (isAuthorityDomain) return { tier: 'canonical', weight: 0.9 };
    // Independent media providers get verified tier (not penalized for lacking DOI)
    const independentProviders = ['independent-media', 'gdelt-independent'];
    if (independentProviders.includes(source.provider || '')) {
      if (source.abstract && source.abstract.length > 200) return { tier: 'verified', weight: 0.80 };
      return { tier: 'community', weight: 0.70 };
    }
    if (source.abstract && source.abstract.length > 200) return { tier: 'verified', weight: 0.75 };
    return { tier: 'community', weight: 0.65 };
  }

  // Academic sources: tier based on DOI, citations, abstract quality
  const hasDoi = !!source.doi;
  const hasCitations = source.citationCount && source.citationCount > 100;
  const hasAbstract = source.abstract && source.abstract.length > 500;
  const isPeerReviewed = !((source.title || '').toLowerCase().includes('preprint') ||
    (source.title || '').toLowerCase().includes('working paper'));

  if (hasDoi && hasCitations && isPeerReviewed) return { tier: 'canonical', weight: 1.0 };
  if (hasDoi && hasAbstract) return { tier: 'verified', weight: 0.85 };
  if (hasAbstract || hasDoi) return { tier: 'community', weight: 0.65 };
  return { tier: 'untrusted', weight: 0.40 };
}

/**
 * Calculate source authority weight — replaces academic-only weight.
 * News sources from authority domains get high weight (0.8+),
 * academic sources get weight from DOI/citations/abstract quality.
 * No source type is structurally penalized.
 */
function calculateSourceAuthorityWeight(source: any): number {
  const newsProviders = ['gdelt-news', 'newsapi', 'mediastack', 'thenewsapi', 'gnews', 'eventregistry'];
  const isNews = newsProviders.includes(source.provider || '');

  // Recognized institutional providers — reports from these are authoritative
  const institutionalProviders = [
    'iaea', 'irena', 'cea', 'entsoe', 'jrc', 'iea', 'acer', 'entsog', 'bruegel', 'eea',
    'openreview', 'biorxiv', 'papers-with-code', 'mit-dspace', 'harvard-dash', 'max-planck-pure',
    'energy-charts', 'smard', 'rte-france', 'energi-data', 'fingrid',
    'istat', 'open-primitive', 'treasury-fiscal', 'clinical-trials',
    'oecd', 'oecd-direct', 'worldbank', 'imf', 'bis',
    'eurostat', 'ecb', 'eib', 'fred', 'insee', 'data-gouv', 'ademe', 'inrae',
    'france-strategie', 'shift-project', 'iddri', 'eeas', 'eur-lex', 'ecfr',
    'swp', 'sipri', 'iai', 'nato', 'un', 'undp', 'unctad', 'nist', 'cisa',
    'enisa', 'sgdsn', 'eda', 'who-gho', 'who-direct', 'ema', 'ecdc', 'inserm',
    'cochrane', 'cdc', 'nih', 'cnrs', 'inria', 'ens', 'max-planck', 'eth-zurich',
    'allen-ai', 'legifrance', 'vie-publique', 'archives-fr',
  ];
  const isInstitutional = institutionalProviders.includes(source.provider || '');

  if (isInstitutional) {
    // Institutional reports are authoritative — give them high base weight
    let weight = 0.85;
    if (source.abstract && source.abstract.length > 500) weight += 0.05;
    if (source.year && source.year >= 2020) weight += 0.05;
    return Math.min(weight, 1.0);
  }

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
  // Global consolidated RSS providers publish reports/analyses, not peer-reviewed papers
  const globalProviders = ['global-intelligence', 'global-orgs', 'global-think-tanks', 'global-science'];
  if (globalProviders.includes(source.provider || '')) {
    return false;
  }

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
  crossDomain?: number;   // 0-1, how much this source spans multiple domains
  heterodox?: number;     // 0-1, how much this source challenges consensus
  independent?: number;   // 0-1, whether this source is from independent media
  mode: 'quality' | 'novelty' | 'balanced';
}): number {
  const { quality, novelty, relevance, academic, quantitative, peerReviewed, crossDomain = 0, heterodox = 0, independent = 0, mode } = params;

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
  // NomosX innovation bonuses — reward cross-domain, heterodox, and independent sources
  composite += crossDomain * 0.08;              // +8% bonus for cross-domain sources
  composite += heterodox * 0.06;                // +6% bonus for heterodox/contrarian sources
  composite += independent * 0.04;              // +4% bonus for independent media sources

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
  const topics = (Array.isArray(source.topics) ? source.topics.filter((t: unknown): t is string => typeof t === 'string') : []).join(' ').toLowerCase();
  
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
  
  // Geographic bonus: if query mentions a specific geography and source matches it
  const geoTerms = ['europe', 'european', 'eu', 'france', 'germany', 'nordic', 'norway', 'iberia', 'spain', 'italy', 'poland', 'uk', 'britain', 'china', 'india', 'asia', 'africa', 'middle east'];
  const queryGeo = geoTerms.filter(g => query.toLowerCase().includes(g));
  if (queryGeo.length > 0) {
    const sourceText = (title + ' ' + abstract + ' ' + topics).toLowerCase();
    const matchedGeo = queryGeo.filter(g => sourceText.includes(g));
    if (matchedGeo.length > 0) {
      score += matchedGeo.length * 2.0; // Strong bonus per matched geographic term
    } else {
      // Penalty: query mentions geography but source doesn't match any
      score *= 0.5;
    }
  }
  
  return Math.max(0, score);
}

/**
 * Apply enhanced diversity and quality filters
 */
function applyEnhancedFilters(
  sources: EnhancedRankedSource[], 
  options: EnhancedRankOptions
): EnhancedRankedSource[] {
  let filtered = [...sources].sort((a, b) => b.compositeScore - a.compositeScore);
  
  // Provider diversity filter — ENFORCED (not just warned)
  if (options.maxPerProvider) {
    const providerCounts: Record<string, number> = {};
    filtered = filtered.filter(source => {
      const provider = source.provider || 'unknown';
      providerCounts[provider] = (providerCounts[provider] || 0) + 1;
      return providerCounts[provider] <= options.maxPerProvider!;
    });
    
    // Check provider diversity and ENFORCE if below threshold
    const uniqueProviders = [...new Set(filtered.map(s => s.provider || 'unknown'))];
    if (options.minProviderDiversity && uniqueProviders.length < options.minProviderDiversity) {
      console.warn(`[ENHANCED RANK] Provider diversity warning: ${uniqueProviders.length} < ${options.minProviderDiversity} — enforcing redistribution`);
      // Redistribute: take top sources from each provider round-robin to maximize diversity
      const byProvider: Record<string, EnhancedRankedSource[]> = {};
      for (const s of filtered) {
        const p = s.provider || 'unknown';
        if (!byProvider[p]) byProvider[p] = [];
        byProvider[p].push(s);
      }
      const providers = Object.keys(byProvider).sort((a, b) => byProvider[b].length - byProvider[a].length);
      const redistributed: EnhancedRankedSource[] = [];
      const limit = options.limit || 25;
      let idx = 0;
      while (redistributed.length < limit && providers.some(p => byProvider[p].length > 0)) {
        const provider = providers[idx % providers.length];
        if (byProvider[provider].length > 0) {
          redistributed.push(byProvider[provider].shift()!);
        }
        idx++;
      }
      filtered = redistributed;
      const finalProviders = new Set(filtered.map(s => s.provider || 'unknown'));
      console.log(`[ENHANCED RANK] After redistribution: ${filtered.length} sources from ${finalProviders.size} providers`);
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
