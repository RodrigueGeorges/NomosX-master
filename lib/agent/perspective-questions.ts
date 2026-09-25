/**
 * Perspective-Guided Question Generation — Co-STORM method (EMNLP 2024).
 *
 * Stanford's STORM showed that directly prompting an LLM to "ask questions"
 * produces shallow, redundant queries. Their fix: first discover distinct
 * expert PERSPECTIVES on the topic, then generate questions each perspective
 * would actually ask. This systematically covers dimensions that a generic
 * "enhance this query" pass misses (e.g., legal/sovereignty angles on a
 * geopolitics topic, ethical framings on a tech topic).
 *
 * Integration: scoutImpl calls generatePerspectiveQueries() right after
 * enhanceQuery(). The returned queries are appended to searchQueries so the
 * existing provider fan-out searches them like any other variation.
 *
 * Cost: ONE cheap LLM call (~$0.001 on glm-4.5-air).
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

export interface PerspectiveQuestionResult {
  perspectives: Array<{ lens: string; questions: string[] }>;
  queries: string[];   // flattened, deduped, ready for search
  costUsd: number;
}

const PERSPECTIVE_PROMPT = `You are the editorial research director of an international think tank.

TOPIC: "{query}"

Step 1: Identify {n} genuinely DIFFERENT expert perspectives that would investigate this topic (e.g., international law scholar, defense economist, environmental scientist, regional historian, sociologist, industry analyst). Choose perspectives that reveal dimensions a generic news/academic search would miss — structural causes, second-order effects, dissenting analyses, historical precedents.

Step 2: For each perspective, write 2 precise search queries that expert would run to find evidence a generalist would overlook. Queries must be self-contained, search-engine ready, and materially different from the base topic phrasing.

Return STRICT JSON only:
{"perspectives": [{"lens": "name of the expert perspective", "questions": ["query1", "query2"]}, ...]}`;

/**
 * Generate perspective-guided search queries for a research topic.
 * Returns [] on failure — caller continues with its normal query set.
 */
export async function generatePerspectiveQueries(
  query: string,
  maxPerspectives = 4,
): Promise<PerspectiveQuestionResult> {
  const empty: PerspectiveQuestionResult = { perspectives: [], queries: [], costUsd: 0 };
  if (!query || query.trim().length < 10) return empty;

  try {
    const res = await callLLM({
      messages: [{
        role: 'user',
        content: PERSPECTIVE_PROMPT
          .replace('{query}', query.slice(0, 400))
          .replace('{n}', String(maxPerspectives)),
      }],
      temperature: 0.4, // some creativity helps perspective diversity
      jsonMode: true,
      maxTokens: 1800,
      enableCache: false,
      task: 'reader_v3',
    });

    const parsed = parseJson<{ perspectives: Array<{ lens: string; questions: string[] }> }>(res.content);
    const costUsd = typeof res.costUsd === 'number' ? res.costUsd : 0;

    if (!parsed?.perspectives || !Array.isArray(parsed.perspectives)) return { ...empty, costUsd };

    const perspectives: Array<{ lens: string; questions: string[] }> = parsed.perspectives
      .filter((p: { lens: string; questions: string[] }) => p && typeof p.lens === 'string' && Array.isArray(p.questions))
      .slice(0, maxPerspectives)
      .map((p: { lens: string; questions: string[] }) => ({
        lens: p.lens.slice(0, 80),
        questions: p.questions.filter((q: string) => typeof q === 'string' && q.length > 10).slice(0, 2),
      }))
      .filter((p: { lens: string; questions: string[] }) => p.questions.length > 0);

    // Flatten + dedupe (case-insensitive, punctuation-insensitive)
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    const seen = new Set<string>([norm(query)]);
    const queries: string[] = [];
    for (const p of perspectives) {
      for (const q of p.questions) {
        const n = norm(q);
        if (!seen.has(n) && q.length <= 300) {
          seen.add(n);
          queries.push(q);
        }
      }
    }

    if (queries.length > 0) {
      console.log(`[PERSPECTIVES] ${perspectives.map(p => p.lens).join(' | ')} → +${queries.length} guided queries`);
    }
    return { perspectives, queries, costUsd };
  } catch (err) {
    console.warn('[PERSPECTIVES] Generation failed (non-blocking):', String(err).slice(0, 120));
    return empty;
  }
}
