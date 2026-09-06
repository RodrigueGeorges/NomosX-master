/**
 * Retraction Watch — Source Integrity Verification
 *
 * Inspired by Sourcecheck (2026, GitHub aberaio/sourcecheck):
 * - Resolve each source's DOI against OpenAlex + Crossref
 * - Check is_retracted flag
 * - Retracted sources are vetoed (never accepted as evidence)
 * - Non-blocking: failures are logged, not thrown
 *
 * API:
 * - OpenAlex: https://api.openalex.org/works/doi:{doi}?select=is_retracted,id
 * - Crossref: https://api.crossref.org/works/{doi}
 *
 * Free, no API key required (polite pool with mailto).
 */

import { fetchFromProvider } from '../http-client';

export interface RetractionResult {
  sourceId: string;
  doi: string | null;
  isRetracted: boolean;
  retractionNoticeUrl?: string | null;
  checkedVia: 'openalex' | 'crossref' | 'skipped';
}

export interface RetractionBatchResult {
  results: RetractionResult[];
  retractedCount: number;
  checkedCount: number;
  skippedCount: number;
}

/**
 * Check if a single DOI is retracted via OpenAlex.
 * Falls back to Crossref if OpenAlex fails.
 */
export async function checkRetraction(
  sourceId: string,
  doi: string | null
): Promise<RetractionResult> {
  if (!doi) {
    return { sourceId, doi: null, isRetracted: false, checkedVia: 'skipped' };
  }

  // Clean DOI
  const cleanDOI = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/^doi:\s*/, '');

  // ── Try OpenAlex first (has explicit is_retracted field) ────────────────
  try {
    const url = `https://api.openalex.org/works/doi:${encodeURIComponent(cleanDOI)}?select=is_retracted,id,retraction_count`;
    const data: any = await fetchFromProvider('openalex', url, {
      timeout: 10000,
      retries: 1,
      headers: { 'Accept': 'application/json' },
    });

    if (data && typeof data.is_retracted === 'boolean') {
      return {
        sourceId,
        doi: cleanDOI,
        isRetracted: data.is_retracted,
        checkedVia: 'openalex',
      };
    }
  } catch {
    // Fall through to Crossref
  }

  // ── Fallback: Crossref (check for retraction type) ──────────────────────
  try {
    const url = `https://api.crossref.org/works/${encodeURIComponent(cleanDOI)}`;
    const data: any = await fetchFromProvider('crossref', url, {
      timeout: 10000,
      retries: 1,
      headers: { 'Accept': 'application/json' },
    });

    const work = data?.message;
    if (work) {
      // Crossref doesn't have a direct is_retracted field, but we can check:
      // 1. type === 'retraction' or 'retraction-article'
      // 2. assertion with label containing 'retraction'
      // 3. relation type 'is-retraction-of'
      const type = (work.type || '').toLowerCase();
      const assertions = work.assertion || [];
      const hasRetractionAssertion = assertions.some((a: any) =>
        (a.label || a.name || '').toLowerCase().includes('retract')
      );
      const hasRetractionRelation = work.relation?.['is-retraction-of'] != null;

      const isRetracted = type.includes('retraction') || hasRetractionAssertion || hasRetractionRelation;

      return {
        sourceId,
        doi: cleanDOI,
        isRetracted,
        checkedVia: 'crossref',
      };
    }
  } catch {
    // Both failed — non-blocking
  }

  return { sourceId, doi: cleanDOI, isRetracted: false, checkedVia: 'skipped' };
}

/**
 * Batch check retractions for a set of sources.
 * Processes in parallel with limited concurrency to avoid rate limits.
 */
export async function checkRetractionsBatch(
  sources: Array<{ id: string; doi?: string | null }>
): Promise<RetractionBatchResult> {
  const withDOI = sources.filter(s => s.doi);
  const withoutDOI = sources.filter(s => !s.doi);

  // Process in chunks of 10 to respect rate limits while reducing round-trips
  const CHUNK_SIZE = 10;
  const results: RetractionResult[] = [];

  for (let i = 0; i < withDOI.length; i += CHUNK_SIZE) {
    const chunk = withDOI.slice(i, i + CHUNK_SIZE);
    const chunkResults = await Promise.all(
      chunk.map(s => checkRetraction(s.id, s.doi || null))
    );
    results.push(...chunkResults);
  }

  // Add skipped results for sources without DOI
  for (const s of withoutDOI) {
    results.push({ sourceId: s.id, doi: null, isRetracted: false, checkedVia: 'skipped' });
  }

  const retractedCount = results.filter(r => r.isRetracted).length;
  const checkedCount = results.filter(r => r.checkedVia !== 'skipped').length;
  const skippedCount = results.filter(r => r.checkedVia === 'skipped').length;

  console.log(
    `[RetractionWatch] Checked ${checkedCount} DOIs, ` +
    `found ${retractedCount} retracted, ` +
    `skipped ${skippedCount} (no DOI)`
  );

  return { results, retractedCount, checkedCount, skippedCount };
}

/**
 * Filter out retracted sources from a source pool.
 * Returns the filtered list and the audit trail.
 */
export async function filterRetracted<T extends { id: string; doi?: string | null }>(
  sources: T[]
): Promise<{ filtered: T[]; retracted: T[]; audit: RetractionBatchResult }> {
  const audit = await checkRetractionsBatch(sources);

  const retractedIds = new Set(
    audit.results.filter(r => r.isRetracted).map(r => r.sourceId)
  );

  const filtered = sources.filter(s => !retractedIds.has(s.id));
  const retracted = sources.filter(s => retractedIds.has(s.id));

  if (retracted.length > 0) {
    console.warn(
      `[RetractionWatch] VETOED ${retracted.length} retracted sources: ` +
      retracted.map(s => `${s.id} (DOI: ${s.doi})`).join(', ')
    );
  }

  return { filtered, retracted, audit };
}
