
import { fetchFromProvider } from '../http-client';
import { invertedIndexToText } from '../text';
import { env } from '../env';

type Work = any;
type Resp = { results?: Work[] };

function normalizeDOI(doi: string | null): string | null {
  if (!doi) return null;
  return doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").toLowerCase();
}

// ── Concurrency limiter for OpenAlex ──────────────────────────────────────
// 30+ institutional providers (UN, IMF, World Bank, OECD, NBER, etc.)
// piggyback on searchOpenAlex(). A simple rate limiter is not enough
// because requests queue up and burst when released. This semaphore
// caps concurrent in-flight requests to 3, preventing 429 cascades.
const MAX_CONCURRENT_OPENALEX = 5;
let openAlexInFlight = 0;
const openAlexWaitQueue: Array<() => void> = [];

async function acquireOpenAlexSlot(): Promise<void> {
  if (openAlexInFlight < MAX_CONCURRENT_OPENALEX) {
    openAlexInFlight++;
    return;
  }
  await new Promise<void>((resolve) => openAlexWaitQueue.push(resolve));
  openAlexInFlight++;
}

function releaseOpenAlexSlot(): void {
  openAlexInFlight--;
  const next = openAlexWaitQueue.shift();
  if (next) next();
}

// ── V3.1: Auto-detect exhausted API key credits ────────────────────────────
// OpenAlex API keys have a credit budget. When credits run out, the key
// returns 429 even though the polite pool (mailto) would work fine.
// We detect this on first 429 and fall back to the polite pool for the rest of the session.
let openAlexKeyExhausted = false;
let openAlexKeyChecked = false;

async function checkOpenAlexKeyExhausted(): Promise<void> {
  if (!env.OPENALEX_API_KEY || openAlexKeyChecked) return;
  openAlexKeyChecked = true;
  try {
    const testUrl = `https://api.openalex.org/works?search=test&per-page=1&api_key=${env.OPENALEX_API_KEY}`;
    const resp = await fetch(testUrl, { signal: AbortSignal.timeout(5000) });
    await resp.body?.cancel();
    if (resp.status === 401 || resp.status === 403) {
      openAlexKeyExhausted = true;
      console.warn(`[OpenAlex] API key rejected (HTTP ${resp.status}) — falling back to polite pool (mailto)`);
      return;
    }
    if (resp.status === 429) {
      const remaining = resp.headers.get('x-ratelimit-remaining');
      if (remaining === '0') {
        openAlexKeyExhausted = true;
        console.warn('[OpenAlex] API key credits exhausted (x-ratelimit-remaining: 0) — falling back to polite pool (mailto)');
        return;
      }
    }
    console.log('[OpenAlex] API key OK — using premium tier');
  } catch { /* non-blocking — will retry with mailto on first 429 */ }
}

/**
 * Mark the API key as exhausted (called when we get a 429 with x-ratelimit-remaining: 0).
 * This immediately switches all subsequent requests to the polite pool.
 */
export function markOpenAlexKeyExhausted(): void {
  if (!openAlexKeyExhausted) {
    openAlexKeyExhausted = true;
    console.warn('[OpenAlex] API key marked as exhausted — switching to polite pool (mailto)');
  }
}

/** True when the provider rejected our api_key — the polite pool is the fix,
 * not a retry with the same credential. */
function isAuthRejection(error: unknown): boolean {
  return env.OPENALEX_API_KEY !== undefined && !openAlexKeyExhausted &&
    /HTTP (401|403)\b/i.test(error instanceof Error ? error.message : String(error));
}

// Check synchronously at module load (fire and forget)
export { checkOpenAlexKeyExhausted };

export async function searchOpenAlex(query: string, perPage = 25, options?: { filter?: string; group_by?: string }): Promise<any[]> {
  let retryWithPolitePool = false;
  const base = env.OPENALEX_API;
  let url = `${base}?search=${encodeURIComponent(query)}&per-page=${perPage}`;
  
  if (options?.filter) {
    url += `&filter=${encodeURIComponent(options.filter)}`;
  }

  if (options?.group_by) {
    url += `&group_by=${encodeURIComponent(options.group_by)}`;
  }

  // OpenAlex rate limits: a free api_key grants the highest throughput; otherwise
  // the "polite pool" (mailto) grants higher limits than anonymous. This matters
  // because many providers (OECD, WorldBank, IMF, NBER, WHO-GHO, RePEc) piggyback
  // on OpenAlex and cause concurrent bursts.
  // V3.1: If API key credits are exhausted, fall back to polite pool automatically.
  if (env.OPENALEX_API_KEY && !openAlexKeyExhausted) {
    url += `&api_key=${encodeURIComponent(env.OPENALEX_API_KEY)}`;
  } else {
    const mailto = env.UNPAYWALL_EMAIL || "contact@nomosx.com";
    url += `&mailto=${encodeURIComponent(mailto)}`;
  }
  
  await acquireOpenAlexSlot();
  try {
    const data = await fetchFromProvider<Resp>("openalex", url, { timeout: 20000, retries: 2 });
    
    const results = (data.results ?? []).map((w: any) => ({
      id: w.id,
      provider: "openalex",
      type: "paper",
      title: w.title || "",
      abstract: invertedIndexToText(w.abstract_inverted_index) || null,
      year: w.publication_year ?? null,
      doi: normalizeDOI(w.doi),
      url: w.primary_location?.landing_page_url ?? null,
      pdfUrl: w.primary_location?.pdf_url ?? null,
      oaStatus: w.open_access?.oa_status ?? (w.primary_location?.is_oa ? "oa" : null),
      authors: (w.authorships ?? []).map((a: any) => ({
        name: a.author?.display_name,
        orcid: a.author?.orcid?.replace("https://orcid.org/", ""),
      })).filter((a: any) => a.name),
      institutions: (w.authorships ?? []).flatMap((a: any) => 
        (a.institutions ?? []).map((i: any) => ({
          name: i.display_name,
          rorId: i.ror?.replace("https://ror.org/", ""),
        }))
      ).filter((i: any) => i.name),
      topics: (w.topics ?? []).map((t: any) => t.display_name).filter(Boolean),
      jelCodes: [],
      citationCount: w.cited_by_count ?? null,
      raw: w
    }));
    console.log(`[OpenAlex] Found ${results.length} works for "${query.slice(0, 50)}"`);
    return results;
  } catch (error: any) {
    if (isAuthRejection(error)) { markOpenAlexKeyExhausted(); retryWithPolitePool = true; }
    else console.error(`[OpenAlex] Search failed: ${error.message}`);
  } finally {
    releaseOpenAlexSlot();
  }
  // Retry AFTER releasing the concurrency slot — a recursive retry inside the
  // catch can deadlock when every in-flight request fails on auth at once.
  return retryWithPolitePool ? searchOpenAlex(query, perPage, options) : [];
}

/**
 * LOT 1.6: Get concept group counts from OpenAlex using group_by=concepts.id
 * Returns concepts with their work counts for a given query.
 * If 3-10 relevant concepts are found, they can be used for targeted searches.
 */
export async function getOpenAlexConceptGroups(query: string): Promise<{ conceptId: string; conceptName: string; count: number }[]> {
  let retryWithPolitePool = false;
  const base = env.OPENALEX_API;
  let url = `${base}?search=${encodeURIComponent(query)}&per-page=200&group_by=concepts.id`;

  if (env.OPENALEX_API_KEY && !openAlexKeyExhausted) {
    url += `&api_key=${encodeURIComponent(env.OPENALEX_API_KEY)}`;
  } else {
    const mailto = env.UNPAYWALL_EMAIL || "contact@nomosx.com";
    url += `&mailto=${encodeURIComponent(mailto)}`;
  }

  await acquireOpenAlexSlot();
  try {
    const data = await fetchFromProvider<{ group_by?: Array<{ key: string; key_display_name: string; count: number }> }>("openalex", url, { timeout: 20000, retries: 1 });
    const groups = data.group_by ?? [];
    const result = groups
      .map(g => ({ conceptId: g.key, conceptName: g.key_display_name, count: g.count }))
      .filter(g => g.count >= 3 && g.count <= 200)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    console.log(`[OpenAlex] group_by=concepts.id: ${result.length} relevant concepts for "${query.slice(0, 50)}"`);
    return result;
  } catch (error: any) {
    if (isAuthRejection(error)) { markOpenAlexKeyExhausted(); retryWithPolitePool = true; }
    else console.warn(`[OpenAlex] group_by failed (non-blocking): ${error.message}`);
  } finally {
    releaseOpenAlexSlot();
  }
  return retryWithPolitePool ? getOpenAlexConceptGroups(query) : [];
}

/**
 * V3.2: OpenAlex Semantic Search (2026 feature)
 *
 * OpenAlex launched semantic search in 2026 — embeddings-based retrieval
 * that understands query semantics better than keyword search.
 *
 * This function uses the new `search_filter` parameter with semantic matching.
 * Falls back to keyword search if semantic search is not available.
 *
 * Based on: OpenAlex 2026 release — semantic embeddings, PDF hosting, bulk CLI
 */
export async function searchOpenAlexSemantic(
  query: string,
  perPage = 25,
  options?: { filter?: string; minCitations?: number }
): Promise<any[]> {
  let retryWithPolitePool = false;
  const base = env.OPENALEX_API;

  // V3.2: Use semantic search endpoint (search_filter with semantic matching)
  // The new endpoint uses embeddings to find semantically similar works
  let url = `${base}?search=${encodeURIComponent(query)}&per-page=${perPage}&search_type=semantic`;

  if (options?.filter) {
    url += `&filter=${encodeURIComponent(options.filter)}`;
  }

  // Add minimum citations filter if specified
  if (options?.minCitations && options?.minCitations > 0) {
    const citedByFilter = `cited_by_count:>${options.minCitations}`;
    url += url.includes('filter=')
      ? `,${encodeURIComponent(citedByFilter)}`
      : `&filter=${encodeURIComponent(citedByFilter)}`;
  }

  // API key or polite pool
  if (env.OPENALEX_API_KEY && !openAlexKeyExhausted) {
    url += `&api_key=${encodeURIComponent(env.OPENALEX_API_KEY)}`;
  } else {
    const mailto = env.UNPAYWALL_EMAIL || "contact@nomosx.com";
    url += `&mailto=${encodeURIComponent(mailto)}`;
  }

  await acquireOpenAlexSlot();
  try {
    const data = await fetchFromProvider<Resp>("openalex", url, { timeout: 25000, retries: 2 });

    const results = (data.results ?? []).map((w: any) => ({
      id: w.id,
      provider: "openalex",
      type: "paper",
      title: w.title || "",
      abstract: invertedIndexToText(w.abstract_inverted_index) || null,
      year: w.publication_year ?? null,
      doi: normalizeDOI(w.doi),
      url: w.primary_location?.landing_page_url ?? null,
      pdfUrl: w.primary_location?.pdf_url ?? null,
      oaStatus: w.open_access?.oa_status ?? (w.primary_location?.is_oa ? "oa" : null),
      authors: (w.authorships ?? []).map((a: any) => ({
        name: a.author?.display_name,
        orcid: a.author?.orcid?.replace("https://orcid.org/", ""),
      })).filter((a: any) => a.name),
      institutions: (w.authorships ?? []).flatMap((a: any) =>
        (a.institutions ?? []).map((i: any) => ({
          name: i.display_name,
          rorId: i.ror?.replace("https://ror.org/", ""),
        }))
      ).filter((i: any) => i.name),
      topics: (w.topics ?? []).map((t: any) => t.display_name).filter(Boolean),
      jelCodes: [],
      citationCount: w.cited_by_count ?? null,
      raw: w
    }));

    console.log(`[OpenAlex-Semantic] Found ${results.length} works for "${query.slice(0, 50)}" (semantic search)`);
    return results;
  } catch (error: any) {
    if (isAuthRejection(error)) { markOpenAlexKeyExhausted(); retryWithPolitePool = true; }
    else console.warn(`[OpenAlex-Semantic] Semantic search failed, falling back to keyword: ${error.message}`);
  } finally {
    releaseOpenAlexSlot();
  }
  // Keyword fallback after the slot is released (avoids the retry-deadlock);
  // an auth rejection already flipped the next call to the polite pool.
  void retryWithPolitePool;
  return searchOpenAlex(query, perPage, { filter: options?.filter });
}

/**
 * V3.2: Batch fetch OpenAlex works by DOI list
 *
 * Useful for verifying citations in bulk — pass a list of DOIs and get
 * back metadata for all of them in one request.
 */
export async function batchFetchByDoi(dois: string[]): Promise<any[]> {
  if (dois.length === 0) return [];
  let retryWithPolitePool = false;

  const base = env.OPENALEX_API;
  // OpenAlex supports filter=doi:doi1|doi2|doi3 for batch lookup
  const doiFilter = dois.slice(0, 50).map(d => d.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')).join('|');
  let url = `${base}?filter=doi:${encodeURIComponent(doiFilter)}&per-page=50`;

  if (env.OPENALEX_API_KEY && !openAlexKeyExhausted) {
    url += `&api_key=${encodeURIComponent(env.OPENALEX_API_KEY)}`;
  } else {
    const mailto = env.UNPAYWALL_EMAIL || "contact@nomosx.com";
    url += `&mailto=${encodeURIComponent(mailto)}`;
  }

  await acquireOpenAlexSlot();
  try {
    const data = await fetchFromProvider<Resp>("openalex", url, { timeout: 20000, retries: 1 });
    const results = (data.results ?? []).map((w: any) => ({
      doi: normalizeDOI(w.doi),
      title: w.title || '',
      year: w.publication_year ?? null,
      citationCount: w.cited_by_count ?? 0,
      exists: true,
    }));
    console.log(`[OpenAlex-Batch] Verified ${results.length}/${dois.length} DOIs`);
    return results;
  } catch (error: any) {
    if (isAuthRejection(error)) { markOpenAlexKeyExhausted(); retryWithPolitePool = true; }
    else console.warn(`[OpenAlex-Batch] Batch fetch failed: ${error.message}`);
  } finally {
    releaseOpenAlexSlot();
  }
  return retryWithPolitePool ? batchFetchByDoi(dois) : [];
}
