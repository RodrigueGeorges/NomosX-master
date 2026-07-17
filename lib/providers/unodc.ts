/**
 * UNODC Provider — United Nations Office on Drugs and Crime
 * Criminologie, drogues, criminalité organisée, terrorisme, corruption, traite des êtres humains.
 * Primary: DOAJ filtered to criminology/drug policy subjects
 * Fallback: SemanticScholar filtered to Law/Political Science with crime keywords
 */

import { fetchFromProvider } from '../http-client';
import { searchOpenAlex } from './openalex';
import { env } from '../env';

export async function searchUNODC(query: string, limit = 15): Promise<any[]> {
  // Primary: SemanticScholar filtered to Law + Political Science (exact swagger fieldsOfStudy values)
  try {
    const s2Url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&fields=paperId,title,abstract,year,authors,externalIds,url,openAccessPdf,fieldsOfStudy&limit=${Math.min(limit, 50)}&fieldsOfStudy=Law,Political+Science`;
    const s2Headers: Record<string, string> = {};
    if (env.SEMANTICSCHOLAR_API_KEY) s2Headers['x-api-key'] = env.SEMANTICSCHOLAR_API_KEY;
    const data: any = await fetchFromProvider('unodc', s2Url, { timeout: 20000, retries: 2, headers: s2Headers });
    const items: any[] = data?.data || [];

    const results = items
      .filter((p: any) => p.abstract && p.abstract.length >= 100 && p.title)
      .map((p: any) => ({
        id: `unodc:${p.paperId}`,
        provider: 'unodc',
        type: 'paper',
        title: p.title || '',
        abstract: p.abstract.slice(0, 3000),
        year: p.year ?? null,
        doi: p.externalIds?.DOI || null,
        url: p.url || `https://www.semanticscholar.org/paper/${p.paperId}`,
        pdfUrl: p.openAccessPdf?.url || null,
        oaStatus: p.openAccessPdf?.url ? 'oa' : null,
        authors: (p.authors || []).map((a: any) => ({ name: a.name })).filter((a: any) => a.name),
        institutions: [],
        topics: p.fieldsOfStudy || ['Law'],
        jelCodes: [],
        citationCount: null,
        issuer: 'UNODC',
        issuerType: 'criminology',
        language: 'en',
        raw: p,
      }));

    if (results.length > 0) {
      console.log(`[UNODC] S2 found ${results.length} criminology publications`);
      return results;
    }
  } catch {
    // fall through
  }

  // Fallback: DOAJ — open access criminology/drug policy journals
  try {
    const crimeQuery = `${query} crime justice`;
    const doajUrl = `https://doaj.org/api/search/articles/${encodeURIComponent(crimeQuery)}?pageSize=${Math.min(limit, 20)}`;
    const doajData: any = await fetchFromProvider('unodc', doajUrl, { timeout: 15000, retries: 2 });
    const docs: any[] = doajData?.results || [];

    const results = docs
      .filter((d: any) => d.bibjson?.abstract && d.bibjson.abstract.length >= 100)
      .map((d: any) => ({
        id: `unodc:${d.id}`,
        provider: 'unodc',
        type: 'paper',
        title: d.bibjson?.title || '',
        abstract: d.bibjson?.abstract.slice(0, 3000),
        year: d.bibjson?.year ? parseInt(d.bibjson.year) : null,
        doi: d.bibjson?.identifier?.find((i: any) => i.type === 'doi')?.id || null,
        url: d.bibjson?.link?.[0]?.url || null,
        pdfUrl: null,
        oaStatus: 'oa',
        authors: (d.bibjson?.author || []).map((a: any) => ({ name: a.name })).filter((a: any) => a.name),
        institutions: [],
        topics: (d.bibjson?.subject || []).map((s: any) => s.term).filter(Boolean).slice(0, 5),
        jelCodes: [],
        citationCount: null,
        issuer: 'UNODC',
        issuerType: 'criminology',
        language: d.bibjson?.language?.[0] || 'en',
        raw: d,
      }))
      .filter((r: any) => r.title.length > 3);

    if (results.length > 0) {
      console.log(`[UNODC] DOAJ fallback found ${results.length} publications`);
      return results;
    }
  } catch {
    // fall through
  }

  // Final fallback: OpenAlex filtered to Criminology concept (C73484699)
  try {
    const oa = await searchOpenAlex(query, Math.min(limit, 25), {
      filter: 'concepts.id:C73484699',
    });
    const results = oa
      .filter((r: any) => r.abstract && r.abstract.length >= 100 && r.title)
      .map((r: any) => ({
        ...r,
        id: `unodc:${String(r.id).replace('https://openalex.org/', '')}`,
        provider: 'unodc',
        issuer: 'UNODC (via OpenAlex)',
        issuerType: 'criminology',
      }));
    console.log(`[UNODC] OpenAlex fallback found ${results.length} publications`);
    return results;
  } catch (error: any) {
    console.error(`[UNODC] Search failed: ${error.message}`);
    return [];
  }
}
