/**
 * Semantic Scholar Graph API — Enhanced Provider
 * 200M+ papers with citation graph, influence scores, and TLDR summaries.
 * Free API, no key required (rate limit: 100 req/5min).
 * 
 * KEY VALUE: Citation graph traversal, influence scoring, TLDR summaries.
 * Complements OpenAlex with AI-generated paper summaries and influence metrics.
 * API docs: https://api.semanticscholar.org/api-docs/graph
 */

import { fetchFromProvider } from '../http-client';
import { env } from '../env';

export async function searchSemanticScholarGraph(query: string, limit = 25): Promise<any[]> {
  const fields = "paperId,title,abstract,year,citationCount,influentialCitationCount,authors,openAccessPdf,url,externalIds,venue,publicationTypes,tldr,fieldsOfStudy";
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${Math.min(limit, 50)}&fields=${fields}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (env.SEMANTICSCHOLAR_API_KEY) {
    headers['x-api-key'] = env.SEMANTICSCHOLAR_API_KEY;
  }

  try {
    const data: any = await fetchFromProvider("semantic-scholar-graph", url, {
      timeout: 15000,
      headers,
    });

    const items = data?.data || [];
    console.log(`[SemanticScholar-Graph] Found ${items.length} papers`);

    return items
      .filter((p: any) => p.title && p.abstract && p.abstract.length >= 150)
      .map((p: any) => {
        const abstractLen = p.abstract?.length || 0;

        return {
          id: `s2:${p.paperId}`,
          provider: "semantic-scholar-graph",
          type: "paper",
          title: p.title || "",
          abstract: p.abstract || null,
          year: p.year ?? null,
          doi: p.externalIds?.DOI || null,
          url: p.url || `https://www.semanticscholar.org/paper/${p.paperId}`,
          pdfUrl: p.openAccessPdf?.url ?? null,
          oaStatus: p.openAccessPdf?.url ? "oa" : null,
          authors: (p.authors || [])
            .slice(0, 10)
            .map((a: any) => ({ name: a.name, authorId: a.authorId }))
            .filter((a: any) => a.name),
          institutions: [],
          topics: p.fieldsOfStudy || [],
          citationCount: p.citationCount ?? 0,
          influentialCitationCount: p.influentialCitationCount ?? 0,
          tldr: p.tldr?.text || null,
          venue: p.venue || null,
          contentLength: abstractLen,
          raw: p,
        };
      });
  } catch (error: any) {
    console.error(`[SemanticScholar-Graph] Search failed: ${error.message}`);
    return [];
  }
}

/**
 * S2 Bulk Search — /paper/search/bulk
 * Supports boolean queries (+, |, -, "", *, ~) and paginates up to 10M results.
 * No relevance ranking — intended for large corpus retrieval.
 * Returns up to 1000 papers per call; use token for pagination.
 */
export async function searchSemanticScholarBulk(
  query: string,
  limit = 100,
  options?: {
    fieldsOfStudy?: string[];
    year?: string;
    openAccessPdf?: boolean;
    minCitationCount?: number;
    publicationTypes?: string[];
    token?: string;
    sort?: string;
  }
): Promise<{ papers: any[]; total?: number; token?: string }> {
  const fields = "paperId,title,abstract,year,citationCount,influentialCitationCount,authors,openAccessPdf,url,externalIds,venue,publicationTypes,fieldsOfStudy,s2FieldsOfStudy";
  const params = new URLSearchParams();
  params.set("query", query);
  params.set("fields", fields);

  if (options?.fieldsOfStudy?.length) params.set("fieldsOfStudy", options.fieldsOfStudy.join(","));
  if (options?.year) params.set("year", options.year);
  if (options?.openAccessPdf) params.set("openAccessPdf", "");
  if (options?.minCitationCount) params.set("minCitationCount", String(options.minCitationCount));
  if (options?.publicationTypes?.length) params.set("publicationTypes", options.publicationTypes.join(","));
  if (options?.token) params.set("token", options.token);
  if (options?.sort) params.set("sort", options.sort);

  const url = `https://api.semanticscholar.org/graph/v1/paper/search/bulk?${params.toString()}`;

  const s2Headers: Record<string, string> = { Accept: "application/json" };
  if (env.SEMANTICSCHOLAR_API_KEY) s2Headers["x-api-key"] = env.SEMANTICSCHOLAR_API_KEY;

  try {
    const data: any = await fetchFromProvider("semantic-scholar-graph", url, {
      timeout: 30000,
      retries: 3,
      headers: s2Headers,
    });

    const items = data?.data || [];
    console.log(`[S2-Bulk] Found ${items.length} papers (total: ${data?.total ?? "unknown"})`);

    const papers = items
      .filter((p: any) => p.title)
      .map((p: any) => ({
        id: `s2:${p.paperId}`,
        provider: "semantic-scholar-graph",
        type: "paper",
        title: p.title || "",
        abstract: p.abstract || null,
        year: p.year ?? null,
        doi: p.externalIds?.DOI || null,
        url: p.url || `https://www.semanticscholar.org/paper/${p.paperId}`,
        pdfUrl: p.openAccessPdf?.url ?? null,
        oaStatus: p.openAccessPdf?.url ? "oa" : null,
        authors: (p.authors || [])
          .slice(0, 10)
          .map((a: any) => ({ name: a.name, authorId: a.authorId }))
          .filter((a: any) => a.name),
        institutions: [],
        topics: p.fieldsOfStudy || [],
        citationCount: p.citationCount ?? 0,
        influentialCitationCount: p.influentialCitationCount ?? 0,
        venue: p.venue || null,
        raw: p,
      }));

    return {
      papers,
      total: data?.total ? Number(data.total) : undefined,
      token: data?.token,
    };
  } catch (error: any) {
    console.error(`[S2-Bulk] Search failed: ${error.message}`);
    return { papers: [] };
  }
}

/**
 * S2 Author Enrichment — /author/search and /author/{id}
 * Returns h-index, citationCount, paperCount, affiliations (with ROR IDs).
 * Includes circuit breaker: after 5 consecutive failures, stops calling S2.
 */
let s2AuthorFailures = 0;
const S2_AUTHOR_MAX_FAILURES = 5;
const s2AuthorCache = new Map<string, any>();

export async function enrichAuthorS2(authorName: string): Promise<{
  authorId?: string;
  name?: string;
  hIndex?: number;
  citationCount?: number;
  paperCount?: number;
  affiliations?: string[];
  normalizedAffiliations?: Array<{ rorId: string; rorDisplayName: string }>;
} | null> {
  // Circuit breaker: skip S2 after too many consecutive failures
  if (s2AuthorFailures >= S2_AUTHOR_MAX_FAILURES) {
    return null;
  }

  // Cache: avoid duplicate calls for same author
  const cacheKey = authorName.toLowerCase().trim();
  if (s2AuthorCache.has(cacheKey)) {
    return s2AuthorCache.get(cacheKey);
  }

  const fields = "authorId,name,hIndex,citationCount,paperCount,affiliations,normalizedAffiliations";
  const url = `https://api.semanticscholar.org/graph/v1/author/search?query=${encodeURIComponent(authorName)}&fields=${fields}&limit=1`;

  const s2Headers: Record<string, string> = { Accept: "application/json" };
  if (env.SEMANTICSCHOLAR_API_KEY) s2Headers["x-api-key"] = env.SEMANTICSCHOLAR_API_KEY;

  try {
    const data: any = await fetchFromProvider("semantic-scholar-graph", url, {
      timeout: 10000,
      retries: 0,
      headers: s2Headers,
    });

    const author = data?.data?.[0];
    if (!author) {
      s2AuthorCache.set(cacheKey, null);
      return null;
    }

    const result = {
      authorId: author.authorId,
      name: author.name,
      hIndex: author.hIndex ? Number(author.hIndex) : undefined,
      citationCount: author.citationCount ? Number(author.citationCount) : undefined,
      paperCount: author.paperCount ? Number(author.paperCount) : undefined,
      affiliations: author.affiliations || [],
      normalizedAffiliations: author.normalizedAffiliations || [],
    };
    s2AuthorCache.set(cacheKey, result);
    s2AuthorFailures = 0; // reset on success
    return result;
  } catch (error: any) {
    s2AuthorFailures++;
    if (s2AuthorFailures === S2_AUTHOR_MAX_FAILURES) {
      console.warn(`[S2-Author] Circuit breaker tripped after ${S2_AUTHOR_MAX_FAILURES} consecutive failures — skipping further S2 author enrichment`);
    }
    s2AuthorCache.set(cacheKey, null);
    return null;
  }
}
