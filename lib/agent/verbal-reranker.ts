/**
 * VERBAL-R3: Verbal Reranker as the Missing Bridge between Retrieval and Reasoning
 *
 * Based on: Park et al. (ACL 2026) "Verbal-R3: Verbal Reranker as the Missing
 * Bridge between Retrieval and Reasoning"
 *
 * Instead of injecting raw retrieved texts into the LLM's context, Verbal-R3
 * generates **Verbal Annotations** — analytic narratives that explicitly articulate
 * the logical connection between a search query and retrieved contexts.
 *
 * Architecture:
 * - Generator: performs iterative retrieval and reasoning
 * - Verbal Reranker: returns relevance scores AND verbal annotations that guide
 *   the reasoning and answering process of the Generator
 *
 * In NomosX, this replaces the simple Cohere reranker with a layer that:
 * 1. For each source, generates a 1-2 sentence annotation explaining WHY it's relevant
 * 2. Uses these annotations to produce a better relevance score
 * 3. Passes the annotations to the ANALYST so it understands source relevance
 *
 * Benefits (per paper):
 * - +15-20% on complex QA benchmarks
 * - LLM better exploits sources when it understands the logical connection
 * - Relevance-guided test-time scaling allocates compute efficiently
 */

import { callLLM, type LLMRequest, type LLMTask, type LLMFamily } from '../llm/unified-llm';

/** Helper: call LLM with simple prompt/systemPrompt interface */
async function llmChat(opts: { task: LLMTask; systemPrompt: string; prompt: string; temperature?: number; maxTokens?: number }): Promise<string> {
  const response = await callLLM({
    messages: [
      { role: 'system', content: opts.systemPrompt },
      { role: 'user', content: opts.prompt },
    ],
    task: opts.task,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
  });
  return response.content || '';
}

export interface VerbalAnnotation {
  sourceId: string;
  sourceIndex: number;
  /** Relevance score 0-1 from verbal reranker */
  verbalScore: number;
  /** 1-2 sentence annotation explaining the logical connection to the query */
  annotation: string;
  /** Which aspect of the query this source addresses */
  queryAspect: string;
  /** Whether this source provides quantitative evidence */
  hasQuantitative: boolean;
  /** Whether this source provides a unique perspective (not redundant) */
  isUnique: boolean;
}

export interface VerbalRerankResult<T> {
  source: T;
  verbalAnnotation: VerbalAnnotation;
  index: number;
}

/**
 * Rerank sources using verbal annotations.
 *
 * For each source, an LLM generates a verbal annotation explaining:
 * 1. WHY this source is relevant to the query
 * 2. WHAT aspect of the query it addresses
 * 3. WHETHER it provides unique vs redundant evidence
 *
 * The verbal score is computed from the annotation quality, not just keyword overlap.
 */
export async function verbalRerank<T extends { id: string; title: string; abstract?: string; fullText?: string }>(
  sources: T[],
  query: string,
  options: {
    topK?: number;
    batchSize?: number;
    family?: LLMFamily;
  } = {}
): Promise<VerbalRerankResult<T>[]> {
  const { topK = sources.length, batchSize = 5 } = options;

  if (sources.length === 0) return [];

  console.log(`[VerbalR3] Reranking ${sources.length} sources with verbal annotations...`);

  const annotations: VerbalAnnotation[] = [];

  // Process in batches to avoid overwhelming the LLM
  for (let i = 0; i < sources.length; i += batchSize) {
    const batch = sources.slice(i, i + batchSize);
    const batchAnnotations = await Promise.allSettled(
      batch.map((source, batchIdx) => generateAnnotation(source, query, i + batchIdx))
    );

    batchAnnotations.forEach((result, batchIdx) => {
      const sourceIdx = i + batchIdx;
      if (result.status === 'fulfilled') {
        annotations.push(result.value);
      } else {
        // Fallback: basic annotation without LLM
        annotations.push({
          sourceId: batch[batchIdx].id,
          sourceIndex: sourceIdx,
          verbalScore: 0.5,
          annotation: `Source discusses topics related to the query.`,
          queryAspect: 'general',
          hasQuantitative: false,
          isUnique: true,
        });
      }
    });
  }

  // Sort by verbal score (descending)
  annotations.sort((a, b) => b.verbalScore - a.verbalScore);

  // Build result with top-K sources
  const result: VerbalRerankResult<T>[] = [];
  for (let i = 0; i < Math.min(topK, annotations.length); i++) {
    const ann = annotations[i];
    const source = sources.find((s, idx) => idx === ann.sourceIndex) || sources[ann.sourceIndex];
    if (source) {
      result.push({
        source,
        verbalAnnotation: ann,
        index: i,
      });
    }
  }

  const quantCount = annotations.filter(a => a.hasQuantitative).length;
  const uniqueCount = annotations.filter(a => a.isUnique).length;
  console.log(`[VerbalR3] ✅ Complete: ${result.length} sources reranked, ${quantCount} with quantitative data, ${uniqueCount} unique perspectives`);

  return result;
}

/**
 * Generate a verbal annotation for a single source.
 */
async function generateAnnotation(
  source: { id: string; title: string; abstract?: string; fullText?: string },
  query: string,
  sourceIndex: number
): Promise<VerbalAnnotation> {
  const sourceContent = (source.abstract || source.fullText || '').slice(0, 1500);

  const prompt = `You are a Verbal Reranker (Verbal-R3). Your job is to evaluate how relevant a source is to a research query and generate a verbal annotation explaining the logical connection.

RESEARCH QUERY: ${query}

SOURCE TITLE: ${source.title}
SOURCE CONTENT (excerpt): ${sourceContent.slice(0, 1000)}

Analyze this source and respond in EXACTLY this JSON format:
{
  "verbalScore": <0.0 to 1.0 — how relevant is this source to the query>,
  "annotation": "<1-2 sentences explaining WHY this source is relevant and WHAT it contributes to answering the query>",
  "queryAspect": "<which aspect of the query this source addresses: e.g. 'causal mechanism', 'quantitative evidence', 'historical context', 'counter-argument', 'policy framework', 'empirical data'>",
  "hasQuantitative": <true if the source contains numbers, statistics, or quantitative data>,
  "isUnique": <true if this source likely provides a unique perspective not found in typical search results>
}

Be precise and analytical. The annotation should help a researcher quickly understand why this source matters.`;

  try {
    const text = await llmChat({
      task: 'verbal_rerank',
      systemPrompt: 'You are a precise academic source evaluator. Always respond with valid JSON.',
      prompt,
      temperature: 0.1,
      maxTokens: 300,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        sourceId: source.id,
        sourceIndex,
        verbalScore: Math.max(0, Math.min(1, parsed.verbalScore ?? 0.5)),
        annotation: parsed.annotation || 'Source discusses topics related to the query.',
        queryAspect: parsed.queryAspect || 'general',
        hasQuantitative: !!parsed.hasQuantitative,
        isUnique: parsed.isUnique !== false,
      };
    }
  } catch {
    // Non-blocking — fallback below
  }

  // Fallback: keyword-based annotation
  const queryWords = new Set(query.toLowerCase().split(/\s+/).filter(w => w.length > 4));
  const sourceText = `${source.title} ${sourceContent}`.toLowerCase();
  const matchedWords = [...queryWords].filter(w => sourceText.includes(w));
  const score = queryWords.size > 0 ? matchedWords.length / queryWords.size : 0.5;

  return {
    sourceId: source.id,
    sourceIndex,
    verbalScore: Math.max(0.3, score),
    annotation: `Source covers ${matchedWords.slice(0, 3).join(', ')} which relates to the query.`,
    queryAspect: 'general',
    hasQuantitative: /\d+%|\$[\d.]+|\d{4}|\d+\s*(million|billion|trillion)/i.test(sourceContent),
    isUnique: true,
  };
}

/**
 * Build a context block of verbal annotations for the ANALYST.
 *
 * Instead of just listing sources, we provide the verbal annotations
 * so the analyst understands WHY each source was selected.
 */
export function buildVerbalContextBlock(annotations: VerbalRerankResult<any>[]): string {
  if (annotations.length === 0) return '';

  const lines = annotations.slice(0, 30).map((r, i) => {
    const ann = r.verbalAnnotation;
    return `[SRC-${i + 1}] ${r.source.title}
  → Relevance: ${(ann.verbalScore * 100).toFixed(0)}% | Aspect: ${ann.queryAspect} | Quant: ${ann.hasQuantitative ? 'yes' : 'no'} | Unique: ${ann.isUnique ? 'yes' : 'no'}
  → ${ann.annotation}`;
  });

  return `VERBAL SOURCE ANNOTATIONS (Verbal-R3):
The following sources were selected and annotated with their logical connection to the research question. Use these annotations to guide your analysis.

${lines.join('\n\n')}`;
}
