/**
 * Springer Nature Provider — 10M+ articles from Springer + Nature journals.
 * Free API key from https://dev.springernature.com
 * Strong in: physics, engineering, medicine, life sciences, computer science.
 *
 * API docs: https://dev.springernature.com
 * Endpoint: https://api.springernature.com/metadata/json
 */

import { fetchFromProvider } from '../http-client';
import { isFreeRun } from '../free-run';
import { searchOpenAlex } from './openalex';

const SPRINGER_API_KEY = process.env.SPRINGER_API_KEY || "";
const SPRINGER_ENDPOINT = "https://api.springernature.com/metadata/json";

export async function searchSpringer(query: string, limit = 20): Promise<any[]> {
  // If we have an API key, use the direct Springer API — except in FREE RUN,
  // where the key-gated path is off-limits and the OpenAlex fallback (free)
  // below still exercises this provider's code path.
  if (SPRINGER_API_KEY && !isFreeRun()) {
    try {
      const params = new URLSearchParams({
        q: query,
        api_key: SPRINGER_API_KEY,
        p: String(Math.min(limit, 100)),
        s: '1',
      });

      const data: any = await fetchFromProvider('springer', `${SPRINGER_ENDPOINT}?${params}`, {
        timeout: 20000,
        retries: 3,
        retryDelay: 2000,
      });

      const records = data?.records || [];

    if (!Array.isArray(records)) {
      console.warn('[SCOUT/Springer] unexpected response format');
      return [];
    }

    return records.slice(0, limit).map((item: any, idx: number) => {
      const doi = item.doi || '';
      const url = item.url?.[0]?.value || item.url || `https://doi.org/${doi}`;
      const slug = (doi || url).replace(/[^a-z0-9]/gi, '-').slice(0, 50).toLowerCase();

      const publishedDate = item.publicationDate || item.onlineDate || null;
      let year = new Date().getFullYear();
      if (publishedDate) {
        const parsed = new Date(publishedDate);
        if (!isNaN(parsed.getTime())) year = parsed.getFullYear();
      }

      const authors = (Array.isArray(item.creators) ? item.creators : []).map((c: any) => ({
        name: c.creator || c.name || '',
      })).filter((a: any) => a.name);

      const institutions: string[] = [];
      if (item.publisher) institutions.push(item.publisher);

      return {
        id: `springer:${slug || idx}`,
        provider: 'springer',
        type: 'journal-article',
        title: item.title || 'Untitled',
        abstract: item.abstract || null,
        url,
        doi: doi || null,
        year,
        publishedDate,
        authors,
        institutions,
        citationCount: null,
        qualityScore: 65,
        oaStatus: item.openaccess ? 'open' : 'closed',
        hasFullText: !!item.openaccess,
        contentLength: item.abstract?.length || 0,
        raw: item,
      };
    });
    } catch (err: any) {
      console.warn(`[SCOUT/Springer] Direct API error: ${err.message} — falling back to OpenAlex`);
    }
  }

  // Fallback 1: use OpenAlex filtered to Springer source (no API key needed)
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'primary_location.source.id:https://openalex.org/S4306401296',
    });
    if (results.length > 0) return results;
  } catch (fallbackErr: any) {
    console.warn(`[SCOUT/Springer] OpenAlex fallback failed: ${fallbackErr.message}`);
  }

  // Fallback 2: Crossref filtered to Springer DOI prefix (10.1007)
  try {
    const { searchCrossref } = await import('./crossref');
    const crUrl = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&filter=prefix:10.1007&rows=${Math.min(limit, 25)}`;
    const data: any = await fetchFromProvider('springer', crUrl, {
      timeout: 20000,
      retries: 2,
      headers: { 'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)' },
    });
    const items = data?.message?.items || [];
    return items.slice(0, limit).map((item: any) => ({
      id: `springer:${item.DOI || Math.random()}`,
      provider: 'springer',
      type: 'journal-article',
      title: item.title?.[0] || 'Untitled',
      abstract: item.abstract || null,
      url: item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : ''),
      doi: item.DOI || null,
      year: item.published?.dateParts?.[0]?.[0] || null,
      publishedDate: item.published?.dateParts?.[0]?.join('-') || '',
      authors: (Array.isArray(item.author) ? item.author : []).map((a: any) => ({ name: `${a.given || ''} ${a.family || ''}`.trim() })),
      institutions: [item.publisher].filter(Boolean),
      citationCount: item['is-referenced-by-count'] || 0,
      qualityScore: 65,
      oaStatus: 'closed',
      hasFullText: false,
      raw: item,
    }));
  } catch (crErr: any) {
    console.warn(`[SCOUT/Springer] Crossref fallback also failed: ${crErr.message}`);
    return [];
  }
}
