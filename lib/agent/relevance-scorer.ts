/**
 * RELEVANCE SCORER
 * 
 * Scores how relevant a source is to a given query.
 * 
 * Scoring factors:
 * 1. Topic overlap (keywords in title/abstract)
 * 2. Field matching (academic domains)
 * 3. Temporal relevance (if query mentions time period)
 * 4. Citation context (highly cited = more authoritative on topic)
 * 
 * Score: 0.0 - 1.0
 * - 0.8+ : Highly relevant, core to query
 * - 0.6-0.8 : Relevant, useful context
 * - 0.4-0.6 : Somewhat relevant, peripheral
 * - 0.0-0.4 : Not relevant, likely off-topic
 */

import type {EnhancedQuery} from './query-enhancer';

export interface RelevanceScore {
  overall: number; // 0.0 - 1.0
  topicOverlap: number;
  fieldMatch: number;
  temporalRelevance: number;
  semanticSimilarity: number;
  explanation: string;
}

export interface SourceForScoring {
  id: string;
  title: string;
  provider: string;
  type: string;
  abstract?: string | null;
  topics?: string[];
  year?: number | null;
  citationCount?: number | null;
  oaStatus?: string | null;
  doi?: string | null;
  url?: string | null;
  pdfUrl?: string | null;
  jelCodes?: string[];
  authors?: Array<any>;
  institutions?: Array<any>;
  raw?: any;
}

/**
 * Group query keywords into concept clusters for multi-concept coverage enforcement.
 * This prevents sources that match only one concept (e.g., "governance" alone)
 * from getting high relevance scores when the query spans multiple concepts
 * (e.g., "religion" + "AI" + "governance").
 *
 * Clustering is heuristic: keywords that share a common word are grouped together.
 * For "religious institutions shape global governance frameworks for artificial intelligence":
 *   Cluster A: ["religious", "institutions", "religious institutions"]
 *   Cluster B: ["artificial intelligence", "ai"]
 *   Cluster C: ["governance", "frameworks", "global governance"]
 */
function clusterKeywords(keywords: string[]): string[][] {
  if (keywords.length <= 2) return [keywords];

  const lower = keywords.map(k => k.toLowerCase());
  const clusters: string[][] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < lower.length; i++) {
    if (assigned.has(i)) continue;
    const cluster = [keywords[i]];
    assigned.add(i);
    const words_i = new Set(lower[i].split(/\s+/).filter(w => w.length > 2));

    for (let j = i + 1; j < lower.length; j++) {
      if (assigned.has(j)) continue;
      const words_j = new Set(lower[j].split(/\s+/).filter(w => w.length > 2));
      // Group if they share any word > 2 chars
      const shared = [...words_i].some(w => words_j.has(w));
      if (shared) {
        cluster.push(keywords[j]);
        assigned.add(j);
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

/**
 * Compute multi-concept coverage: how many distinct concept clusters
 * are represented in the source text. Returns 0.0 to 1.0.
 * A source matching only 1 of 3 clusters gets heavily penalized.
 */
function multiConceptCoverage(
  sourceText: string,
  clusters: string[][]
): { coverage: number; matchedClusters: number; totalClusters: number } {
  const totalClusters = clusters.length;
  if (totalClusters <= 1) return { coverage: 1.0, matchedClusters: 1, totalClusters };

  const lowerText = sourceText.toLowerCase();
  let matchedClusters = 0;

  for (const cluster of clusters) {
    const matched = cluster.some(kw => lowerText.includes(kw.toLowerCase()));
    if (matched) matchedClusters++;
  }

  // Coverage ratio with penalty for single-cluster matches
  const ratio = matchedClusters / totalClusters;
  // If only 1 of 3+ clusters matched, apply severe penalty
  if (matchedClusters === 1 && totalClusters >= 3) {
    return { coverage: ratio * 0.3, matchedClusters, totalClusters };
  }
  if (matchedClusters === 1 && totalClusters === 2) {
    return { coverage: ratio * 0.5, matchedClusters, totalClusters };
  }
  return { coverage: ratio, matchedClusters, totalClusters };
}

/**
 * Compute relevance score for a source given an enhanced query
 */
export function scoreRelevance(
  source: SourceForScoring,
  enhancedQuery: EnhancedQuery
): RelevanceScore {
  const title = (source.title || "").toLowerCase();
  const abstract = (source.abstract || "").toLowerCase();
  const fullText = `${title} ${abstract}`;
  const sourceTopics = (source.topics || []).map(t => t.toLowerCase());

  // 1. Topic Overlap (40% weight)
  // Count how many query keywords appear in title/abstract
  const queryKeywords = enhancedQuery.keywords.map(k => k.toLowerCase());
  const keywordsInTitle = queryKeywords.filter(kw => title.includes(kw)).length;
  const keywordsInAbstract = abstract ? queryKeywords.filter(kw => abstract.includes(kw)).length : 0;
  
  // If no abstract, rely more on title
  const titleWeight = abstract ? 0.6 : 1.0;
  const abstractWeight = abstract ? 0.4 : 0.0;
  
  const topicOverlap = Math.min(1.0, (keywordsInTitle * titleWeight + keywordsInAbstract * abstractWeight) / Math.max(1, queryKeywords.length));

  // 1b. Multi-Concept Coverage (NEW — critical for filtering off-topic sources)
  // Group keywords into concept clusters and require multi-concept match
  const clusters = clusterKeywords(enhancedQuery.keywords);
  const mcc = multiConceptCoverage(fullText, clusters);
  // Apply as a multiplier: if source only matches 1 of 3 concepts, score drops 70%
  const conceptMultiplier = mcc.coverage;

  // 2. Field Match (30% weight)
  // Check if source topics overlap with query topics
  const queryTopics = enhancedQuery.topics.map(t => t.toLowerCase());
  const matchingTopics = sourceTopics.filter(st => 
    queryTopics.some(qt => st.includes(qt) || qt.includes(st))
  ).length;
  
  // If no topics on source, give neutral score instead of 0
  const fieldMatch = sourceTopics.length === 0 
    ? 0.5  // Neutral score if no topics available
    : Math.min(1.0, matchingTopics / Math.max(1, queryTopics.length));

  // 3. Temporal Relevance (10% weight)
  // If query mentions future/recent/past, check year alignment
  const queryText = enhancedQuery.original.toLowerCase();
  let temporalRelevance = 0.5; // Neutral by default
  
  if (source.year) {
    const currentYear = new Date().getFullYear();
    const age = currentYear - source.year;
    
    if (queryText.includes("future") || queryText.includes("next") || queryText.includes("prochaines")) {
      // Recent papers more relevant for future-oriented queries
      temporalRelevance = age <= 5 ? 1.0 : age <= 10 ? 0.7 : 0.4;
    } else if (queryText.includes("recent") || queryText.includes("récent") || queryText.includes("latest")) {
      temporalRelevance = age <= 3 ? 1.0 : age <= 7 ? 0.6 : 0.3;
    } else if (queryText.includes("historical") || queryText.includes("histoire") || queryText.includes("past")) {
      temporalRelevance = age >= 10 ? 1.0 : age >= 5 ? 0.7 : 0.5;
    } else {
      // General: prefer recent but not too strict
      temporalRelevance = age <= 5 ? 0.9 : age <= 10 ? 0.7 : age <= 20 ? 0.5 : 0.3;
    }
  }

  // 4. Semantic Similarity (10% weight — n-gram Jaccard scores very low for most papers)
  // N-gram overlap between enhanced query and title+abstract
  const semanticSimilarity = computeNGramSimilarity(
    enhancedQuery.enhanced,
    `${title} ${abstract}`
  );

  // 5. Title keyword bonus: if ANY query keyword appears in title, significant boost
  const titleKeywordBonus = keywordsInTitle > 0 ? 0.3 : 0.0;

  // Weighted overall score
  // Topic overlap is king — if keywords match, the source is relevant.
  // N-gram similarity is a weak signal (Jaccard on bigrams gives ~3-5% for most papers)
  // Multi-concept coverage acts as a multiplier: a source matching only 1 of 3
  // query concepts (e.g., "governance" but not "religion" or "AI") gets heavily penalized.
  const baseScore = Math.min(1.0,
    topicOverlap * 0.45 +
    fieldMatch * 0.20 +
    semanticSimilarity * 0.10 +
    temporalRelevance * 0.10 +
    titleKeywordBonus * 0.15
  );

  // Apply multi-concept multiplier — this is the key fix for source pollution.
  // A source about "governance institutions" that doesn't mention religion OR AI
  // will have conceptMultiplier ~0.3, dropping its score from ~0.5 to ~0.15.
  const overall = baseScore * conceptMultiplier;

  // Explanation for debugging
  const explanation = `Topic: ${(topicOverlap * 100).toFixed(0)}% | Field: ${(fieldMatch * 100).toFixed(0)}% | Semantic: ${(semanticSimilarity * 100).toFixed(0)}% | Temporal: ${(temporalRelevance * 100).toFixed(0)}% | TitleBonus: ${(titleKeywordBonus * 100).toFixed(0)}% | Concepts: ${mcc.matchedClusters}/${mcc.totalClusters} (x${conceptMultiplier.toFixed(2)})`;

  return {
    overall: Math.min(1.0, overall),
    topicOverlap,
    fieldMatch,
    temporalRelevance,
    semanticSimilarity,
    explanation,
  };
}

/**
 * Compute n-gram similarity (bigrams and trigrams)
 * Simple deterministic text similarity without embeddings
 */
function computeNGramSimilarity(query: string, text: string): number {
  const qNgrams = extractNGrams(query, 2).concat(extractNGrams(query, 3));
  const tNgrams = extractNGrams(text, 2).concat(extractNGrams(text, 3));
  
  if (qNgrams.length === 0 || tNgrams.length === 0) return 0;
  
  const tNgramSet = new Set(tNgrams);
  const intersection = qNgrams.filter(ng => tNgramSet.has(ng)).length;
  
  // Use Dice coefficient instead of Jaccard — less punishing for different-length texts
  // Dice = 2*|intersection| / (|A| + |B|) vs Jaccard = |intersection| / |union|
  return (2 * intersection) / (qNgrams.length + tNgrams.length);
}

/**
 * Extract n-grams from text
 */
function extractNGrams(text: string, n: number): string[] {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const ngrams: string[] = [];
  
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.push(words.slice(i, i + n).join(" "));
  }
  
  return ngrams;
}

/**
 * Filter sources by minimum relevance threshold
 */
export function filterByRelevance(
  sources: Array<SourceForScoring & { id: string }>,
  enhancedQuery: EnhancedQuery,
  minRelevance = 0.4
): Array<{ source: SourceForScoring & { id: string }; score: RelevanceScore }> {
  const scored = sources.map(source => ({
    source,
    score: scoreRelevance(source, enhancedQuery),
  }));

  return scored
    .filter(item => item.score.overall >= minRelevance)
    .sort((a, b) => b.score.overall - a.score.overall);
}

/**
 * Log relevance scores for debugging
 */
export function logRelevanceScores(
  sources: Array<{ source: SourceForScoring; score: RelevanceScore }>,
  limit = 10
): void {
  console.log(`\n[RelevanceScorer] Top ${limit} sources by relevance:`);
  
  sources.slice(0, limit).forEach((item, idx) => {
    console.log(`${idx + 1}. [${(item.score.overall * 100).toFixed(0)}%] ${item.source.title.slice(0, 80)}`);
    console.log(`   ${item.score.explanation}`);
  });
  
  const belowThreshold = sources.filter(s => s.score.overall < 0.4).length;
  if (belowThreshold > 0) {
    console.log(`\n⚠️  ${belowThreshold} sources below 40% relevance (filtered out)`);
  }
}
