/**
 * Exa Provider — Semantic search over 350M+ publications.
 * Free tier: $20 signup credits + $10/month (~2,800 searches).
 * Category "publication" for academic papers; general web for everything else.
 */

import { httpPost } from '../http-client';

const EXA_API_KEY = process.env.EXA_API_KEY || "";
const EXA_ENDPOINT = "https://api.exa.ai/search";

export interface ExaSearchOptions {
  category?: 'publication' | 'company' | 'people' | 'news' | 'personal site' | 'financial report';
  type?: 'auto' | 'instant' | 'fast' | 'deep-lite' | 'deep' | 'deep-reasoning';
  numResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
}

// Session-level disable: HTTP 402 (payment required) / 401 (invalid key) mean
// the Exa account is out of credits — every subsequent call will fail the same
// way, so we short-circuit for the process lifetime instead of burning latency
// and log noise on each scout fan-out. Same pattern as markOpenAlexKeyExhausted.
let exaCreditsExhausted = false;
export function markExaExhausted() { exaCreditsExhausted = true; }
export function isExaExhausted() { return exaCreditsExhausted; }

export async function searchExa(
  query: string,
  limit = 15,
  options?: ExaSearchOptions
): Promise<any[]> {
  if (!EXA_API_KEY || exaCreditsExhausted) {
    if (!EXA_API_KEY) console.log('[SCOUT] Exa: skipped (no EXA_API_KEY)');
    return [];
  }

  try {
    const body: any = {
      query,
      numResults: Math.min(limit, 25),
      type: options?.type || 'auto',
      contents: {
        text: true,
        highlights: true,
      },
    };

    if (options?.category) {
      body.category = options.category;
    }
    if (options?.includeDomains?.length) {
      body.includeDomains = options.includeDomains;
    }
    if (options?.excludeDomains?.length) {
      body.excludeDomains = options.excludeDomains;
    }

    const data: any = await httpPost(EXA_ENDPOINT, body, {
      timeout: 30000,
      retries: 2,
      rateLimiterKey: 'exa',
      headers: {
        'x-api-key': EXA_API_KEY,
      },
    });
    if (!data) {
      console.warn(`[SCOUT/Exa] Request failed`);
      return [];
    }
    const results = data?.results || data?.data || [];

    if (!Array.isArray(results)) {
      console.warn('[SCOUT/Exa] unexpected response format');
      return [];
    }

    return results.slice(0, limit).map((item: any, idx: number) => {
      const url = item.url || item.id || '';
      const slug = url.replace(/[^a-z0-9]/gi, '-').slice(0, 50).toLowerCase();

      const publishedDate = item.publishedDate || item.published_date || null;
      let year = new Date().getFullYear();
      if (publishedDate) {
        const parsed = new Date(publishedDate);
        if (!isNaN(parsed.getTime())) year = parsed.getFullYear();
      }

      const authors: Array<{ name: string }> = [];
      if (item.authors && Array.isArray(item.authors)) {
        for (const a of item.authors) {
          const name = typeof a === 'string' ? a : (a.name || a.displayName || '');
          if (name) authors.push({ name });
        }
      }

      const institutions: string[] = [];
      if (item.institution || item.publisher) {
        institutions.push(item.institution || item.publisher);
      }

      const abstract = item.text || item.highlights?.join(' ') || item.summary || null;

      return {
        id: `exa:${slug || idx}`,
        provider: 'exa',
        type: options?.category === 'publication' ? 'academic' : 'report',
        title: item.title || 'Untitled',
        abstract,
        url,
        year,
        publishedDate,
        authors,
        institutions,
        citationCount: item.citationCount || item.citation_count || null,
        qualityScore: options?.category === 'publication' ? 60 : 45,
        oaStatus: 'open',
        hasFullText: !!(item.text && item.text.length > 500),
        contentLength: item.text?.length || 0,
        doi: item.doi || null,
        raw: item,
      };
    });
  } catch (err: any) {
    const status = err?.status ?? err?.statusCode;
    if (status === 402 || status === 401) {
      exaCreditsExhausted = true;
      console.warn(`[SCOUT/Exa] HTTP ${status} — credits/auth exhausted, Exa disabled for this session`);
    } else {
      console.warn(`[SCOUT/Exa] Error: ${err.message}`);
    }
    return [];
  }
}

/**
 * Exa publication search — convenience wrapper for academic queries.
 */
export async function searchExaPublications(query: string, limit = 15): Promise<any[]> {
  return searchExa(query, limit, { category: 'publication', type: 'auto' });
}
