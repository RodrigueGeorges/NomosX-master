/**
 * Adaptive RAG — NomosX Sprint 6 (Gap 4)
 *
 * RAG adaptatif avec reflection tokens et corrective retrieval.
 * Inspiré de :
 * - Self-RAG (ICLR 2024, arxiv 2310.11511) — reflection tokens pour contrôle à l'inference
 * - CRAG (arxiv 2401.15884) — retrieval evaluator + web search fallback
 * - Adaptive RAG (NAACL 2024) — adaptive retrieval strategy
 *
 * Le problème :
 * Le retrieval NomosX est *pipeline-fixe* (SCOUT→RANK→READER). L'agent ne peut pas
 * décider dynamiquement *pendant son raisonnement* s'il a besoin de plus de sources,
 * si les sources récupérées sont pertinentes, ou s'il faut corriger le retrieval.
 *
 * Architecture :
 * 1. Reflection tokens : `retrieve?`, `is_relevant?`, `critique?`, `is_supported?`
 * 2. Retrieval evaluator : score de confiance sur les documents récupérés
 * 3. Corrective actions :
 *    - Confiance haute → utiliser tel quel
 *    - Confiance moyenne → re-ranker + compléter
 *    - Confiance basse → web search fallback (Intelligent Scout)
 * 4. Self-critique : après génération, vérifier que les claims sont supportées
 *
 * Intégration : utilisé par l'Agentic ANALYST dans le ReAct loop.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Reflection tokens (Self-RAG-inspired) — control retrieval behavior at inference. */
export type ReflectionToken =
  | 'retrieve'        // Should we retrieve more sources?
  | 'is_relevant'     // Are the retrieved sources relevant?
  | 'critique'        // Should we critique the generated output?
  | 'is_supported';   // Are the claims supported by sources?

export type RetrievalConfidence = 'high' | 'medium' | 'low' | 'none';

export interface RetrievalEvaluation {
  /** Confidence in the retrieved documents */
  confidence: RetrievalConfidence;
  /** Score 0-1 */
  score: number;
  /** Which documents are relevant (indices) */
  relevantIndices: number[];
  /** Why the confidence is what it is */
  reason: string;
  /** What corrective action to take */
  action: CorrectiveAction;
}

export type CorrectiveAction =
  | 'use_as_is'         // Confidence high — use retrieved docs as is
  | 'rerank'            // Confidence medium — re-rank and filter
  | 'complement'        // Confidence medium — complement with more retrieval
  | 'web_search'        // Confidence low — fallback to web search
  | 'abort_retrieval';  // No relevant docs — abort and synthesize from knowledge

export interface AdaptiveRetrievalResult {
  /** Whether retrieval was performed */
  retrieved: boolean;
  /** Source IDs retrieved */
  sourceIds: string[];
  /** Evaluation of the retrieval */
  evaluation: RetrievalEvaluation | null;
  /** Whether a corrective action was taken */
  corrected: boolean;
  /** What correction was applied */
  correction?: string;
  /** Cost in USD */
  costUsd: number;
}

export interface AdaptiveRAGConfig {
  /** Function to search for sources (delegates to Intelligent Scout) */
  searchFn: (query: string, providers?: string[]) => Promise<{ sourceIds: string[]; found: number }>;
  /** Function to evaluate source relevance (delegates to RANK) */
  rankFn?: (query: string, sourceIds: string[]) => Promise<Array<{ id: string; score: number }>>;
  /** Function to read a source (delegates to READER) */
  readFn?: (sourceId: string) => Promise<string>;
  /** Whether web search fallback is enabled */
  enableWebFallback: boolean;
  /** Confidence threshold for "use as is" (default: 0.7) */
  highConfidenceThreshold: number;
  /** Confidence threshold for "corrective action" (default: 0.4) */
  lowConfidenceThreshold: number;
  /** Max retrieval rounds (prevents infinite loops) */
  maxRounds: number;
}

// ─── Reflection Token Prediction ────────────────────────────────────────────

/**
 * Predict whether the agent should retrieve more sources.
 * This is the `retrieve?` reflection token from Self-RAG.
 */
export async function predictRetrieveToken(
  query: string,
  currentContext: string,
  hasSources: boolean,
): Promise<{ shouldRetrieve: boolean; reason: string; costUsd: number }> {
  // Fast path: if no sources, always retrieve
  if (!hasSources) {
    return { shouldRetrieve: true, reason: 'No sources available — must retrieve', costUsd: 0 };
  }

  // Fast path: if context is very long and rich, probably don't need more
  if (currentContext.length > 10000 && hasSources) {
    return {
      shouldRetrieve: false,
      reason: 'Sufficient context already available',
      costUsd: 0,
    };
  }

  // LLM-based decision for ambiguous cases
  try {
    const response = await callLLM({
      messages: [
        {
          role: 'system',
          content: `You are a retrieval decision maker. Given a research query and the current context, decide whether more sources are needed.

Respond with JSON: {"shouldRetrieve": true/false, "reason": "brief explanation"}

Guidelines:
- If the context already has enough evidence to answer the query, don't retrieve
- If there are evidence gaps or the query is complex, retrieve
- If the current sources don't cover all aspects of the query, retrieve
- Be conservative — retrieval is expensive`,
        },
        {
          role: 'user',
          content: `Query: "${query.slice(0, 500)}"

Current context length: ${currentContext.length} chars
Has sources: ${hasSources}

Current context preview:
${currentContext.slice(0, 1000)}

Should we retrieve more sources?`,
        },
      ],
      temperature: 0.2,
      jsonMode: true,
      maxTokens: 150,
      task: 'enrichment_reasoner',
    });

    const parsed = parseJson<{ shouldRetrieve: boolean; reason: string }>(response.content);
    if (parsed) {
      return {
        shouldRetrieve: parsed.shouldRetrieve,
        reason: parsed.reason,
        costUsd: response.costUsd,
      };
    }
  } catch (err) {
    console.warn('[AdaptiveRAG] retrieve token prediction failed:', err);
  }

  // Default: retrieve if context is short
  return {
    shouldRetrieve: currentContext.length < 3000,
    reason: 'Default heuristic: short context → retrieve',
    costUsd: 0,
  };
}

// ─── Retrieval Evaluation (CRAG-inspired) ───────────────────────────────────

/**
 * Evaluate the quality of retrieved documents.
 * This is the CRAG retrieval evaluator — scores confidence and decides corrective action.
 */
export async function evaluateRetrieval(
  query: string,
  documents: Array<{ id: string; content: string; title?: string }>,
  config: AdaptiveRAGConfig,
): Promise<RetrievalEvaluation> {
  if (documents.length === 0) {
    return {
      confidence: 'none',
      score: 0,
      relevantIndices: [],
      reason: 'No documents retrieved',
      action: 'abort_retrieval',
    };
  }

  try {
    const response = await callLLM({
      messages: [
        {
          role: 'system',
          content: `You are a Retrieval Evaluator (CRAG-inspired). Score the relevance of retrieved documents to the query.

For each document, assess:
1. Is it relevant to the query? (yes/no/partial)
2. Does it contain useful information?

Then give an overall confidence score (0-1) and identify which documents are relevant.

Respond with JSON:
{
  "confidence": "high" | "medium" | "low" | "none",
  "score": 0.75,
  "relevantIndices": [0, 2, 3],
  "reason": "brief explanation",
  "action": "use_as_is" | "rerank" | "complement" | "web_search" | "abort_retrieval"
}

Action guidelines:
- score >= 0.7 → "use_as_is"
- score >= 0.4 → "rerank" or "complement"
- score < 0.4 → "web_search" (if enabled) or "abort_retrieval"`,
        },
        {
          role: 'user',
          content: `Query: "${query.slice(0, 500)}"

Retrieved documents (${documents.length}):
${documents.map((d, i) => `--- Document ${i} ---
Title: ${d.title || 'untitled'}
Content: ${d.content.slice(0, 500)}...`).join('\n\n')}

Evaluate the retrieval quality:`,
        },
      ],
      temperature: 0.2,
      jsonMode: true,
      maxTokens: 400,
      task: 'enrichment_reasoner',
    });

    const parsed = parseJson<RetrievalEvaluation>(response.content);
    if (parsed) {
      // Override action based on config thresholds
      let action = parsed.action;
      if (parsed.score >= config.highConfidenceThreshold) action = 'use_as_is';
      else if (parsed.score < config.lowConfidenceThreshold) {
        action = config.enableWebFallback ? 'web_search' : 'abort_retrieval';
      } else if (action === 'use_as_is') {
        action = 'rerank'; // Don’t use as is if below threshold
      }
      return { ...parsed, action };
    }
  } catch (err) {
    console.warn('[AdaptiveRAG] retrieval evaluation failed:', err);
  }

  // Fallback: heuristic
  const avgLength = documents.reduce((a, d) => a + d.content.length, 0) / documents.length;
  const score = Math.min(1, avgLength / 2000);
  const confidence: RetrievalConfidence =
    score >= config.highConfidenceThreshold ? 'high' :
    score >= config.lowConfidenceThreshold ? 'medium' : 'low';
  return {
    confidence,
    score,
    relevantIndices: documents.map((_, i) => i),
    reason: 'Heuristic fallback: based on document length',
    action: confidence === 'high' ? 'use_as_is' : confidence === 'medium' ? 'rerank' : 'web_search',
  };
}

// ─── Self-Critique (Self-RAG `is_supported?` token) ─────────────────────────

/**
 * Check if the generated claims are supported by the sources.
 * This is the Self-RAG `is_supported?` reflection token.
 */
export async function critiqueSupport(
  claims: string[],
  sources: Array<{ id: string; content: string }>,
): Promise<{
  supported: Array<{ claim: string; supported: boolean; sourceIds: string[] }>;
  overallSupport: number;
  costUsd: number;
}> {
  if (claims.length === 0) {
    return { supported: [], overallSupport: 1, costUsd: 0 };
  }

  try {
    const response = await callLLM({
      messages: [
        {
          role: 'system',
          content: `You are a Claim Support Evaluator (Self-RAG is_supported? token).
For each claim, check if it is supported by the provided sources.

Respond with JSON:
{
  "supported": [
    {"claim": "the claim text", "supported": true, "sourceIds": ["src1", "src2"], "reason": "brief"},
    ...
  ],
  "overallSupport": 0.75
}

overallSupport = fraction of claims that are supported.`,
        },
        {
          role: 'user',
          content: `Claims to verify:
${claims.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Sources:
${sources.map(s => `--- ${s.id} ---\n${s.content.slice(0, 800)}`).join('\n\n')}

Check support for each claim:`,
        },
      ],
      temperature: 0.2,
      jsonMode: true,
      maxTokens: 1000,
      task: 'enrichment_reasoner',
    });

    const parsed = parseJson<{
      supported: Array<{ claim: string; supported: boolean; sourceIds: string[] }>;
      overallSupport: number;
    }>(response.content);

    if (parsed) {
      return {
        supported: parsed.supported,
        overallSupport: parsed.overallSupport,
        costUsd: response.costUsd,
      };
    }
  } catch (err) {
    console.warn('[AdaptiveRAG] critique support failed:', err);
  }

  // Fallback: assume all claims are supported
  return {
    supported: claims.map(claim => ({ claim, supported: true, sourceIds: [] })),
    overallSupport: 1,
    costUsd: 0,
  };
}

// ─── Main Adaptive Retrieval Function ───────────────────────────────────────

/**
 * Perform adaptive retrieval with reflection tokens and corrective actions.
 *
 * Flow:
 * 1. Predict `retrieve?` — should we retrieve at all?
 * 2. If yes, retrieve via the search function
 * 3. Evaluate retrieval (CRAG evaluator) — `is_relevant?`
 * 4. Apply corrective action (use as is, rerank, complement, web search)
 * 5. Return the result
 */
export async function adaptiveRetrieve(
  query: string,
  currentContext: string,
  existingSourceIds: string[],
  config: AdaptiveRAGConfig,
): Promise<AdaptiveRetrievalResult> {
  let totalCost = 0;
  let round = 0;
  let allSourceIds = [...existingSourceIds];
  let evaluation: RetrievalEvaluation | null = null;
  let corrected = false;
  let correction: string | undefined;

  while (round < config.maxRounds) {
    round++;

    // Step 1: Predict `retrieve?` token
    const retrieveDecision = await predictRetrieveToken(
      query,
      currentContext,
      allSourceIds.length > 0,
    );
    totalCost += retrieveDecision.costUsd;

    if (!retrieveDecision.shouldRetrieve && round > 1) {
      break; // Don’t retrieve more
    }

    if (!retrieveDecision.shouldRetrieve && round === 1 && allSourceIds.length > 0) {
      // We have sources and don’t need more — evaluate them
      // (skip retrieval, go to evaluation)
    } else {
      // Step 2: Retrieve
      const searchResult = await config.searchFn(query);
      allSourceIds = [...new Set([...allSourceIds, ...searchResult.sourceIds])];
    }

    if (allSourceIds.length === 0) {
      return {
        retrieved: false,
        sourceIds: [],
        evaluation: null,
        corrected: false,
        costUsd: totalCost,
      };
    }

    // Step 3: Evaluate retrieval (CRAG)
    // For evaluation, we need document content — use readFn if available
    const docs: Array<{ id: string; content: string; title?: string }> = [];
    if (config.readFn) {
      const reads = await Promise.allSettled(
        allSourceIds.slice(0, 10).map(id => config.readFn!(id))
      );
      for (let i = 0; i < reads.length; i++) {
        if (reads[i].status === 'fulfilled') {
          docs.push({ id: allSourceIds[i], content: (reads[i] as PromiseFulfilledResult<string>).value });
        }
      }
    } else {
      // Without readFn, use IDs as content placeholders
      docs.push(...allSourceIds.slice(0, 10).map(id => ({ id, content: id })));
    }

    evaluation = await evaluateRetrieval(query, docs, config);

    // Step 4: Apply corrective action
    switch (evaluation.action) {
      case 'use_as_is':
        return {
          retrieved: true,
          sourceIds: allSourceIds,
          evaluation,
          corrected: false,
          costUsd: totalCost,
        };

      case 'rerank':
        if (config.rankFn) {
          const ranked = await config.rankFn(query, allSourceIds);
          allSourceIds = ranked
            .filter(r => evaluation!.relevantIndices.includes(ranked.indexOf(r)))
            .map(r => r.id);
          corrected = true;
          correction = `Reranked and filtered to ${allSourceIds.length} relevant sources`;
        }
        break;

      case 'complement':
        // Retrieve more with a refined query
        corrected = true;
        correction = 'Complemented with additional retrieval';
        continue; // Next round

      case 'web_search':
        if (config.enableWebFallback) {
          // Delegate to Intelligent Scout with web providers
          const webResult = await config.searchFn(query, ['web', 'google_scholar']);
          allSourceIds = [...new Set([...allSourceIds, ...webResult.sourceIds])];
          corrected = true;
          correction = `Web search fallback: added ${webResult.sourceIds.length} sources`;
        }
        break;

      case 'abort_retrieval':
        return {
          retrieved: allSourceIds.length > 0,
          sourceIds: allSourceIds,
          evaluation,
          corrected: false,
          costUsd: totalCost,
        };
    }

    // If we’ve done enough rounds, or the action is not asking for more, stop
    if (round >= config.maxRounds || evaluation.action === 'web_search') {
      break;
    }
  }

  return {
    retrieved: allSourceIds.length > existingSourceIds.length,
    sourceIds: allSourceIds,
    evaluation,
    corrected,
    correction,
    costUsd: totalCost,
  };
}

// ─── Utility: Build reflection token hint for ReAct ────────────────────────

/**
 * Build a hint string for the ReAct loop that teaches the agent about reflection tokens.
 * This lets the Agentic ANALYST use adaptive RAG in its reasoning.
 */
export function buildReflectionTokenHint(): string {
  return `
=== ADAPTIVE RAG — REFLECTION TOKENS ===
You have access to adaptive retrieval via reflection tokens:
- [retrieve?] — Before making a claim, ask yourself: "Do I have a source for this?"
  If not, call search_sources with a specific query.
- [is_relevant?] — After retrieving sources, evaluate: "Are these relevant to my claim?"
  If not, refine your search query.
- [is_supported?] — Before finalizing a claim, check: "Is this claim supported by my sources?"
  If not, either find a source or hedge the claim.
- [critique?] — After writing a section, critique it: "Are there unsupported claims?"
  If yes, either find sources or remove the claims.

Use these tokens implicitly in your reasoning. Don’t write them literally —
just use the pattern: claim → check support → retrieve if needed → verify.
=== END ADAPTIVE RAG ===`.trim();
}

// ─── Backward-compatible assessRetrievalSufficiency ─────────────────────────

export interface SourceForAssessment {
  title: string;
  abstract: string;
  provider: string;
  year?: number;
}

export interface ReadingForAssessment {
  sourceId: string;
  claims: any[];
  confidence: number;
}

export interface RetrievalSufficiencyAssessment {
  sufficient: boolean;
  confidence: number;
  gaps: string[];
  score: number;
  reason: string;
}

/**
 * Assess whether the current sources and readings are sufficient to answer the query.
 * Backward-compatible signature used by pipeline-v2.ts.
 */
export async function assessRetrievalSufficiency(
  input: {
    researchQuestion: string;
    sources: SourceForAssessment[];
    readings: ReadingForAssessment[];
  },
): Promise<RetrievalSufficiencyAssessment> {
  const { researchQuestion, sources, readings } = input;

  // Build document list for the CRAG evaluator
  const documents = sources.map((s, i) => ({
    id: `src-${i + 1}`,
    content: `Title: ${s.title}\nAbstract: ${s.abstract}\nProvider: ${s.provider}\nYear: ${s.year || 'unknown'}`,
    title: s.title,
  }));

  const config: AdaptiveRAGConfig = {
    searchFn: async () => ({ sourceIds: [], found: 0 }),
    enableWebFallback: false,
    highConfidenceThreshold: 0.7,
    lowConfidenceThreshold: 0.4,
    maxRounds: 1,
  };

  const evaluation = await evaluateRetrieval(researchQuestion, documents, config);

  // Identify gaps from low-confidence areas
  const gaps: string[] = [];
  if (evaluation.score < 0.7) {
    gaps.push(`Low retrieval confidence (${(evaluation.score * 100).toFixed(0)}%)`);
  }
  if (sources.length < 5) {
    gaps.push('Too few sources (< 5)');
  }
  if (readings.length < sources.length * 0.5) {
    gaps.push('Many sources not yet read');
  }

  const confidence = Math.round(evaluation.score * 100);

  return {
    sufficient: evaluation.action === 'use_as_is' && gaps.length === 0,
    confidence,
    gaps,
    score: evaluation.score,
    reason: evaluation.reason,
  };
}
