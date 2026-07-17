/**
 * DBLP Provider — Computer Science conferences & publications
 * DBLP API (https://dblp.org/search/publ/api) covers ACL, CVPR, NeurIPS, ICML, AAAI, etc.
 * Fallback: SemanticScholar filtered to Computer Science, then OpenAlex CS concept.
 */

import { fetchFromProvider } from '../http-client';
import { searchOpenAlex } from './openalex';
import { env } from '../env';

export async function searchDBLP(query: string, limit = 20): Promise<any[]> {
  // Primary: DBLP REST API (free, no key, generous rate limit)
  try {
    const url = `https://dblp.org/search/publ/api?q=${encodeURIComponent(query)}&format=json&h=${Math.min(limit, 40)}&f=0`;
    const data: any = await fetchFromProvider('dblp', url, { timeout: 15000, retries: 2 });
    const hits = data?.result?.hits?.hit || [];
    const results = hits
      .map((hit: any) => {
        const info = hit?.info || {};
        const authors = (info.authors?.author || (Array.isArray(info.authors?.author) ? info.authors.author : [info.authors?.author]))
          .filter(Boolean)
          .map((a: any) => ({ name: typeof a === 'string' ? a : a?.text || a?.name }))
          .filter((a: any) => a?.name);
        return {
          id: `dblp:${hit?.info?.key || hit?._id || Math.random()}`,
          provider: 'dblp',
          type: info.type === 'Conference and Workshop Paper' ? 'conference_paper' : 'paper',
          title: info.title || '',
          abstract: null,
          year: info.year ? parseInt(info.year) : null,
          doi: info.doi || null,
          url: info.url || info.ee || null,
          pdfUrl: null,
          oaStatus: null,
          authors,
          institutions: [],
          topics: ['Computer Science'],
          jelCodes: [],
          citationCount: null,
          venue: info.venue || null,
          issuer: 'DBLP',
          issuerType: 'computer-science',
          language: 'en',
          raw: info,
        };
      })
      .filter((r: any) => r.title);

    if (results.length > 0) {
      console.log(`[DBLP] Found ${results.length} CS publications`);
      return results;
    }
  } catch {
    // fall through to S2
  }

  // Fallback 1: SemanticScholar filtered to Computer Science
  try {
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&fields=paperId,title,abstract,year,authors,externalIds,url,openAccessPdf,publicationTypes,fieldsOfStudy,venue&limit=${Math.min(limit, 50)}&fieldsOfStudy=Computer Science`;
    const s2Headers: Record<string, string> = {};
    if (env.SEMANTICSCHOLAR_API_KEY) s2Headers['x-api-key'] = env.SEMANTICSCHOLAR_API_KEY;
    const data: any = await fetchFromProvider('dblp', url, { timeout: 20000, retries: 3, headers: s2Headers });
    const items: any[] = data?.data || [];
    const results = items
      .filter((p: any) => p.title)
      .map((p: any) => ({
        id: `dblp:${p.paperId}`,
        provider: 'dblp',
        type: 'paper',
        title: p.title || '',
        abstract: (p.abstract || '').slice(0, 3000) || null,
        year: p.year ?? null,
        doi: p.externalIds?.DOI || null,
        url: p.url || `https://www.semanticscholar.org/paper/${p.paperId}`,
        pdfUrl: p.openAccessPdf?.url || null,
        oaStatus: p.openAccessPdf?.url ? 'oa' : null,
        authors: (p.authors || []).map((a: any) => ({ name: a.name })).filter((a: any) => a.name),
        institutions: [],
        topics: p.fieldsOfStudy || ['Computer Science'],
        jelCodes: [],
        citationCount: null,
        venue: p.venue || null,
        issuer: 'DBLP (via S2)',
        issuerType: 'computer-science',
        language: 'en',
        raw: p,
      }));

    if (results.length > 0) {
      console.log(`[DBLP] S2 fallback found ${results.length} CS publications`);
      return results;
    }
  } catch {
    // fall through to OpenAlex
  }

  // Fallback 2: OpenAlex filtered to Computer Science concept (C41008148)
  try {
    const oa = await searchOpenAlex(query, Math.min(limit, 25), {
      filter: 'concepts.id:C41008148',
    });
    const results = oa
      .filter((r: any) => r.title)
      .map((r: any) => ({
        ...r,
        id: `dblp:${String(r.id).replace('https://openalex.org/', '')}`,
        provider: 'dblp',
        issuer: 'DBLP (via OpenAlex)',
        issuerType: 'computer-science',
      }));
    console.log(`[DBLP] OpenAlex fallback found ${results.length} CS publications`);
    return results;
  } catch (error: any) {
    console.error(`[DBLP] Search failed: ${error.message}`);
    return [];
  }
}
