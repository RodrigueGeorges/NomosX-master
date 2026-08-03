import { getRateLimiter } from '../http-client';

/**
 * NomosX News SCOUT Providers
 * 
 * SCOUT-compatible wrappers for real-time news sources.
 * Returns the same format as academic providers so they integrate
 * directly into the SCOUT → INDEX → RANK pipeline.
 * 
 * Providers:
 * 1. GDELT DOC API (free, no key) — Global event monitoring, 100+ languages
 * 2. NewsAPI (NEWSAPI_KEY) — Reuters, AP, BBC, Al Jazeera headlines
 * 3. MediaStack (MEDIASTACK_KEY) — 7500+ sources, real-time news
 * 4. TheNewsAPI (THENEWSAPI_KEY) — Business & tech news aggregator
 * 5. GNews (GNEWS_KEY) — Google News alternative API
 * 6. EventRegistry (EVENTREGISTRY_KEY) — News analytics & event detection
 */

// ============================================================================
// TYPES
// ============================================================================

interface ScoutNewsResult {
  id: string;
  provider: string;
  type: string;
  title: string;
  abstract: string | null;
  url: string | null;
  pdfUrl: string;
  year: number;
  authors: string[];
  citationCount: number;
  oaStatus: string;
  documentType: string;
  publishedDate: string | null;
  doi: string | null;
  topics: string[];
  jelCodes: string[];
  institutions: { name: string }[];
  raw: any;
}

function cleanText(text: string): string {
  return text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function makeId(provider: string, raw: string): string {
  const slug = raw.replace(/[^a-z0-9]/gi, '-').slice(0, 60).toLowerCase();
  return `${provider}:${slug}`;
}

/**
 * Shared retry helper for news providers: retries on 429 and 5xx with backoff.
 * Returns null after exhausting retries (callers log and return []).
 */
async function fetchNewsWithRetry(
  label: string,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
  retries = 2
): Promise<Response | null> {
  const { timeoutMs = 10000, ...rest } = init;
  let res: Response | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      res = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err: any) {
      if (attempt === retries) {
        console.warn(`[SCOUT/${label}] fetch error: ${err.message}`);
        return null;
      }
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (res.ok) return res;
    // Retry only on rate limit / server errors
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10);
      const backoffMs = Math.max(retryAfter * 1000, 2000 * (attempt + 1));
      console.warn(`[SCOUT/${label}] HTTP ${res.status}, retry ${attempt + 1}/${retries} in ${backoffMs}ms`);
      await new Promise(r => setTimeout(r, backoffMs));
      continue;
    }
    console.warn(`[SCOUT/${label}] HTTP ${res.status}`);
    return null;
  }
  return null;
}

// ============================================================================
// 1. GDELT DOC API (FREE — no key required)
// ============================================================================

/**
 * Search GDELT for real-time news articles.
 * Free API, no rate limits (soft), returns up to 250 articles per request.
 * Covers 100+ languages, 15-minute update cycle.
 */
export async function searchGDELTNews(query: string, limit = 30): Promise<ScoutNewsResult[]> {
  try {
    // GDELT rejects keywords shorter than 3 chars — filter them out
    const cleanQuery = query.split(/\s+/).filter(w => w.length >= 3).join(' ').trim();
    if (!cleanQuery || cleanQuery.length < 5) {
      console.warn(`[SCOUT/GDELT] Query too short after filtering, skipping`);
      return [];
    }
    const encoded = encodeURIComponent(cleanQuery);
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encoded}&mode=ArtList&maxrecords=${Math.min(limit, 250)}&format=json&sort=DateDesc&timespan=14d`;

    // GDELT soft-rate-limits (~1 req / 5s) → use rate limiter to serialize
    const limiter = getRateLimiter('gdelt-news');
    if (limiter) await limiter.acquire();

    let res: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'NomosX Research Bot (+https://nomosx.com)' },
      });
      if (res.status !== 429) break;
      const backoffMs = 5000 * (attempt + 1);
      console.warn(`[SCOUT/GDELT] HTTP 429, retry ${attempt + 1}/2 in ${backoffMs}ms`);
      await new Promise(r => setTimeout(r, backoffMs));
    }
    if (!res || !res.ok) {
      console.warn(`[SCOUT/GDELT] HTTP ${res?.status ?? 'no-response'}`);
      return [];
    }

    // GDELT returns plain text errors ("One or more errors...") instead of JSON
    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      console.warn(`[SCOUT/GDELT] Non-JSON response: ${text.slice(0, 120)}`);
      return [];
    }
    const articles: any[] = data?.articles || [];

    return articles.slice(0, limit).map((a: any) => {
      const date = a.seendate
        ? new Date(a.seendate.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, '$1-$2-$3T$4:$5:$6Z'))
        : new Date();
      return {
        id: makeId('gdelt-news', a.url || a.title || ''),
        provider: 'gdelt-news',
        type: 'news-article',
        title: cleanText(a.title || ''),
        abstract: `[${a.domain || 'GDELT'}] ${cleanText(a.title || '')}. Source country: ${a.sourcecountry || 'unknown'}. Language: ${a.language || 'English'}.`,
        url: a.url || null,
        pdfUrl: '',
        year: date.getFullYear(),
        authors: [a.domain || 'Unknown'],
        citationCount: 0,
        oaStatus: 'open',
        documentType: 'news',
        publishedDate: date.toISOString().split('T')[0],
        doi: null,
        topics: [],
        jelCodes: [],
        institutions: a.domain ? [{ name: a.domain }] : [],
        raw: a,
      };
    });
  } catch (e: any) {
    console.warn(`[SCOUT/GDELT] Error: ${e.message}`);
    return [];
  }
}

// ============================================================================
// 2. NewsAPI (Reuters, AP, BBC, Al Jazeera) — requires NEWSAPI_KEY
// ============================================================================

/**
 * Search NewsAPI for headlines from Reuters, AP, BBC, etc.
 * Requires NEWSAPI_KEY environment variable.
 * Free tier: 100 requests/day, 100 articles/request.
 */
export async function searchNewsAPI(query: string, limit = 30): Promise<ScoutNewsResult[]> {
  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey) {
    console.log('[SCOUT/NewsAPI] No NEWSAPI_KEY set, skipping');
    return [];
  }

  try {
    const encoded = encodeURIComponent(query);
    const url = `https://newsapi.org/v2/everything?q=${encoded}&sortBy=publishedAt&pageSize=${Math.min(limit, 100)}&language=en&apiKey=${apiKey}`;

    const res = await fetchNewsWithRetry('NewsAPI', url);
    if (!res) return [];

    const data = await res.json();
    const articles: any[] = data?.articles || [];

    return articles.slice(0, limit).map((a: any) => {
      const date = a.publishedAt ? new Date(a.publishedAt) : new Date();
      const sourceName = a.source?.name || 'NewsAPI';
      return {
        id: makeId('newsapi', a.url || a.title || ''),
        provider: 'newsapi',
        type: 'news-article',
        title: cleanText(a.title || ''),
        abstract: cleanText(a.description || a.content || a.title || ''),
        url: a.url || null,
        pdfUrl: '',
        year: date.getFullYear(),
        authors: a.author ? [a.author] : [sourceName],
        citationCount: 0,
        oaStatus: 'open',
        documentType: 'news',
        publishedDate: date.toISOString().split('T')[0],
        doi: null,
        topics: [],
        jelCodes: [],
        institutions: [{ name: sourceName }],
        raw: a,
      };
    });
  } catch (e: any) {
    console.warn(`[SCOUT/NewsAPI] Error: ${e.message}`);
    return [];
  }
}

// ============================================================================
// 3. MediaStack (7500+ sources) — requires MEDIASTACK_KEY
// ============================================================================

/**
 * Search MediaStack for global news coverage.
 * Requires MEDIASTACK_KEY environment variable.
 * Free tier: 500 requests/month, 25 results/request.
 */
export async function searchMediaStack(query: string, limit = 25): Promise<ScoutNewsResult[]> {
  const apiKey = process.env.MEDIASTACK_KEY;
  if (!apiKey) {
    console.log('[SCOUT/MediaStack] No MEDIASTACK_KEY set, skipping');
    return [];
  }

  try {
    const encoded = encodeURIComponent(query);
    // MediaStack free tier uses HTTP only
    const url = `http://api.mediastack.com/v1/news?access_key=${apiKey}&keywords=${encoded}&limit=${Math.min(limit, 100)}&languages=en,fr&sort=published_desc`;

    const res = await fetchNewsWithRetry('MediaStack', url);
    if (!res) return [];

    const data = await res.json();
    const articles: any[] = data?.data || [];

    return articles.slice(0, limit).map((a: any) => {
      const date = a.published_at ? new Date(a.published_at) : new Date();
      const sourceName = a.source || 'MediaStack';
      return {
        id: makeId('mediastack', a.url || a.title || ''),
        provider: 'mediastack',
        type: 'news-article',
        title: cleanText(a.title || ''),
        abstract: cleanText(a.description || a.title || ''),
        url: a.url || null,
        pdfUrl: '',
        year: date.getFullYear(),
        authors: a.author ? [a.author] : [sourceName],
        citationCount: 0,
        oaStatus: 'open',
        documentType: 'news',
        publishedDate: date.toISOString().split('T')[0],
        doi: null,
        topics: a.category ? [a.category] : [],
        jelCodes: [],
        institutions: [{ name: sourceName }],
        raw: a,
      };
    });
  } catch (e: any) {
    console.warn(`[SCOUT/MediaStack] Error: ${e.message}`);
    return [];
  }
}

// ============================================================================
// 4. TheNewsAPI — requires THENEWSAPI_KEY
// ============================================================================

/**
 * Search TheNewsAPI for business & tech news.
 * Requires THENEWSAPI_KEY environment variable.
 * Free tier: 3 requests/day (use sparingly), 3 results/request.
 */
export async function searchTheNewsAPI(query: string, limit = 30): Promise<ScoutNewsResult[]> {
  const apiKey = process.env.THENEWSAPI_KEY;
  if (!apiKey) {
    console.log('[SCOUT/TheNewsAPI] No THENEWSAPI_KEY set, skipping');
    return [];
  }

  try {
    const encoded = encodeURIComponent(query);
    const url = `https://api.thenewsapi.com/v1/news/all?api_token=${apiKey}&search=${encoded}&language=en&limit=${Math.min(limit, 50)}&sort=published_at`;

    const res = await fetchNewsWithRetry('TheNewsAPI', url);
    if (!res) return [];

    const data = await res.json();
    const articles: any[] = data?.data || [];

    return articles.slice(0, limit).map((a: any) => {
      const date = a.published_at ? new Date(a.published_at) : new Date();
      const sourceName = a.source || 'TheNewsAPI';
      return {
        id: makeId('thenewsapi', a.url || a.uuid || a.title || ''),
        provider: 'thenewsapi',
        type: 'news-article',
        title: cleanText(a.title || ''),
        abstract: cleanText(a.description || a.snippet || a.title || ''),
        url: a.url || null,
        pdfUrl: '',
        year: date.getFullYear(),
        authors: [sourceName],
        citationCount: 0,
        oaStatus: 'open',
        documentType: 'news',
        publishedDate: date.toISOString().split('T')[0],
        doi: null,
        topics: a.categories || [],
        jelCodes: [],
        institutions: [{ name: sourceName }],
        raw: a,
      };
    });
  } catch (e: any) {
    console.warn(`[SCOUT/TheNewsAPI] Error: ${e.message}`);
    return [];
  }
}

// ============================================================================
// 5. GNews — requires GNEWS_KEY
// ============================================================================

/**
 * Search GNews for curated news from Google News sources.
 * Requires GNEWS_KEY environment variable.
 * Free tier: 100 requests/day, 10 articles/request.
 */
export async function searchGNews(query: string, limit = 10): Promise<ScoutNewsResult[]> {
  const apiKey = process.env.GNEWS_KEY;
  if (!apiKey) {
    console.log('[SCOUT/GNews] No GNEWS_KEY set, skipping');
    return [];
  }

  try {
    const encoded = encodeURIComponent(query);
    const url = `https://gnews.io/api/v4/search?q=${encoded}&lang=en&max=${Math.min(limit, 10)}&sortby=publishedAt&token=${apiKey}`;

    const res = await fetchNewsWithRetry('GNews', url);
    if (!res) return [];

    const data = await res.json();
    const articles: any[] = data?.articles || [];

    return articles.slice(0, limit).map((a: any) => {
      const date = a.publishedAt ? new Date(a.publishedAt) : new Date();
      const sourceName = a.source?.name || 'GNews';
      return {
        id: makeId('gnews', a.url || a.title || ''),
        provider: 'gnews',
        type: 'news-article',
        title: cleanText(a.title || ''),
        abstract: cleanText(a.description || a.content || a.title || ''),
        url: a.url || null,
        pdfUrl: '',
        year: date.getFullYear(),
        authors: [sourceName],
        citationCount: 0,
        oaStatus: 'open',
        documentType: 'news',
        publishedDate: date.toISOString().split('T')[0],
        doi: null,
        topics: [],
        jelCodes: [],
        institutions: [{ name: sourceName }],
        raw: a,
      };
    });
  } catch (e: any) {
    console.warn(`[SCOUT/GNews] Error: ${e.message}`);
    return [];
  }
}

// ============================================================================
// 6. EventRegistry — requires EVENTREGISTRY_KEY
// ============================================================================

/**
 * Search EventRegistry for structured event and news analytics.
 * Requires EVENTREGISTRY_KEY environment variable.
 * Free tier: 2000 tokens/month.
 */
export async function searchEventRegistry(query: string, limit = 25): Promise<ScoutNewsResult[]> {
  const apiKey = process.env.EVENTREGISTRY_KEY;
  if (!apiKey) {
    console.log('[SCOUT/EventRegistry] No EVENTREGISTRY_KEY set, skipping');
    return [];
  }

  try {
    const body = {
      action: 'getArticles',
      keyword: query,
      articlesPage: 1,
      articlesCount: Math.min(limit, 100),
      articlesSortBy: 'date',
      articlesSortByAsc: false,
      resultType: 'articles',
      dataType: ['news'],
      lang: 'eng',
      apiKey,
    };

    const res = await fetchNewsWithRetry('EventRegistry', 'https://eventregistry.org/api/v1/article/getArticles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeoutMs: 15000,
    });
    if (!res) return [];

    const data = await res.json();
    const articles: any[] = data?.articles?.results || [];

    return articles.slice(0, limit).map((a: any) => {
      const date = a.dateTime ? new Date(a.dateTime) : a.date ? new Date(a.date) : new Date();
      const sourceName = a.source?.title || 'EventRegistry';
      return {
        id: makeId('eventregistry', a.uri || a.url || a.title || ''),
        provider: 'eventregistry',
        type: 'news-article',
        title: cleanText(a.title || ''),
        abstract: cleanText(a.body?.substring(0, 2000) || a.title || ''),
        url: a.url || null,
        pdfUrl: '',
        year: date.getFullYear(),
        authors: a.authors?.map((auth: any) => auth.name || auth) || [sourceName],
        citationCount: 0,
        oaStatus: 'open',
        documentType: 'news',
        publishedDate: date.toISOString().split('T')[0],
        doi: null,
        topics: a.concepts?.slice(0, 5).map((c: any) => c.label?.eng || c.label || '') || [],
        jelCodes: [],
        institutions: [{ name: sourceName }],
        raw: a,
      };
    });
  } catch (e: any) {
    console.warn(`[SCOUT/EventRegistry] Error: ${e.message}`);
    return [];
  }
}

// ============================================================================
// UNIFIED SEARCH — Searches all available news providers in parallel
// ============================================================================

/**
 * Search all configured news providers in parallel.
 * Gracefully skips providers without API keys.
 * GDELT always runs (free, no key).
 */
export async function searchAllNewsProviders(query: string, perProvider = 20): Promise<ScoutNewsResult[]> {
  console.log(`[SCOUT/News] Searching all news providers for: "${query.slice(0, 60)}..."`);

  const results = await Promise.allSettled([
    searchGDELTNews(query, perProvider),
    searchNewsAPI(query, perProvider),
    searchMediaStack(query, perProvider),
    searchTheNewsAPI(query, perProvider),
    searchGNews(query, Math.min(perProvider, 10)),
    searchEventRegistry(query, perProvider),
  ]);

  const all: ScoutNewsResult[] = [];
  const providers = ['gdelt-news', 'newsapi', 'mediastack', 'thenewsapi', 'gnews', 'eventregistry'];

  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      console.log(`[SCOUT/News] ${providers[i]}: ${r.value.length} results`);
      all.push(...r.value);
    } else {
      console.warn(`[SCOUT/News] ${providers[i]} failed: ${r.reason}`);
    }
  });

  console.log(`[SCOUT/News] Total: ${all.length} news articles from ${providers.length} providers`);
  return all;
}
