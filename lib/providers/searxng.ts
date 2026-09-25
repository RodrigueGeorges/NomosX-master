/**
 * SEARXNG Provider — free metasearch over ~240 upstream engines.
 *
 * Purpose: resilience. When Tavily (paid) and Exa (credits) are exhausted,
 * SAFE live verification and general web retrieval die with them. SearXNG
 * is the zero-cost floor: query any instance's JSON API, no key required.
 *
 * Priority: SEARXNG_URL env (self-hosted, recommended) → rotating public
 * instances (searx.space). Many public instances disable format=json under
 * bot pressure — we try each once and degrade to [] gracefully.
 */

import { fetchFromProvider } from '../http-client';
import { env } from '../env';

const PUBLIC_INSTANCES = [
  'https://searx.be',
  'https://search.inetol.net',
  'https://searxng.site',
  'https://opnxng.com',
];

export async function searchSearxng(query: string, limit = 8): Promise<any[]> {
  const bases = env.SEARXNG_URL
    ? [env.SEARXNG_URL, ...PUBLIC_INSTANCES]
    : PUBLIC_INSTANCES;

  for (const base of bases) {
    try {
      const url = `${base}/search?q=${encodeURIComponent(query)}&format=json&categories=general&language=en`;
      const data: any = await fetchFromProvider('searxng', url, {
        timeout: 12000,
        retries: 0, // rotate instances instead of retrying one
        headers: { 'User-Agent': 'NomosX Research Agent/1.0', 'Accept': 'application/json' },
      });
      const items: any[] = data?.results || [];
      if (items.length === 0) continue;

      const results = items.slice(0, limit).map((r: any) => ({
        id: `searxng:${Buffer.from(r.url || '').toString('base64').slice(0, 24)}`,
        provider: 'searxng',
        type: 'article',
        title: r.title || '',
        abstract: String(r.content || r.snippet || '').slice(0, 2000),
        year: r.publishedDate ? new Date(r.publishedDate).getFullYear() : null,
        doi: null,
        url: r.url || '',
        pdfUrl: null,
        oaStatus: null,
        authors: [],
        institutions: [],
        topics: [r.category || 'general'],
        jelCodes: [],
        citationCount: null,
        issuer: r.engine || 'web',
        issuerType: 'web-search',
        language: 'en',
        raw: r,
      })).filter((r: any) => r.title && r.abstract.length >= 40);

      if (results.length > 0) {
        console.log(`[SEARXNG] ${results.length} results via ${base}`);
        return results;
      }
    } catch {
      continue; // next instance
    }
  }
  console.warn('[SEARXNG] all instances failed or empty');
  return [];
}
