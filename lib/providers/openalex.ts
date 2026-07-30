
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

export async function searchOpenAlex(query: string, perPage = 25, options?: { filter?: string; group_by?: string }): Promise<any[]> {
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
  if (env.OPENALEX_API_KEY) {
    url += `&api_key=${encodeURIComponent(env.OPENALEX_API_KEY)}`;
  } else {
    const mailto = env.UNPAYWALL_EMAIL || "contact@nomosx.com";
    url += `&mailto=${encodeURIComponent(mailto)}`;
  }
  
  await acquireOpenAlexSlot();
  try {
    const data = await fetchFromProvider<Resp>("openalex", url, { timeout: 20000, retries: 3 });
    
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
    console.error(`[OpenAlex] Search failed: ${error.message}`);
    return [];
  } finally {
    releaseOpenAlexSlot();
  }
}

/**
 * LOT 1.6: Get concept group counts from OpenAlex using group_by=concepts.id
 * Returns concepts with their work counts for a given query.
 * If 3-10 relevant concepts are found, they can be used for targeted searches.
 */
export async function getOpenAlexConceptGroups(query: string): Promise<{ conceptId: string; conceptName: string; count: number }[]> {
  const base = env.OPENALEX_API;
  let url = `${base}?search=${encodeURIComponent(query)}&per-page=200&group_by=concepts.id`;

  if (env.OPENALEX_API_KEY) {
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
    console.warn(`[OpenAlex] group_by failed (non-blocking): ${error.message}`);
    return [];
  } finally {
    releaseOpenAlexSlot();
  }
}
