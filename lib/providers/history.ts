/**
 * History Provider — via SemanticScholar (field-of-study) + OpenAlex fallback
 * Covers: world history, historiography, economic history, cultural history
 */

import { fetchFromProvider } from '../http-client';
import { searchOpenAlex } from './openalex';
import { env } from '../env';

export async function searchHistory(query: string, limit = 20): Promise<any[]> {
  try {
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&fields=paperId,title,abstract,year,authors,externalIds,url,openAccessPdf,publicationTypes,fieldsOfStudy&limit=${Math.min(limit, 50)}&fieldsOfStudy=History`;
    const s2Headers: Record<string, string> = {};
    if (env.SEMANTICSCHOLAR_API_KEY) s2Headers['x-api-key'] = env.SEMANTICSCHOLAR_API_KEY;
    const data: any = await fetchFromProvider('history', url, { timeout: 20000, retries: 3, headers: s2Headers });
    const items: any[] = data?.data || [];

    const results = items
      .filter((p: any) => p.abstract && p.abstract.length >= 150 && p.title)
      .map((p: any) => ({
        id: `history:${p.paperId}`,
        provider: 'history',
        type: 'paper',
        title: p.title || '',
        abstract: (p.abstract || '').slice(0, 3000),
        year: p.year ?? null,
        doi: p.externalIds?.DOI || null,
        url: p.url || `https://www.semanticscholar.org/paper/${p.paperId}`,
        pdfUrl: p.openAccessPdf?.url || null,
        oaStatus: p.openAccessPdf?.url ? 'oa' : null,
        authors: (p.authors || []).map((a: any) => ({ name: a.name })).filter((a: any) => a.name),
        institutions: [],
        topics: p.fieldsOfStudy || ['History'],
        jelCodes: [],
        citationCount: null,
        issuer: 'History (via S2)',
        issuerType: 'history',
        language: 'en',
        raw: p,
      }));

    if (results.length > 0) {
      console.log(`[History] Found ${results.length} history documents`);
      return results;
    }
  } catch {
    // fall through to OpenAlex
  }

  try {
    const oa = await searchOpenAlex(query, Math.min(limit, 25), {
      filter: 'concepts.id:C95457728',
    });
    const results = oa
      .filter((r: any) => r.abstract && r.abstract.length >= 150 && r.title)
      .map((r: any) => ({
        ...r,
        id: `history:${String(r.id).replace('https://openalex.org/', '')}`,
        provider: 'history',
        issuer: 'History (via OpenAlex)',
        issuerType: 'history',
      }));
    console.log(`[History] OpenAlex fallback found ${results.length} history documents`);
    return results;
  } catch (error: any) {
    console.error(`[History] Search failed: ${error.message}`);
    return [];
  }
}
