/**
 * PatentsView PatentSearch API (USPTO / PatentsView) - Stable patent search provider
 *
 * Why:
 * - Google Patents scraping is brittle and frequently blocked.
 * - PatentsView provides a purpose-built PatentSearch API (ElasticSearch-backed) with stable JSON.
 *
 * Docs:
 * - Endpoint: https://search.patentsview.org/api/v1/patent/
 * - Auth: header X-Api-Key: <key>
 * - Query (q): JSON object (supports _text_any on patent_title / patent_abstract)
 * - Sorting (s): JSON array of sort objects
 * - Options (o): JSON object, notably { size: <n> }
 */

import { fetchFromProvider } from '../../http-client';

const PATENTSVIEW_BASE = "https://search.patentsview.org/api/v1/patent/";

function getApiKey(): string | null {
  return (
    process.env.PATENTSVIEW_API_KEY ||
    process.env.PATENTSVIEW_KEY ||
    process.env.PATENTSVIEW_X_API_KEY ||
    null
  );
}

function safeYear(p: any): number {
  const y = p?.patent_year;
  if (typeof y === "number") return y;
  const d = p?.patent_date;
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d)) return Number(d.slice(0, 4));
  return new Date().getFullYear();
}

function buildQueryObject(query: string): any {
  const q = (query || "").trim();

  // PatentsView requires q always; if empty, fetch recent patents by date range (last 10 years)
  if (!q) {
    const year = new Date().getFullYear();
    return {
      _and: [
        { _gte: { patent_date: `${year - 10}-01-01` } },
        { _lte: { patent_date: `${year}-12-31` } },
      ],
    };
  }

  // Full-text search in title OR abstract
  return {
    _or: [
      { _text_any: { patent_title: q } },
      { _text_any: { patent_abstract: q } },
    ],
  };
}

function buildSearchUrl(params: {
  q: any;
  f: string[];
  s: Array<Record<string, "asc" | "desc">>;
  o: any;
}): string {
  const sp = new URLSearchParams();
  sp.set("q", JSON.stringify(params.q));
  sp.set("f", JSON.stringify(params.f));
  sp.set("s", JSON.stringify(params.s));
  sp.set("o", JSON.stringify(params.o));
  return `${PATENTSVIEW_BASE}?${sp.toString()}`;
}

export async function searchPatentsView(query: string, limit: number = 10): Promise<any[]> {
  console.log(`[PatentsView] Searching for: "${query}" (limit: ${limit})`);

  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[PatentsView] Missing PATENTSVIEW_API_KEY - using fallback results");
    return generatePatentsViewFallback(query, limit);
  }

  try {
    const q = buildQueryObject(query);

    // Fields we want back
    const f = [
      "patent_id",
      "patent_title",
      "patent_date",
      "patent_year",
      "patent_abstract",
      "patent_num_times_cited_by_us_patents",
      "patent_type",
    ];

    // Sort by most recent first, then ID
    const s: Array<Record<string, "asc" | "desc">> = [
      { patent_date: "desc" },
      { patent_id: "asc" },
    ];

    const o = {
      size: Math.min(1000, Math.max(1, limit)),
      exclude_withdrawn: true,
      pad_patent_id: false,
    };

    const url = buildSearchUrl({ q, f, s, o });

    const data = await fetchFromProvider<any>("patentsview", url, {
      timeout: 30000,
      retries: 2,
      retryDelay: 1000,
      headers: {
        Accept: "application/json",
        "X-Api-Key": apiKey,
      },
    });

    const patents = Array.isArray(data?.patents) ? data.patents : [];

    return patents.slice(0, limit).map((p: any) => {
      const patentId = String(p?.patent_id || "").trim();
      const title = String(p?.patent_title || "").trim() || `Patent ${patentId}`;
      const abstract = String(p?.patent_abstract || "").trim();
      const patentDate = typeof p?.patent_date === "string" ? p.patent_date : null;

      return {
        id: `google-patents:pv:${patentId}`,
        provider: "google-patents", // keep provider id stable for existing configs
        type: "patent",
        title,
        abstract: abstract ? abstract.slice(0, 1200) : `USPTO granted patent (PatentsView) matching query: ${query}`,
        // Use API URL as canonical reference (works with API key). We avoid Google Patents dependency.
        url: `${PATENTSVIEW_BASE}?q=${encodeURIComponent(JSON.stringify({ patent_id: patentId }))}`,
        pdfUrl: "",
        year: safeYear(p),
        authors: [],
        citationCount: typeof p?.patent_num_times_cited_by_us_patents === "number" ? p.patent_num_times_cited_by_us_patents : 0,
        oaStatus: "open",
        documentType: "patent",
        issuer: "USPTO (PatentsView)",
        issuerType: "patent-office",
        classification: "technology",
        publishedDate: patentDate ? new Date(patentDate).toISOString() : new Date().toISOString(),
        language: "en",
        contentFormat: "json",
        raw: {
          source: "patentsview",
          patent: p,
        },
      };
    });
  } catch (err: any) {
    console.warn(`[PatentsView] API failed: ${err?.message || String(err)} - using fallback`);
    return generatePatentsViewFallback(query, limit);
  }
}

function generatePatentsViewFallback(query: string, limit: number): Promise<any[]> {
  const year = new Date().getFullYear();
  const items = [
    {
      title: `USPTO Patent: ${query} (fallback)` ,
      abstract: `Fallback patent entry for "${query}". Configure PATENTSVIEW_API_KEY to fetch real USPTO patents via PatentsView.`
    },
    {
      title: `USPTO Patent methods for ${query} systems (fallback)` ,
      abstract: `Fallback patent entry for "${query}". Provide PATENTSVIEW_API_KEY for real results.`
    },
    {
      title: `${query} apparatus and implementation (fallback)` ,
      abstract: `Fallback patent entry for "${query}". Provide PATENTSVIEW_API_KEY for real results.`
    }
  ];

  const results = items.slice(0, limit).map((it, i) => ({
    id: `google-patents:pv-fallback-${i}`,
    provider: "google-patents",
    type: "patent",
    title: it.title,
    abstract: it.abstract,
    url: null,
    pdfUrl: "",
    year,
    authors: [],
    citationCount: 0,
    oaStatus: "open",
    documentType: "patent",
    issuer: "USPTO (PatentsView)",
    issuerType: "patent-office",
    classification: "technology",
    publishedDate: new Date().toISOString(),
    language: "en",
    contentFormat: "json",
    raw: { source: "patentsview", fallback: true },
  }));

  return Promise.resolve(results);
}
