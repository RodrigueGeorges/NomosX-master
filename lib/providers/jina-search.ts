/**
 * JINA SEARCH Provider — s.jina.ai search-grounding API.
 *
 * Purpose: resilient keyed search. Returns web results with full page
 * content already extracted to markdown — the reader gets usable text
 * without a second fetch. Complements SearXNG (keyless metasearch floor)
 * with a single-API keyed engine that also bypasses many bot-blocks.
 *
 * Auth: JINA_API_KEY env (Bearer). Works keyless at a much lower rate.
 */

import { fetchFromProvider } from '../http-client';
import { env } from '../env';
import { sourceIdHash } from './source-id';

export async function searchJina(query: string, limit = 8): Promise<any[]> {
  const q = query.trim();
  if (q.length < 4) return [];
  try {
    const url = `https://s.jina.ai/${encodeURIComponent(q)}`;
    const data: any = await fetchFromProvider('jina-search', url, {
      timeout: 25000,
      retries: 1,
      headers: {
        'Accept': 'application/json',
        ...(env.JINA_API_KEY ? { Authorization: `Bearer ${env.JINA_API_KEY}` } : {}),
      },
    });
    const items: any[] = Array.isArray(data?.data) ? data.data
      : Array.isArray(data?.results) ? data.results
      : Array.isArray(data) ? data : [];
    if (items.length === 0) return [];

    const results = items.slice(0, limit).map((r: any, i: number) => ({
      id: `jina:${sourceIdHash(String(r.url || '') || `jina:${query}:${r.title ?? i}`)}`,
      provider: 'jina-search',
      type: 'article',
      title: String(r.title || '').slice(0, 300),
      abstract: String(r.description || r.content || '')
        .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, '')
        .slice(0, 4000),
      year: null,
      doi: null,
      url: r.url || '',
      pdfUrl: null,
      oaStatus: null,
      authors: [],
      institutions: [],
      topics: ['web'],
      jelCodes: [],
      citationCount: null,
      issuer: 'jina-search',
      issuerType: 'web-search',
      language: 'en',
      raw: { ...r, content: undefined },
    })).filter((r: any) => r.title && r.abstract.length >= 40 && r.url);

    if (results.length > 0) {
      console.log(`[JINA-SEARCH] ${results.length} results for "${q.slice(0, 60)}"`);
    }
    return results;
  } catch (e: any) {
    console.error(`[JINA-SEARCH] failed: ${e?.message}`);
    return [];
  }
}
