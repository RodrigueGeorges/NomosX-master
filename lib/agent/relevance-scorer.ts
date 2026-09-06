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
  // If only 1 of 3+ clusters matched, apply moderate penalty
  // (was 0.3 — too severe, crushed 97% of sources to near-zero,
  //  making the relevance filter useless and skipping TS-SetRank)
  if (matchedClusters === 1 && totalClusters >= 3) {
    return { coverage: ratio * 0.6, matchedClusters, totalClusters };
  }
  if (matchedClusters === 1 && totalClusters === 2) {
    return { coverage: ratio * 0.75, matchedClusters, totalClusters };
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
  const title = String(source.title || "").toLowerCase();
  const abstract = String(source.abstract ?? "").toLowerCase();
  const fullText = `${title} ${abstract}`;
  const sourceTopics = (source.topics || []).map(t => String(t ?? '').toLowerCase());

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

  // 5b. Domain mismatch penalty — if source is from a medical/biological repository
  // but the query is NOT about medicine/health/biology, apply a heavy penalty.
  // This filters out medical papers (gonorrhea, autism, delirium, etc.) that match
  // generic keywords like "supply chain" but are completely off-topic.
  const MEDICAL_PROVIDERS = ['pubmed', 'biorxiv', 'medrxiv', 'europepmc', 'chemrxiv'];
  const MEDICAL_TOPICS = ['medicine', 'health', 'medical', 'biology', 'biomedical',
    'clinical', 'pharmacology', 'epidemiology', 'public health', 'neuroscience',
    'genetics', 'immunology', 'oncology', 'cardiology', 'psychiatry'];
  const sourceProvider = String(source.provider || '').toLowerCase();
  const queryTopicsLower = enhancedQuery.topics.map(t => t.toLowerCase());
  const isMedicalSource = MEDICAL_PROVIDERS.some(p => sourceProvider.includes(p));
  const queryIsMedical = MEDICAL_TOPICS.some(mt => queryTopicsLower.some(qt => qt.includes(mt) || mt.includes(qt)));
  const domainMismatch = isMedicalSource && !queryIsMedical ? 0.3 : 1.0;

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
  // Also apply domain mismatch penalty (e.g., medical source for geopolitics query).
  const overall = baseScore * conceptMultiplier * domainMismatch;

  // Explanation for debugging
  const explanation = `Topic: ${(topicOverlap * 100).toFixed(0)}% | Field: ${(fieldMatch * 100).toFixed(0)}% | Semantic: ${(semanticSimilarity * 100).toFixed(0)}% | Temporal: ${(temporalRelevance * 100).toFixed(0)}% | TitleBonus: ${(titleKeywordBonus * 100).toFixed(0)}% | Concepts: ${mcc.matchedClusters}/${mcc.totalClusters} (x${conceptMultiplier.toFixed(2)})${domainMismatch < 1 ? ' | DOMAIN MISMATCH (x' + domainMismatch + ')' : ''}`;

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
  
  const belowThreshold = sources.filter(s => s.score.overall < 0.10).length;
  if (belowThreshold > 0) {
    console.log(`\n⚠️  ${belowThreshold} sources below 10% relevance (filtered out)`);
  }
}

// ============================================================================
// K10: CARE — Context-Aware Retriever Evaluation (arXiv 2026, Brehme et al.)
// ============================================================================
//
// "Evaluating Multi-Hop Reasoning in RAG Systems" — standard retriever evaluation
// checks if each source is individually relevant to the query. But in multi-hop
// queries, individual sources may appear irrelevant in isolation yet become
// essential when combined with other sources.
//
// CARE evaluates retriever quality by checking:
//   1. Individual relevance: Is each source relevant to the query alone?
//   2. Combined relevance: Do sources together cover all query concepts?
//   3. Multi-hop potential: Can sources be chained to answer multi-hop sub-questions?
//   4. Coverage diversity: Do sources span different aspects of the query?
//
// Result (paper): CARE consistently outperforms existing methods for evaluating
// multi-hop reasoning, especially for models with larger context windows.

export interface CAREResult {
  /** Overall CARE score (0-1) — weighted combination of all factors */
  overall: number;
  /** Average individual relevance of sources (0-1) */
  individualRelevance: number;
  /** Combined coverage: do sources together cover all query concepts? (0-1) */
  combinedCoverage: number;
  /** Multi-hop potential: can sources be chained for multi-hop reasoning? (0-1) */
  multiHopPotential: number;
  /** Coverage diversity: do sources span different aspects? (0-1) */
  coverageDiversity: number;
  /** Sources that are individually irrelevant but contribute to combined coverage */
  hiddenGems: Array<{ sourceId: string; reason: string }>;
  /** Sources that are individually relevant but redundant with others */
  redundantSources: Array<{ sourceId: string; redundantWith: string[] }>;
  /** Recommended action */
  recommendation: 'sufficient' | 'add_more_diverse' | 'remove_redundant' | 'add_missing_concepts';
  /** Missing concepts not covered by any source */
  missingConcepts: string[];
}

/**
 * Evaluate retriever quality using CARE (Context-Aware Retriever Evaluation).
 *
 * @param sources The retrieved sources
 * @param enhancedQuery The enhanced query with keywords and concept clusters
 * @returns CARE evaluation result
 */
export function evaluateWithCARE(
  sources: Array<SourceForScoring & { id: string }>,
  enhancedQuery: EnhancedQuery,
): CAREResult {
  if (sources.length === 0) {
    return {
      overall: 0,
      individualRelevance: 0,
      combinedCoverage: 0,
      multiHopPotential: 0,
      coverageDiversity: 0,
      hiddenGems: [],
      redundantSources: [],
      recommendation: 'add_missing_concepts',
      missingConcepts: enhancedQuery.keywords,
    };
  }

  // 1. Individual relevance: average relevance score across all sources
  // Sanitize sources to ensure abstract is always a string
  const sanitizedSources = sources.map(s => ({
    ...s,
    title: typeof s.title === 'string' ? s.title : String(s.title || ''),
    abstract: typeof s.abstract === 'string' ? s.abstract : String(s.abstract || ''),
  }));
  const scored = sanitizedSources.map(s => ({
    source: s,
    score: scoreRelevance(s, enhancedQuery),
  }));
  const individualRelevance = scored.reduce((sum, s) => sum + s.score.overall, 0) / scored.length;

  // 2. Combined coverage: do sources together cover all concept clusters?
  const clusters = clusterKeywords(enhancedQuery.keywords);
  const allSourceText = sources
    .map(s => `${typeof s.title === 'string' ? s.title : ''} ${typeof s.abstract === 'string' ? s.abstract : ''}`.toLowerCase())
    .join(' ');

  const matchedClusters: string[][] = [];
  const missingClusters: string[][] = [];
  for (const cluster of clusters) {
    const matched = cluster.some(kw => allSourceText.includes(kw.toLowerCase()));
    if (matched) {
      matchedClusters.push(cluster);
    } else {
      missingClusters.push(cluster);
    }
  }
  const combinedCoverage = clusters.length > 0 ? matchedClusters.length / clusters.length : 1;

  // 3. Multi-hop potential: check if sources have overlapping concepts that could chain
  // Two sources can form a multi-hop chain if they share at least one concept
  // but each also has unique concepts
  let multiHopPairs = 0;
  let totalPairs = 0;
  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      totalPairs++;
      const textI = `${sources[i].title} ${sources[i].abstract || ''}`.toLowerCase();
      const textJ = `${sources[j].title} ${sources[j].abstract || ''}`.toLowerCase();

      // Check for shared concepts (potential chain link)
      const sharedConcepts = clusters.filter(cluster =>
        cluster.some(kw => textI.includes(kw.toLowerCase()) && textJ.includes(kw.toLowerCase()))
      );

      // Check for unique concepts (each source contributes something new)
      const uniqueToI = clusters.filter(cluster =>
        cluster.some(kw => textI.includes(kw.toLowerCase())) &&
        !cluster.some(kw => textJ.includes(kw.toLowerCase()))
      );
      const uniqueToJ = clusters.filter(cluster =>
        cluster.some(kw => textJ.includes(kw.toLowerCase())) &&
        !cluster.some(kw => textI.includes(kw.toLowerCase()))
      );

      // Multi-hop potential: shared concept + unique concepts on both sides
      if (sharedConcepts.length > 0 && uniqueToI.length > 0 && uniqueToJ.length > 0) {
        multiHopPairs++;
      }
    }
  }
  const multiHopPotential = totalPairs > 0 ? multiHopPairs / totalPairs : 0;

  // 4. Coverage diversity: do sources span different providers/types?
  const providers = new Set(sources.map(s => s.provider));
  const types = new Set(sources.map(s => s.type));
  const providerDiversity = Math.min(1, providers.size / 5); // 5+ providers = max diversity
  const typeDiversity = Math.min(1, types.size / 3); // 3+ types = max diversity
  const coverageDiversity = (providerDiversity + typeDiversity) / 2;

  // 5. Hidden gems: sources with low individual relevance but high concept contribution
  const hiddenGems: Array<{ sourceId: string; reason: string }> = [];
  for (const { source, score } of scored) {
    if (score.overall < 0.4) {
      // Check if this source covers a concept cluster that others miss
      const sourceText = `${source.title} ${source.abstract || ''}`.toLowerCase();
      const uniqueClusters = clusters.filter(cluster =>
        cluster.some(kw => sourceText.includes(kw.toLowerCase())) &&
        !matchedClusters.includes(cluster)
      );
      if (uniqueClusters.length > 0) {
        hiddenGems.push({
          sourceId: source.id,
          reason: `Low individual relevance (${(score.overall * 100).toFixed(0)}%) but covers unique concept: ${uniqueClusters[0].join(', ')}`,
        });
      }
    }
  }

  // 6. Redundant sources: high individual relevance but overlap heavily with others
  const redundantSources: Array<{ sourceId: string; redundantWith: string[] }> = [];
  for (let i = 0; i < scored.length; i++) {
    if (scored[i].score.overall < 0.6) continue;
    const textI = `${scored[i].source.title} ${scored[i].source.abstract || ''}`.toLowerCase();
    const redundantWith: string[] = [];
    for (let j = 0; j < scored.length; j++) {
      if (i === j) continue;
      if (scored[j].score.overall < 0.6) continue;
      const textJ = `${scored[j].source.title} ${scored[j].source.abstract || ''}`.toLowerCase();
      // Check Jaccard similarity
      const wordsI = new Set(textI.split(/\s+/).filter(w => w.length > 3));
      const wordsJ = new Set(textJ.split(/\s+/).filter(w => w.length > 3));
      const intersection = [...wordsI].filter(w => wordsJ.has(w)).length;
      const union = new Set([...wordsI, ...wordsJ]).size;
      const jaccard = union > 0 ? intersection / union : 0;
      if (jaccard > 0.6) {
        redundantWith.push(scored[j].source.id);
      }
    }
    if (redundantWith.length > 0) {
      redundantSources.push({ sourceId: scored[i].source.id, redundantWith });
    }
  }

  // 7. Missing concepts
  const missingConcepts = missingClusters.flat();

  // 8. Overall CARE score
  const overall =
    individualRelevance * 0.25 +
    combinedCoverage * 0.35 +
    multiHopPotential * 0.20 +
    coverageDiversity * 0.20;

  // 9. Recommendation
  let recommendation: CAREResult['recommendation'] = 'sufficient';
  if (missingClusters.length > 0) {
    recommendation = 'add_missing_concepts';
  } else if (coverageDiversity < 0.4) {
    recommendation = 'add_more_diverse';
  } else if (redundantSources.length > sources.length * 0.3) {
    recommendation = 'remove_redundant';
  }

  return {
    overall,
    individualRelevance,
    combinedCoverage,
    multiHopPotential,
    coverageDiversity,
    hiddenGems,
    redundantSources,
    recommendation,
    missingConcepts,
  };
}
