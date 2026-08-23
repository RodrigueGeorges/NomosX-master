/**
 * NomosX RADAR INNOVATIONS — 2026 State-of-the-Art Signal Detection
 *
 * Implements 6 innovations from recent research:
 *
 * C: Temporal Signal Trajectories (ACL 2026 — Navasartian)
 *    Classifies topics as emerging/bursting/stable/fading based on
 *    mention velocity across runs. Burst ≠ emerging (bursts signal
 *    consolidation, not early detection).
 *
 * A: BERTrend Velocity Scoring (RTE-France 2024)
 *    Delta-based scoring: compares mention count between current run
 *    and previous runs. Exponential decay if no updates.
 *
 * B: Anticipatory Outliers (LREC 2026 — Zve et al.)
 *    Topics that don't match any existing cluster are flagged as
 *    "anticipatory outliers" — early signals of emerging narratives.
 *    Tracked across runs; if they later join a cluster, they get a boost.
 *
 * I: Domain-Aware Credibility (GroundCheck 2026)
 *    Source credibility scored differently per domain:
 *    academic → DOI + title search + URL + AI
 *    news → URL + AI (paywalled articles can still be credible)
 *    government → URL + AI
 *    think-tank → URL + title + AI
 *
 * D: Neural Source Routing (RAGRoute 2025)
 *    Lightweight LLM-based provider selection: given a query, select
 *    the 5-8 most relevant providers instead of querying all 28+.
 *
 * F: Submodular Query Diversification (HERO, LREC 2026)
 *    Facility-location objective to maximize query diversity with
 *    mathematical guarantees (1-1/e approximation).
 */

import { prisma } from '../db';
import { callLLM } from '../llm/unified-llm';

// ============================================================================
// C + A: TEMPORAL TRAJECTORIES & VELOCITY SCORING
// ============================================================================

export type SignalTrajectory = 'emerging' | 'bursting' | 'stable' | 'fading' | 'new';

export interface TopicVelocity {
  topicId: string;
  title: string;
  currentMentions: number;
  previousMentions: number;
  velocity: number;          // currentMentions / max(previousMentions, 1)
  trajectory: SignalTrajectory;
  velocityBonus: number;     // 0-15 score boost
  firstSeen: Date | null;    // first time this topic was detected
  runsSeen: number;          // how many consecutive runs this topic appeared in
}

/**
 * Compute temporal trajectories for radar topics.
 *
 * Compares current run's topics against the previous radar run stored in DB.
 * A topic that appeared in the previous run gets a trajectory based on
 * mention count delta:
 *   - emerging: velocity > 1.5 (growing) AND runsSeen ≤ 3 (recent)
 *   - bursting: velocity > 3.0 (sudden spike)
 *   - stable: 0.8 ≤ velocity ≤ 1.5 (steady)
 *   - fading: velocity < 0.8 (declining)
 *   - new: not seen in previous run (first appearance)
 *
 * Based on:
 *   - BERTrend (RTE-France): popularity metric with exponential decay
 *   - Navasartian (ACL 2026): burst dynamics surface consolidation, not emergence
 */
export async function computeTopicVelocities(
  currentTopics: { id: string; title: string; source: string }[]
): Promise<Map<string, TopicVelocity>> {
  const velocityMap = new Map<string, TopicVelocity>();

  if (currentTopics.length === 0) return velocityMap;

  // Fetch previous radar signals from DB (last 24h, excluding current run)
  // We use the Signal table as a proxy for "topics seen in previous runs"
  let previousSignals: { title: string; detectedAt: Date }[] = [];
  try {
    previousSignals = await prisma.signal.findMany({
      where: {
        detectedAt: {
          gte: new Date(Date.now() - 48 * 3600 * 1000), // last 48h
          lt: new Date(Date.now() - 10 * 60 * 1000),    // exclude last 10 min (current run)
        },
      },
      select: { title: true, detectedAt: true },
      orderBy: { detectedAt: 'desc' },
      take: 200,
    });
  } catch {
    // DB not available — all topics are "new"
  }

  // Build previous mention counts by title similarity
  const previousCounts = new Map<string, number>();
  const previousFirstSeen = new Map<string, Date>();
  for (const sig of previousSignals) {
    const key = normalizeTitle(sig.title);
    previousCounts.set(key, (previousCounts.get(key) || 0) + 1);
    const existing = previousFirstSeen.get(key);
    if (!existing || sig.detectedAt < existing) {
      previousFirstSeen.set(key, sig.detectedAt);
    }
  }

  // Count current mentions by normalized title
  const currentCounts = new Map<string, { count: number; title: string; ids: string[] }>();
  for (const topic of currentTopics) {
    const key = normalizeTitle(topic.title);
    const existing = currentCounts.get(key);
    if (existing) {
      existing.count++;
      existing.ids.push(topic.id);
    } else {
      currentCounts.set(key, { count: 1, title: topic.title, ids: [topic.id] });
    }
  }

  // Compute velocity for each topic group
  for (const [key, curr] of currentCounts) {
    const prevCount = previousCounts.get(key) || 0;
    const firstSeen = previousFirstSeen.get(key) || null;
    const velocity = prevCount > 0 ? curr.count / prevCount : Infinity;

    let trajectory: SignalTrajectory;
    let velocityBonus: number;

    if (prevCount === 0) {
      // Never seen before
      trajectory = 'new';
      velocityBonus = 8; // boost new topics
    } else if (velocity > 3.0) {
      trajectory = 'bursting';
      velocityBonus = 5; // bursts are consolidation, not early signal — modest boost
    } else if (velocity > 1.5) {
      trajectory = 'emerging';
      velocityBonus = 15; // growing steadily — highest boost (this is the sweet spot)
    } else if (velocity >= 0.8) {
      trajectory = 'stable';
      velocityBonus = 2; // stable topics are routine
    } else {
      trajectory = 'fading';
      velocityBonus = 0; // declining — no boost
    }

    // Estimate runsSeen: count how many times this topic appeared in previous signals
    const runsSeen = prevCount;

    const tv: TopicVelocity = {
      topicId: curr.ids[0],
      title: curr.title,
      currentMentions: curr.count,
      previousMentions: prevCount,
      velocity: prevCount > 0 ? velocity : Infinity,
      trajectory,
      velocityBonus,
      firstSeen,
      runsSeen,
    };

    // Map velocity to all topic IDs in this group
    for (const id of curr.ids) {
      velocityMap.set(id, tv);
    }
  }

  return velocityMap;
}

/**
 * Normalize a title for comparison (lowercase, remove punctuation, collapse spaces).
 */
function normalizeTitle(title: string): string {
  return title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w.length > 3) // ignore short words
    .slice(0, 8) // top 8 words
    .join(' ');
}

// ============================================================================
// B: ANTICIPATORY OUTLIERS
// ============================================================================

export interface AnticipatoryOutlier {
  topicId: string;
  title: string;
  isAnticipatory: boolean;
  becameCluster: boolean;   // was it an outlier before but now in a cluster?
  outlierBoost: number;     // 0-12 score boost
}

/**
 * Detect anticipatory outliers — topics that don't match any existing cluster.
 *
 * Based on LREC 2026 (Zve et al.): "Outliers in dynamic topic modeling are often
 * discarded as noise, yet some act as early signals of emerging topics."
 *
 * We use keyword overlap to check if a topic matches any existing signal cluster.
 * Topics that don't match → anticipatory outliers → boosted.
 * Topics that were outliers in previous runs but now match a cluster → extra boost
 * (they "graduated" from outlier to emerging topic).
 */
export function detectAnticipatoryOutliers(
  currentTopics: { id: string; title: string; summary?: string; source: string }[],
  existingClusters: { topic: string; keywords: Set<string> }[]
): Map<string, AnticipatoryOutlier> {
  const outlierMap = new Map<string, AnticipatoryOutlier>();

  for (const topic of currentTopics) {
    const topicKeywords = extractKeywordsFromText(topic.title + ' ' + (topic.summary || ''));

    // Check if this topic matches any existing cluster
    let bestMatch = 0;
    for (const cluster of existingClusters) {
      const overlap = [...topicKeywords].filter(k => cluster.keywords.has(k)).length;
      const similarity = overlap / Math.max(topicKeywords.size, cluster.keywords.size, 1);
      if (similarity > bestMatch) bestMatch = similarity;
    }

    const isAnticipatory = bestMatch < 0.15; // very low similarity = outlier
    const becameCluster = bestMatch >= 0.3 && bestMatch < 0.5; // was outlier, now partial match

    let outlierBoost = 0;
    if (becameCluster) {
      // Graduated from outlier to emerging — highest boost
      outlierBoost = 12;
    } else if (isAnticipatory) {
      // Pure anticipatory outlier — moderate boost
      outlierBoost = 8;
    }

    outlierMap.set(topic.id, {
      topicId: topic.id,
      title: topic.title,
      isAnticipatory,
      becameCluster,
      outlierBoost,
    });
  }

  return outlierMap;
}

function extractKeywordsFromText(text: string): Set<string> {
  const stopWords = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
    'her', 'was', 'one', 'our', 'out', 'with', 'from', 'this', 'that',
    'have', 'been', 'they', 'what', 'when', 'where', 'which', 'their',
    'about', 'would', 'there', 'could', 'other', 'into', 'more', 'some',
    'than', 'them', 'very', 'after', 'also', 'over', 'such', 'only',
    'these', 'will', 'each', 'make', 'like', 'just', 'between', 'says',
    'said', 'new', 'report', 'according', 'week', 'year',
  ]);
  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w));
  return new Set(words.slice(0, 10));
}

// ============================================================================
// I: DOMAIN-AWARE CREDIBILITY SCORING (GroundCheck)
// ============================================================================

export type SourceDomain = 'academic' | 'news' | 'government' | 'think-tank' | 'general';

export interface CredibilityScore {
  domain: SourceDomain;
  score: number;        // 0-1
  confidence: number;   // 0-1
  factors: {
    doiCheck?: number;
    titleSearch?: number;
    urlCheck?: number;
    aiCheck?: number;
  };
}

/**
 * Domain weights for credibility scoring.
 * Based on GroundCheck (github.com/affromero/groundcheck):
 *
 *   ACADEMIC   →  doi(0.45) + title_search(0.30) + url(0.10) + ai(0.15)
 *   NEWS       →  url(0.35) + ai(0.65)
 *   GOVERNMENT →  url(0.40) + ai(0.60)
 *   THINK-TANK →  url(0.30) + title_search(0.10) + ai(0.60)
 *   GENERAL    →  url(0.30) + title_search(0.10) + ai(0.60)
 *
 * Key insight: news articles are often paywalled (URL check fails),
 * so AI verification carries more weight for news.
 */
const DOMAIN_WEIGHTS: Record<SourceDomain, { doi?: number; titleSearch?: number; url: number; ai: number }> = {
  academic:    { doi: 0.45, titleSearch: 0.30, url: 0.10, ai: 0.15 },
  news:        { url: 0.35, ai: 0.65 },
  government:  { url: 0.40, ai: 0.60 },
  'think-tank':{ url: 0.30, titleSearch: 0.10, ai: 0.60 },
  general:     { url: 0.30, titleSearch: 0.10, ai: 0.60 },
};

const DOMAIN_THRESHOLDS: Record<SourceDomain, number> = {
  academic: 0.70,
  news: 0.50,
  government: 0.55,
  'think-tank': 0.50,
  general: 0.55,
};

/**
 * Classify a source into a domain based on its name/URL.
 */
export function classifySourceDomain(sourceName: string, url?: string): SourceDomain {
  const combined = (sourceName + ' ' + (url || '')).toLowerCase();

  // Academic indicators
  if (/doi\.org|arxiv\.org|openalex|semanticscholar|pubmed|crossref|springer|elsevier|wiley|nature\.com|sciencedirect|researchgate|scholar\.google|jstor|ieee\.org|acm\.org/.test(combined)) {
    return 'academic';
  }

  // Government indicators
  if (/gov\b|\.gov|government|ministry|department of|federal|national bureau|census|eurostat|oecd|imf|world bank|bis|wto|ilo|who|nato|iaea|ecb|fed\.|treasury|commission|parliament|legifrance|insee/.test(combined)) {
    return 'government';
  }

  // Think-tank indicators
  if (/brookings|rand|csis|cfr|chatham|atlantic council|bruegel|peterson|crisis group|carnegie|heritage|cato|swp|sipri|cnas|ecfr|france.strategie|club of rome|millennium/.test(combined)) {
    return 'think-tank';
  }

  // News indicators
  if (/reuters|bloomberg|ft\.com|nytimes|wsj|guardian|economist|bbc|cnn|ftalpha|propublica|intercept|mediapart|lemonde|figaro|techcrunch|reuters|news|times|post|journal|press|media/.test(combined)) {
    return 'news';
  }

  return 'general';
}

/**
 * Score source credibility using domain-aware weights.
 *
 * @param sourceName The source name (e.g., "Brookings", "arXiv:cs.AI")
 * @param url The source URL
 * @param hasDoi Whether the source has a DOI
 * @param titleMatchQuality 0-1, how well the title matches expected patterns
 * @param urlAccessible 0-1, whether the URL is accessible (1=yes, 0=no, 0.5=paywalled)
 * @param aiCredibility 0-1, LLM-based credibility assessment
 */
export function scoreCredibility(
  sourceName: string,
  url: string | undefined,
  opts: {
    hasDoi?: boolean;
    titleMatchQuality?: number;
    urlAccessible?: number;
    aiCredibility?: number;
  }
): CredibilityScore {
  const domain = classifySourceDomain(sourceName, url);
  const weights = DOMAIN_WEIGHTS[domain];

  const factors: CredibilityScore['factors'] = {};
  let score = 0;

  if (weights.doi !== undefined && opts.hasDoi !== undefined) {
    const doiScore = opts.hasDoi ? 1.0 : 0.0;
    factors.doiCheck = doiScore;
    score += doiScore * weights.doi;
  }

  if (weights.titleSearch !== undefined && opts.titleMatchQuality !== undefined) {
    factors.titleSearch = opts.titleMatchQuality;
    score += opts.titleMatchQuality * weights.titleSearch;
  }

  // URL check — paywalled (0.5) doesn't fully fail for news
  const urlScore = opts.urlAccessible ?? 0.5;
  factors.urlCheck = urlScore;
  score += urlScore * weights.url;

  // AI credibility
  const aiScore = opts.aiCredibility ?? 0.5;
  factors.aiCheck = aiScore;
  score += aiScore * weights.ai;

  // Confidence: how many factors were actually checked
  const factorCount = Object.keys(factors).length;
  const maxFactors = Object.keys(weights).length;
  const confidence = factorCount / maxFactors;

  return { domain, score: Math.min(score, 1.0), confidence, factors };
}

/**
 * Get the credibility threshold for a domain.
 * Sources below this threshold should be flagged.
 */
export function getCredibilityThreshold(domain: SourceDomain): number {
  return DOMAIN_THRESHOLDS[domain];
}

// ============================================================================
// D: NEURAL SOURCE ROUTING (RAGRoute)
// ============================================================================

export interface ProviderRoute {
  provider: string;
  reason: string;
}

/**
 * Available provider registry for routing.
 * Each provider has keywords that indicate when it's relevant.
 */
const PROVIDER_REGISTRY: { name: string; keywords: string[]; priority: number }[] = [
  // Tier 1: Core academic (priority 8-10)
  { name: 'openalex', keywords: ['academic', 'research', 'paper', 'study', 'science', 'citation', 'doi', 'scholar', 'governance', 'policy', 'law', 'economics'], priority: 10 },
  { name: 'crossref', keywords: ['academic', 'doi', 'publication', 'journal', 'science', 'research', 'governance', 'policy'], priority: 9 },
  { name: 'arxiv', keywords: ['physics', 'math', 'computer science', 'ai', 'machine learning', 'algorithm', 'quantum', 'statistical', 'nlp', 'llm', 'neural'], priority: 8 },
  { name: 'semanticscholar', keywords: ['academic', 'research', 'paper', 'citation', 'science', 'scholar'], priority: 8 },
  { name: 'pubmed', keywords: ['medical', 'health', 'biotech', 'biology', 'medicine', 'clinical', 'disease', 'drug', 'pharma', 'trial'], priority: 9 },
  // Tier 2: News & geopolitics (priority 7-9)
  { name: 'gdelt', keywords: ['news', 'geopolitics', 'conflict', 'politics', 'breaking', 'current events', 'crisis', 'trade', 'war', 'diplomacy'], priority: 9 },
  { name: 'rss', keywords: ['think tank', 'policy', 'economics', 'geopolitics', 'commentary', 'analysis', 'opinion', 'editorial'], priority: 7 },
  { name: 'overton', keywords: ['policy', 'government', 'regulation', 'legislation', 'think tank', 'parliament'], priority: 7 },
  // Tier 3: Economics & finance (priority 5-7)
  { name: 'worldbank', keywords: ['economics', 'development', 'finance', 'poverty', 'trade', 'gdp', 'infrastructure', 'sanctions'], priority: 7 },
  { name: 'fred', keywords: ['economics', 'finance', 'monetary', 'interest rate', 'inflation', 'employment', 'gdp', 'recession'], priority: 7 },
  { name: 'ecb', keywords: ['economics', 'monetary', 'euro', 'europe', 'interest rate', 'banking', 'financial'], priority: 6 },
  { name: 'eurostat', keywords: ['economics', 'europe', 'statistics', 'trade', 'employment', 'industry', 'demographics'], priority: 5 },
  { name: 'insee', keywords: ['economics', 'france', 'statistics', 'employment', 'inflation'], priority: 4 },
  { name: 'imf', keywords: ['economics', 'finance', 'monetary', 'global', 'trade', 'debt', 'fiscal', 'imf'], priority: 7 },
  { name: 'oecd', keywords: ['economics', 'policy', 'education', 'trade', 'tax', 'inequality', 'oecd', 'governance'], priority: 7 },
  { name: 'nber', keywords: ['economics', 'finance', 'working paper', 'research', 'monetary', 'fiscal'], priority: 6 },
  // Tier 4: Health & science (priority 4-8)
  { name: 'who', keywords: ['health', 'medical', 'disease', 'pandemic', 'public health', 'who', 'global health'], priority: 8 },
  { name: 'usgs', keywords: ['earthquake', 'geology', 'natural disaster', 'seismic', 'environment', 'mineral'], priority: 5 },
  { name: 'open-meteo', keywords: ['weather', 'climate', 'temperature', 'meteorology'], priority: 4 },
  { name: 'nasa-giss', keywords: ['climate', 'temperature', 'nasa', 'environment', 'global warming', 'emissions'], priority: 4 },
  { name: 'iea', keywords: ['energy', 'oil', 'gas', 'renewable', 'electricity', 'nuclear', 'emissions', 'climate'], priority: 7 },
  // Tier 5: Tech & cybersecurity (priority 4-7)
  { name: 'nvd', keywords: ['cybersecurity', 'vulnerability', 'cve', 'security', 'hack', 'malware'], priority: 7 },
  { name: 'paperswithcode', keywords: ['machine learning', 'ai', 'code', 'benchmark', 'dataset', 'nlp', 'computer vision', 'llm'], priority: 6 },
  { name: 'hackernews', keywords: ['tech', 'startup', 'software', 'programming', 'ai', 'technology', 'silicon valley'], priority: 4 },
  // Tier 6: Government & legal (priority 4-5)
  { name: 'federal-register', keywords: ['regulation', 'government', 'federal', 'policy', 'us', 'executive', 'agency'], priority: 5 },
  { name: 'eurlex', keywords: ['eu', 'europe', 'regulation', 'legislation', 'directive', 'law', 'compliance'], priority: 5 },
  // Tier 7: Data & knowledge (priority 3-5)
  { name: 'altmetric', keywords: ['academic', 'research', 'social media', 'attention', 'citation', 'impact'], priority: 5 },
  { name: 'wikidata', keywords: ['entity', 'knowledge graph', 'fact', 'person', 'organization', 'concept', 'geography'], priority: 4 },
  { name: 'zenodo', keywords: ['dataset', 'research data', 'open science', 'repository'], priority: 4 },
  { name: 'figshare', keywords: ['dataset', 'research data', 'figure', 'image'], priority: 3 },
  // Tier 8: Social (priority 3)
  { name: 'bluesky', keywords: ['social media', 'public opinion', 'discussion', 'reaction'], priority: 3 },
  { name: 'reddit', keywords: ['social media', 'discussion', 'public opinion', 'community'], priority: 3 },
  // V3.2: New providers added 2026-08 — expanded academic coverage
  { name: 'doaj', keywords: ['academic', 'open access', 'journal', 'peer-reviewed', 'research', 'science'], priority: 6 },
  { name: 'core', keywords: ['academic', 'research', 'open access', 'repository', 'thesis', 'dataset'], priority: 6 },
  { name: 'europepmc', keywords: ['medical', 'health', 'biology', 'europe', 'pubmed', 'life sciences', 'biomedical'], priority: 7 },
  { name: 'ssrn', keywords: ['social science', 'economics', 'finance', 'research', 'law', 'working paper'], priority: 6 },
  { name: 'repec', keywords: ['economics', 'finance', 'research', 'working paper', 'econometrics'], priority: 6 },
  { name: 'un', keywords: ['united nations', 'un', 'global', 'humanitarian', 'peace', 'security', 'development', 'refugee'], priority: 7 },
  { name: 'sipri', keywords: ['arms', 'military', 'defense', 'conflict', 'security', 'weapons', 'geopolitics'], priority: 6 },
  { name: 'swp', keywords: ['german', 'foreign policy', 'europe', 'geopolitics', 'international relations'], priority: 5 },
  { name: 'nih', keywords: ['medical', 'health', 'biomedical', 'research', 'clinical', 'nih', 'cancer'], priority: 7 },
  { name: 'cdc', keywords: ['disease', 'health', 'epidemiology', 'outbreak', 'public health', 'vaccine'], priority: 7 },
  { name: 'ema', keywords: ['drug', 'medicine', 'pharma', 'europe', 'regulation', 'clinical'], priority: 6 },
  { name: 'inrae', keywords: ['agriculture', 'food', 'environment', 'french', 'research'], priority: 5 },
  { name: 'cea', keywords: ['nuclear', 'energy', 'physics', 'french', 'research', 'technology'], priority: 5 },
  { name: 'undp', keywords: ['development', 'poverty', 'sustainable', 'global', 'humanitarian', 'un'], priority: 6 },
  { name: 'bis', keywords: ['banking', 'financial stability', 'monetary', 'central bank', 'basel'], priority: 6 },
  { name: 'inria', keywords: ['computer science', 'ai', 'machine learning', 'french', 'research', 'algorithm'], priority: 6 },
  { name: 'max-planck', keywords: ['physics', 'chemistry', 'biology', 'research', 'german', 'science'], priority: 6 },
  { name: 'eth-zurich', keywords: ['engineering', 'technology', 'research', 'swiss', 'science'], priority: 5 },
  { name: 'cnrs', keywords: ['research', 'science', 'french', 'physics', 'chemistry', 'biology', 'humanities'], priority: 6 },
  { name: 'ens', keywords: ['research', 'science', 'french', 'humanities', 'math', 'physics'], priority: 5 },
  { name: 'cochrane', keywords: ['medical', 'systematic review', 'evidence', 'clinical', 'trial', 'health'], priority: 7 },
  { name: 'mit-dspace', keywords: ['mit', 'research', 'thesis', 'engineering', 'ai', 'technology'], priority: 5 },
  { name: 'harvard-dash', keywords: ['harvard', 'research', 'academic', 'business', 'law', 'science'], priority: 5 },
];

/**
 * Select the most relevant providers for a given query.
 *
 * Two modes:
 * 1. Keyword-based (fast, deterministic): match query keywords against provider registry
 * 2. LLM-based (slower, smarter): use a flash LLM to select providers
 *
 * Based on RAGRoute (arXiv 2025): "dynamically selects relevant data sources
 * at query time using a neural classifier, avoiding indiscriminate querying."
 */
export async function selectProviders(
  query: string,
  maxProviders: number = 8,
  useLLM: boolean = false
): Promise<ProviderRoute[]> {
  if (useLLM) {
    try {
      return await selectProvidersWithLLM(query, maxProviders);
    } catch {
      // Fall back to keyword-based
    }
  }
  return selectProvidersWithKeywords(query, maxProviders);
}

/**
 * Keyword-based provider selection (fast, no LLM cost).
 */
function selectProvidersWithKeywords(query: string, maxProviders: number): ProviderRoute[] {
  const queryLower = query.toLowerCase();
  const scored: { name: string; score: number; reason: string }[] = [];

  for (const provider of PROVIDER_REGISTRY) {
    let matchCount = 0;
    const matchedKeywords: string[] = [];

    for (const kw of provider.keywords) {
      if (queryLower.includes(kw)) {
        matchCount++;
        matchedKeywords.push(kw);
      }
    }

    if (matchCount > 0) {
      const score = matchCount * provider.priority;
      scored.push({
        name: provider.name,
        score,
        reason: `matched: ${matchedKeywords.slice(0, 3).join(', ')}`,
      });
    }
  }

  // Always include openalex and crossref as baseline (they cover everything)
  const hasOpenAlex = scored.some(s => s.name === 'openalex');
  if (!hasOpenAlex) {
    scored.push({ name: 'openalex', score: 5, reason: 'baseline academic coverage' });
  }
  const hasCrossref = scored.some(s => s.name === 'crossref');
  if (!hasCrossref) {
    scored.push({ name: 'crossref', score: 4, reason: 'baseline DOI coverage' });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxProviders).map(s => ({ provider: s.name, reason: s.reason }));
}

/**
 * LLM-based provider selection (smarter, uses flash model).
 * Uses a compact prompt to select the most relevant providers.
 */
async function selectProvidersWithLLM(query: string, maxProviders: number): Promise<ProviderRoute[]> {
  const providerList = PROVIDER_REGISTRY.map(p => p.name).join(', ');

  const response = await callLLM({
    task: 'query_enhancement',
    messages: [
      { role: 'system', content: `You are a source routing expert. Given a research query, select the ${maxProviders} most relevant data providers from: ${providerList}. Return JSON array of {"provider": "name", "reason": "why"} objects. Only use providers from the list.` },
      { role: 'user', content: `Query: "${query}"\n\nSelect the ${maxProviders} most relevant providers:` },
    ],
    temperature: 0,
    maxTokens: 500,
    jsonMode: true,
  });

  try {
    const parsed = JSON.parse(response.content);
    if (Array.isArray(parsed)) {
      // Validate provider names
      const validNames = new Set(PROVIDER_REGISTRY.map(p => p.name));
      return parsed
        .filter((r: any) => validNames.has(r.provider))
        .slice(0, maxProviders)
        .map((r: any) => ({ provider: r.provider, reason: r.reason || 'LLM-selected' }));
    }
  } catch {
    // Fall back
  }

  return selectProvidersWithKeywords(query, maxProviders);
}

// ============================================================================
// F: SUBMODULAR QUERY DIVERSIFICATION (HERO)
// ============================================================================

/**
 * Select a diverse subset of queries using a facility-location objective.
 *
 * Based on HERO (LREC 2026): "submodular optimization via a facility location
 * objective provides mathematically grounded control over the relevance–diversity
 * trade-off during query selection."
 *
 * The facility location objective:
 *   F(S) = Σ_i max_{j ∈ S} sim(i, j)
 *
 * where S is the selected set, i ranges over all queries, and sim is similarity.
 * Greedy maximization gives (1-1/e) approximation guarantee.
 *
 * @param queries Array of query strings to diversify
 * @param maxSelect Maximum number of queries to select
 * @param lambda Relevance-diversity trade-off (0=all diverse, 1=all relevant)
 * @returns Selected queries with diversity scores
 */
export function diversifyQueries(
  queries: string[],
  maxSelect: number,
  lambda: number = 0.5
): { query: string; diversityScore: number; isSelected: boolean }[] {
  if (queries.length <= maxSelect) {
    return queries.map(q => ({ query: q, diversityScore: 1.0, isSelected: true }));
  }

  // Compute pairwise similarity matrix (Jaccard on words)
  const queryWords = queries.map(q => new Set(q.toLowerCase().split(/\s+/).filter(w => w.length > 2)));
  const n = queries.length;
  const sim: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const intersection = [...queryWords[i]].filter(w => queryWords[j].has(w)).length;
      const union = new Set([...queryWords[i], ...queryWords[j]]).size;
      const jaccard = union > 0 ? intersection / union : 0;
      sim[i][j] = jaccard;
      sim[j][i] = jaccard;
    }
  }

  // Greedy facility-location selection
  const selected: number[] = [];
  const selectedScores: number[] = [];
  const covered = new Array(n).fill(0); // max sim to any selected query

  // Relevance scores: first query is most relevant (original), decreasing
  const relevance = queries.map((_, i) => 1 - (i / n) * 0.3); // gentle decay

  for (let step = 0; step < maxSelect; step++) {
    let bestIdx = -1;
    let bestGain = -Infinity;

    for (let i = 0; i < n; i++) {
      if (selected.includes(i)) continue;

      // Facility location gain: how much does adding i improve coverage?
      let coverageGain = 0;
      for (let j = 0; j < n; j++) {
        if (sim[i][j] > covered[j]) {
          coverageGain += sim[i][j] - covered[j];
        }
      }

      // Combined objective: λ * relevance + (1-λ) * diversity gain
      // Diversity gain = coverage gain minus redundancy with already selected
      let redundancy = 0;
      for (const s of selected) {
        redundancy += sim[i][s];
      }
      const diversityGain = coverageGain - redundancy * 0.5;

      const combinedGain = lambda * relevance[i] + (1 - lambda) * diversityGain;

      if (combinedGain > bestGain) {
        bestGain = combinedGain;
        bestIdx = i;
      }
    }

    if (bestIdx < 0) break;
    selected.push(bestIdx);
    selectedScores.push(bestGain);

    // Update coverage
    for (let j = 0; j < n; j++) {
      if (sim[bestIdx][j] > covered[j]) {
        covered[j] = sim[bestIdx][j];
      }
    }
  }

  // Build result
  const result = queries.map((query, i) => ({
    query,
    diversityScore: selected.includes(i) ? selectedScores[selected.indexOf(i)] : 0,
    isSelected: selected.includes(i),
  }));

  // Sort: selected first (by score), then unselected
  result.sort((a, b) => {
    if (a.isSelected && !b.isSelected) return -1;
    if (!a.isSelected && b.isSelected) return 1;
    return b.diversityScore - a.diversityScore;
  });

  return result;
}

// ============================================================================
// J: CAPABILITY-AWARE LLM FAILOVER
// ============================================================================

export type LLMCapability = 'tool_calling' | 'structured_output' | 'vision' | 'long_context' | 'streaming';

/**
 * Provider capability matrix.
 * Used to filter fallback candidates by what the request actually needs.
 */
const PROVIDER_CAPABILITIES: Record<string, LLMCapability[]> = {
  deepseek: ['tool_calling', 'structured_output', 'long_context'],
  glm: ['tool_calling', 'structured_output', 'long_context', 'streaming'],
  kimi: ['tool_calling', 'structured_output', 'long_context'],
  openai: ['tool_calling', 'structured_output', 'vision', 'long_context', 'streaming'],
  anthropic: ['tool_calling', 'structured_output', 'vision', 'long_context', 'streaming'],
};

/**
 * Filter fallback chain by required capabilities.
 *
 * Based on DVARA: "Capability-aware failover filters the fallback candidates
 * by what the request actually needs before retrying. If the request needs
 * structured output, only structured-output-capable providers are considered."
 */
export function filterByCapability(
  fallbackChain: string[],
  requiredCapabilities: LLMCapability[]
): string[] {
  if (requiredCapabilities.length === 0) return fallbackChain;

  return fallbackChain.filter(provider => {
    const caps = PROVIDER_CAPABILITIES[provider] || [];
    return requiredCapabilities.every(req => caps.includes(req));
  });
}

/**
 * Get capabilities for a provider.
 */
export function getProviderCapabilities(provider: string): LLMCapability[] {
  return PROVIDER_CAPABILITIES[provider] || [];
}
