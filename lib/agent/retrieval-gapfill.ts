/**
 * Retrieval Gap-Fill — CRAG-style corrective retrieval.
 *
 * Corrective RAG (arXiv 2401.15884): evaluate retrieval quality BEFORE
 * generation and trigger targeted re-retrieval when coverage is deficient —
 * rather than discovering the gap after the report is written.
 *
 * NomosX already detects coverage gaps (CARE missingConcepts at SCOUT K10)
 * but only logged them. This module closes the loop: missing concepts become
 * targeted queries, run against a bounded set of fast providers, deduped
 * against the existing pool, and merged into the final source set.
 *
 * Bounded: max 4 concepts → max 4 queries × 3 providers × ~8 results.
 */

import { searchTavily } from '../providers/tavily-provider';
import { searchExa } from '../providers/exa-provider';
import { searchExtendedProviders } from '../providers/registry-bridge';

export interface GapFillResult {
  added: any[];
  queriesRun: string[];
  conceptsTargeted: string[];
  rawFound: number;
  durationMs: number;
}

/**
 * Run targeted gap-fill searches for concepts missing from the retrieved pool.
 *
 * @param baseQuery - original research query (context for query building)
 * @param missingConcepts - concepts CARE flagged as uncovered
 * @param existingSources - current pool (for dedup by url/doi/id)
 * @param maxConcepts - cap on concepts to chase (default 4)
 */
export async function gapFillMissingConcepts(
  baseQuery: string,
  missingConcepts: string[],
  existingSources: any[],
  maxConcepts = 4,
): Promise<GapFillResult> {
  const start = Date.now();
  const concepts = missingConcepts.slice(0, maxConcepts);
  if (concepts.length === 0) {
    return { added: [], queriesRun: [], conceptsTargeted: [], rawFound: 0, durationMs: 0 };
  }

  // Build targeted queries: "<base topic> <missing concept>" — the concept
  // is already a phrase like "international sovereignty norms", so appending
  // it to the topic anchors the search without needing an LLM rewrite.
  const anchor = baseQuery.split(/[?:]/)[0].trim().slice(0, 120);
  const queries = concepts.map(c => `${anchor} ${c}`.slice(0, 250));

  // Dedup keys from existing pool
  const seen = new Set<string>();
  for (const s of existingSources) {
    if (s?.id) seen.add(`id:${s.id}`);
    if (s?.url) seen.add(`url:${String(s.url).replace(/\/$/, '').toLowerCase()}`);
    if (s?.doi) seen.add(`doi:${String(s.doi).toLowerCase()}`);
  }

  const allPromises: Promise<any[]>[] = [];
  for (const q of queries) {
    allPromises.push(
      searchTavily(q, 8).catch(() => []),
      searchExa(q, 8).catch(() => []),
      searchExtendedProviders(q, { providers: ['openalex', 'crossref'], limit: 8 }).catch(() => []),
    );
  }

  const settled = await Promise.allSettled(allPromises);
  const found: any[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') found.push(...r.value);
  }

  // Dedup + minimum quality floor (gap-fill must add signal, not noise)
  const added: any[] = [];
  for (const s of found) {
    if (!s) continue;
    const urlKey = s.url ? `url:${String(s.url).replace(/\/$/, '').toLowerCase()}` : null;
    const doiKey = s.doi ? `doi:${String(s.doi).toLowerCase()}` : null;
    const idKey = s.id ? `id:${s.id}` : null;
    if ((idKey && seen.has(idKey)) || (urlKey && seen.has(urlKey)) || (doiKey && seen.has(doiKey))) continue;
    if (!s.title || String(s.title).length < 8) continue;
    const text = (s.abstract || '') + (s.title || '');
    if (text.length < 60) continue;
    if (idKey) seen.add(idKey);
    if (urlKey) seen.add(urlKey);
    if (doiKey) seen.add(doiKey);
    added.push({ ...s, _gapFill: true });
  }

  console.log(`[GAP-FILL] ${concepts.length} missing concepts → ${queries.length} queries → ${found.length} raw → +${added.length} new sources (${((Date.now() - start) / 1000).toFixed(1)}s)`);

  return {
    added, queriesRun: queries, conceptsTargeted: concepts,
    rawFound: found.length, durationMs: Date.now() - start,
  };
}
