/**
 * Tavily Provider — AI-optimised web search with content extraction.
 * Free tier: 1,000 credits/month (1 credit = 1 basic search).
 * Returns clean structured content ready for LLM consumption.
 *
 * API docs: https://docs.tavily.com/documentation/api-reference/endpoint/search
 * Auth: Bearer tvly-YOUR_API_KEY
 */

import { httpPost } from '../http-client';

const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";
const TAVILY_ENDPOINT = "https://api.tavily.com/search";

export interface TavilySearchOptions {
  topic?: 'general' | 'news' | 'finance';
  search_depth?: 'basic' | 'advanced' | 'fast' | 'ultra-fast';
  time_range?: 'day' | 'week' | 'month' | 'year';
  include_domains?: string[];
  exclude_domains?: string[];
  country?: string;
}

/**
 * Search the web via Tavily API.
 * Uses `topic: "news"` for current events, `topic: "general"` for broader queries.
 */
export async function searchTavily(
  query: string,
  limit = 15,
  options?: TavilySearchOptions
): Promise<any[]> {
  if (!TAVILY_API_KEY) {
    console.log('[SCOUT] Tavily: skipped (no TAVILY_API_KEY)');
    return [];
  }

  try {
    const body: any = {
      query,
      max_results: Math.min(limit, 20),
      search_depth: options?.search_depth || 'basic',
      topic: options?.topic || 'general',
      include_answer: false,
      include_raw_content: false,
    };

    if (options?.time_range) body.time_range = options.time_range;
    if (options?.include_domains?.length) body.include_domains = options.include_domains;
    if (options?.exclude_domains?.length) body.exclude_domains = options.exclude_domains;
    if (options?.country) body.country = options.country;

    const data: any = await httpPost(TAVILY_ENDPOINT, body, {
      timeout: 20000,
      retries: 2,
      rateLimiterKey: 'tavily',
      headers: {
        'Authorization': `Bearer ${TAVILY_API_KEY}`,
      },
    });
    if (!data) {
      console.warn(`[SCOUT/Tavily] Request failed`);
      return [];
    }
    const results = data?.results || [];

    if (!Array.isArray(results)) {
      console.warn('[SCOUT/Tavily] unexpected response format');
      return [];
    }

    return results.slice(0, limit).map((item: any, idx: number) => {
      const url = item.url || '';
      const slug = url.replace(/[^a-z0-9]/gi, '-').slice(0, 50).toLowerCase();

      const publishedDate = item.published_date || item.publishedDate || null;
      let year = new Date().getFullYear();
      if (publishedDate) {
        const parsed = new Date(publishedDate);
        if (!isNaN(parsed.getTime())) year = parsed.getFullYear();
      }

      const institutions: string[] = [];
      try {
        const domain = new URL(url).hostname.replace(/^www\./, '');
        if (domain) institutions.push(domain);
      } catch { /* ignore invalid URLs */ }

      const relevanceScore = item.score || 0;
      const qualityScore = Math.round(30 + relevanceScore * 40);

      return {
        id: `tavily:${slug || idx}`,
        provider: 'tavily',
        type: options?.topic === 'news' ? 'news-article' : 'report',
        title: item.title || 'Untitled',
        abstract: item.content || item.snippet || null,
        url,
        year,
        publishedDate,
        authors: [] as Array<{ name: string }>,
        institutions,
        citationCount: null,
        qualityScore,
        oaStatus: 'open',
        hasFullText: !!(item.content && item.content.length > 500),
        contentLength: item.content?.length || item.snippet?.length || 0,
        tavilyScore: relevanceScore,
        raw: item,
      };
    });
  } catch (err: any) {
    console.warn(`[SCOUT/Tavily] Error: ${err.message}`);
    return [];
  }
}

/**
 * Tavily news search — convenience wrapper for current events.
 */
export async function searchTavilyNews(query: string, limit = 15): Promise<any[]> {
  return searchTavily(query, limit, { topic: 'news', time_range: 'month' });
}
