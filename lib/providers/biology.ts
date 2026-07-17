/**
 * Biology Provider — via SemanticScholar (field-of-study) + OpenAlex fallback
 * Covers: molecular biology, genetics, ecology, evolutionary biology, cell biology
 */

import { fetchFromProvider } from '../http-client';
import { searchOpenAlex } from './openalex';
import { env } from '../env';

export async function searchBiology(query: string, limit = 20): Promise<any[]> {
  try {
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&fields=paperId,title,abstract,year,authors,externalIds,url,openAccessPdf,publicationTypes,fieldsOfStudy&limit=${Math.min(limit, 50)}&fieldsOfStudy=Biology`;
    const s2Headers: Record<string, string> = {};
    if (env.SEMANTICSCHOLAR_API_KEY) s2Headers['x-api-key'] = env.SEMANTICSCHOLAR_API_KEY;
    const data: any = await fetchFromProvider('biology', url, { timeout: 20000, retries: 3, headers: s2Headers });
    const items: any[] = data?.data || [];

    const results = items
      .filter((p: any) => p.abstract && p.abstract.length >= 150 && p.title)
      .map((p: any) => ({
        id: `biology:${p.paperId}`,
        provider: 'biology',
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
        topics: p.fieldsOfStudy || ['Biology'],
        jelCodes: [],
        citationCount: null,
        issuer: 'Biology (via S2)',
        issuerType: 'biology',
        language: 'en',
        raw: p,
      }));

    if (results.length > 0) {
      console.log(`[Biology] Found ${results.length} biology documents`);
      return results;
    }
  } catch {
    // fall through to OpenAlex
  }

  try {
    const oa = await searchOpenAlex(query, Math.min(limit, 25), {
      filter: 'concepts.id:C86803240',
    });
    const results = oa
      .filter((r: any) => r.abstract && r.abstract.length >= 150 && r.title)
      .map((r: any) => ({
        ...r,
        id: `biology:${String(r.id).replace('https://openalex.org/', '')}`,
        provider: 'biology',
        issuer: 'Biology (via OpenAlex)',
        issuerType: 'biology',
      }));
    console.log(`[Biology] OpenAlex fallback found ${results.length} biology documents`);
    return results;
  } catch (error: any) {
    console.error(`[Biology] Search failed: ${error.message}`);
    return [];
  }
}
