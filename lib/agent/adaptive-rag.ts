/**
 * Adaptive RAG (CoRAG-inspired) — NomosX
 *
 * Inspired by:
 * - CoRAG (Chain-of-Retrieval Augmented Generation, arXiv 2025):
 *   Dynamically reformulate queries based on evolving state, performing
 *   step-by-step retrieval and reasoning before final answer generation.
 * - DynamicRAG (2025): RL reranker that adjusts order AND number of documents.
 * - SeaKR (ACL 2025): Self-aware knowledge retrieval triggered by uncertainty.
 * - FB-RAG (2025): Forward-backward RAG with look-ahead context selection.
 *
 * Architecture:
 * - After the first SCOUT→READER pass, evaluate if sources are sufficient
 * - If not (low coverage, low diversity, high uncertainty), reformulate the query
 * - Launch a targeted SCOUT with the reformulated query
 * - Merge new sources with existing ones
 * - Maximum 3 iterations, with early stop if confidence threshold reached
 *
 * Integration:
 * - pipeline-v2.ts: call adaptiveRetrieval() after first SCOUT+READER
 * - Returns additional sourceIds + reformulation log
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RetrievalAssessment {
  sufficient: boolean;
  confidence: number; // 0-100
  gaps: string[]; // identified knowledge gaps
  reformulatedQueries: string[]; // suggested alternative queries
  reasoning: string;
}

export interface AdaptiveRetrievalResult {
  iterations: number;
  initialSourceCount: number;
  finalSourceCount: number;
  reformulations: Array<{
    iteration: number;
    originalQuery: string;
    reformulatedQuery: string;
    rationale: string;
    newSourcesFound: number;
  }>;
  assessment: RetrievalAssessment;
  totalCostUsd: number;
}

// ─── Core Logic ─────────────────────────────────────────────────────────────

/**
 * Assess whether the current source pool is sufficient for analysis.
 * Uses LLM to evaluate coverage, diversity, and identify gaps.
 */
export async function assessRetrievalSufficiency(params: {
  researchQuestion: string;
  sources: Array<{ title: string; abstract: string; provider: string; year?: number }>;
  readings?: Array<{ sourceId: string; claims: string[]; confidence: string }>;
}): Promise<RetrievalAssessment> {
  const { researchQuestion, sources, readings } = params;

  if (sources.length === 0) {
    return {
      sufficient: false,
      confidence: 0,
      gaps: ['No sources found — need to reformulate query or try different providers'],
      reformulatedQueries: [],
      reasoning: 'Zero sources retrieved',
    };
  }

  // Heuristic pre-check: if we have 15+ sources from 3+ providers, likely sufficient
  const providers = new Set(sources.map(s => s.provider));
  if (sources.length >= 15 && providers.size >= 3) {
    return {
      sufficient: true,
      confidence: 75,
      gaps: [],
      reformulatedQueries: [],
      reasoning: `Sufficient sources: ${sources.length} from ${providers.size} providers`,
    };
  }

  // LLM-based assessment for borderline cases
  try {
    const sourceSummary = sources.slice(0, 10).map((s, i) =>
      `[${i + 1}] ${s.title} (${s.provider}, ${s.year || 'N/A'})\n    ${(s.abstract || '').slice(0, 200)}`
    ).join('\n');

    const claimsSummary = readings?.slice(0, 5).map(r =>
      `- ${r.claims[0]?.slice(0, 100) || 'N/A'} (confidence: ${r.confidence})`
    ).join('\n') || 'No readings available';

    const response = await callLLM({
      messages: [{
        role: 'user',
        content: `You are evaluating whether the retrieved research sources are SUFFICIENT to answer a research question with high quality.

RESEARCH QUESTION: ${researchQuestion}

CURRENT SOURCES (${sources.length} from ${providers.size} providers):
${sourceSummary}

KEY CLAIMS EXTRACTED:
${claimsSummary}

Evaluate:
1. SUFFICIENCY: Are these sources enough to produce a rigorous, well-grounded analysis?
2. GAPS: What important perspectives, methodologies, or evidence types are missing?
3. REFORMULATION: If insufficient, suggest 1-3 ALTERNATIVE search queries that might find the missing sources. These should be:
   - Different angles (e.g., if current query is policy-focused, try methodology-focused)
   - Different terminology (synonyms, related concepts)
   - Cross-domain bridges (e.g., if querying "AI governance", also try "algorithmic accountability" or "automated decision-making ethics")

Return JSON:
{
  "sufficient": true|false,
  "confidence": 0-100,
  "gaps": ["1-3 specific knowledge gaps"],
  "reformulatedQueries": ["1-3 alternative search queries"],
  "reasoning": "brief explanation"
}`
      }],
      temperature: 0.15,
      jsonMode: true,
      maxTokens: 600,
      enableCache: true,
      task: 'enrichment_reasoner',
    });

    const result = parseJson<RetrievalAssessment>(response.content);
    if (result) return result;

    // Fallback: heuristic
    return {
      sufficient: sources.length >= 8,
      confidence: sources.length >= 8 ? 60 : 30,
      gaps: sources.length < 8 ? ['Insufficient source count'] : [],
      reformulatedQueries: [],
      reasoning: `Heuristic: ${sources.length} sources from ${providers.size} providers`,
    };
  } catch (error) {
    console.warn('[CoRAG] Assessment failed, using heuristic:', error instanceof Error ? error.message : String(error));
    return {
      sufficient: sources.length >= 8,
      confidence: sources.length >= 8 ? 50 : 25,
      gaps: [],
      reformulatedQueries: [],
      reasoning: 'Fallback heuristic (LLM assessment failed)',
    };
  }
}

/**
 * Reformulate a query to find missing perspectives.
 * Uses LLM to generate alternative search queries.
 */
export async function reformulateQuery(
  originalQuery: string,
  gaps: string[],
  existingSources: Array<{ title: string; provider: string }>,
): Promise<string[]> {
  try {
    const existingTitles = existingSources.slice(0, 5).map(s => s.title).join('; ');

    const response = await callLLM({
      messages: [{
        role: 'user',
        content: `You are a research query reformulation expert. Your job is to generate ALTERNATIVE search queries that will find sources NOT already found.

ORIGINAL QUERY: ${originalQuery}

KNOWLEDGE GAPS IDENTIFIED:
${gaps.map(g => `- ${g}`).join('\n')}

EXISTING SOURCES (avoid duplicates):
${existingTitles}

Generate 1-3 alternative search queries that:
1. Target the identified gaps
2. Use different terminology (synonyms, related concepts, cross-domain terms)
3. Are likely to find sources in academic databases (OpenAlex, Crossref, Semantic Scholar)
4. Are NOT just rephrasings of the original — they should find NEW angles

Return JSON: { "queries": ["query1", "query2", ...] }`
      }],
      temperature: 0.3,
      jsonMode: true,
      maxTokens: 300,
      enableCache: true,
      task: 'query_reformulation',
    });

    const result = parseJson<{ queries: string[] }>(response.content);
    return result?.queries?.slice(0, 3) || [];
  } catch (error) {
    console.warn('[CoRAG] Reformulation failed:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Evaluate the quality of a retrieval iteration.
 * Returns a score 0-100 based on source count, diversity, and relevance.
 */
export function evaluateRetrievalQuality(sources: Array<{ provider: string; title: string }>): number {
  if (sources.length === 0) return 0;

  const providers = new Set(sources.map(s => s.provider));
  const providerDiversity = providers.size / Math.max(sources.length, 1);

  // Score: count (40%) + diversity (40%) + baseline (20%)
  const countScore = Math.min(sources.length / 15, 1) * 40;
  const diversityScore = Math.min(providerDiversity * 3, 1) * 40;
  const baselineScore = 20;

  return Math.round(countScore + diversityScore + baselineScore);
}

// ─── Integration Helper ─────────────────────────────────────────────────────

/**
 * Build a context summary of what was found in previous iterations.
 * This helps the LLM understand what's already been covered.
 */
export function buildRetrievalContext(
  researchQuestion: string,
  sources: Array<{ title: string; abstract: string; provider: string }>,
  iteration: number,
): string {
  const providerCounts = sources.reduce((acc, s) => {
    acc[s.provider] = (acc[s.provider] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return `=== ADAPTIVE RETRIEVAL CONTEXT (Iteration ${iteration}) ===
Research Question: ${researchQuestion}
Sources found so far: ${sources.length} from ${Object.keys(providerCounts).length} providers
Provider breakdown: ${Object.entries(providerCounts).map(([p, c]) => `${p}(${c})`).join(', ')}

Top sources:
${sources.slice(0, 5).map((s, i) => `[${i + 1}] ${s.title} (${s.provider})`).join('\n')}
=== END RETRIEVAL CONTEXT ===`;
}
