/**
 * zbMATH Provider — Mathematics publications (Mathematics, Applied Mathematics, Statistics)
 * zbMATH API (https://api.zbmath.org/v1/search) covers 4M+ math papers.
 * Fallback: SemanticScholar filtered to Mathematics, then OpenAlex Math concept.
 */

import { fetchFromProvider } from '../http-client';
import { searchOpenAlex } from './openalex';
import { env } from '../env';

export async function searchZbMath(query: string, limit = 20): Promise<any[]> {
  // Primary: zbMATH REST API (free, no key)
  try {
    const url = `https://api.zbmath.org/v1/search?q=${encodeURIComponent(query)}&size=${Math.min(limit, 40)}`;
    const data: any = await fetchFromProvider('zbmath', url, { timeout: 15000, retries: 2 });
    const records = data?.records || [];
    const results = records
      .map((rec: any) => {
        const authors = (rec.authors || (Array.isArray(rec.au) ? rec.au : [rec.au]))
          .filter(Boolean)
          .map((a: any) => ({ name: typeof a === 'string' ? a : a?.name || a?.text }))
          .filter((a: any) => a?.name);
        return {
          id: `zbmath:${rec.id || rec.zbl_id || Math.random()}`,
          provider: 'zbmath',
          type: 'paper',
          title: rec.title || '',
          abstract: rec.abstract || null,
          year: rec.year ? parseInt(rec.year) : null,
          doi: rec.doi || null,
          url: rec.url || (rec.zbl_id ? `https://zbmath.org/${rec.zbl_id}` : null),
          pdfUrl: null,
          oaStatus: null,
          authors,
          institutions: [],
          topics: ['Mathematics'],
          jelCodes: rec.msc ? (Array.isArray(rec.msc) ? rec.msc : [rec.msc]) : [],
          citationCount: null,
          venue: rec.source || null,
          issuer: 'zbMATH',
          issuerType: 'mathematics',
          language: 'en',
          raw: rec,
        };
      })
      .filter((r: any) => r.title);

    if (results.length > 0) {
      console.log(`[zbMATH] Found ${results.length} math publications`);
      return results;
    }
  } catch {
    // fall through to S2
  }

  // Fallback 1: SemanticScholar filtered to Mathematics
  try {
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&fields=paperId,title,abstract,year,authors,externalIds,url,openAccessPdf,publicationTypes,fieldsOfStudy,venue&limit=${Math.min(limit, 50)}&fieldsOfStudy=Mathematics`;
    const s2Headers: Record<string, string> = {};
    if (env.SEMANTICSCHOLAR_API_KEY) s2Headers['x-api-key'] = env.SEMANTICSCHOLAR_API_KEY;
    const data: any = await fetchFromProvider('zbmath', url, { timeout: 20000, retries: 3, headers: s2Headers });
    const items: any[] = data?.data || [];
    const results = items
      .filter((p: any) => p.title)
      .map((p: any) => ({
        id: `zbmath:${p.paperId}`,
        provider: 'zbmath',
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
        topics: p.fieldsOfStudy || ['Mathematics'],
        jelCodes: [],
        citationCount: null,
        venue: p.venue || null,
        issuer: 'zbMATH (via S2)',
        issuerType: 'mathematics',
        language: 'en',
        raw: p,
      }));

    if (results.length > 0) {
      console.log(`[zbMATH] S2 fallback found ${results.length} math publications`);
      return results;
    }
  } catch {
    // fall through to OpenAlex
  }

  // Fallback 2: OpenAlex filtered to Mathematics concept (C33923547)
  try {
    const oa = await searchOpenAlex(query, Math.min(limit, 25), {
      filter: 'concepts.id:C33923547',
    });
    const results = oa
      .filter((r: any) => r.title)
      .map((r: any) => ({
        ...r,
        id: `zbmath:${String(r.id).replace('https://openalex.org/', '')}`,
        provider: 'zbmath',
        issuer: 'zbMATH (via OpenAlex)',
        issuerType: 'mathematics',
      }));
    console.log(`[zbMATH] OpenAlex fallback found ${results.length} math publications`);
    return results;
  } catch (error: any) {
    console.error(`[zbMATH] Search failed: ${error.message}`);
    return [];
  }
}
