/**
 * Late-addition relevance screen — shared by rank-enrichment and gap-fill.
 *
 * Sources that enter the corpus AFTER the initial topical screen (enrichment
 * merges, refusal-retry, snowball, blackboard gap requests, post-analyst
 * enrichment) were never scored against the research question. This helper
 * runs one bounded batch LLM call over the unscreened candidates and returns
 * the ids scored 0 (off-topic) so callers can drop them and keep them out of
 * later re-ranks.
 *
 * Fail-open by design: a screening error returns null (no drops) — screening
 * is a precision improvement, never a reason to lose the corpus. Callers
 * decide whether a null result still marks candidates as screened.
 */

export interface RelevanceScreenResult {
  /** Ids the model scored 0 — off-topic, must not reach the reader. */
  dropIds: Set<string>;
  /** How many candidates were actually scored. */
  screened: number;
  costUsd?: number;
}

const MAX_SCREENED = 50;

export async function screenSourcesForRelevance(opts: {
  query: string;
  candidates: any[];
  label: string;
  addCost: (usd: number | undefined, step: string) => void;
  /** Cost ledger label — defaults to RELEVANCE_SCREEN_LATE. */
  costStep?: string;
}): Promise<RelevanceScreenResult | null> {
  const { query, candidates, label, addCost } = opts;
  const costStep = opts.costStep ?? 'RELEVANCE_SCREEN_LATE';
  const batch = candidates.slice(0, MAX_SCREENED);
  if (batch.length === 0) return null;
  try {
    const { callLLM } = await import('../../llm/unified-llm');
    const { parseJson } = await import('../json-utils');
    const listing = batch
      .map((s: any, i: number) => `${i}: ${(s.title || 'untitled').slice(0, 120)} — ${(s.abstract || '').replace(/\s+/g, ' ').slice(0, 160)}`)
      .join('\n');
    const rel = await callLLM({
      messages: [
        { role: 'system', content: 'You are a research librarian. Score topical relevance precisely. Output JSON only.' },
        {
          role: 'user',
          content: `RESEARCH QUESTION: "${query}"\n\nScore each numbered source:\n0 = off-topic (does not inform the question)\n1 = tangential (related domain, no usable evidence)\n2 = relevant\n3 = core evidence\nReturn {"scores":{"0":2,"1":0,...}} covering every index 0-${batch.length - 1}.\n\n${listing}`,
        },
      ],
      temperature: 0,
      jsonMode: true,
      maxTokens: 1200,
      enableCache: true,
      task: 'topic_classification',
    });
    addCost(rel.costUsd, costStep);
    const parsed = parseJson<{ scores?: Record<string, number> }>(rel.content);
    if (!parsed?.scores || Object.keys(parsed.scores).length === 0) return null;
    const dropIds = new Set<string>();
    batch.forEach((s: any, i: number) => {
      if (parsed.scores?.[String(i)] === 0 && s?.id) dropIds.add(s.id);
    });
    return { dropIds, screened: batch.length, costUsd: rel.costUsd };
  } catch (err) {
    console.warn(`${label} RELEVANCE SCREEN: failed (non-blocking):`, err);
    return null;
  }
}
