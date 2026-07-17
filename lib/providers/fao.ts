/**
 * FAO Provider — Food and Agriculture Organization of the United Nations
 * Agriculture, alimentation, sécurité alimentaire, pêche, forêts.
 * API: https://www.fao.org/faostat/en/#data (FAOSTAT) + AGRIS (agriculture research)
 * AGRIS API: https://agris.fao.org/agris-search/search.do
 */

import { fetchFromProvider } from '../http-client';
import { searchOpenAlex } from './openalex';
import { env } from '../env';

export async function searchFAO(query: string, limit = 15): Promise<any[]> {
  // Primary: AGRIS REST API (FAO agricultural research database)
  try {
    const url = `https://agris.fao.org/api/v1/search?q=${encodeURIComponent(query)}&rows=${Math.min(limit, 20)}&output=json`;
    const data: any = await fetchFromProvider('fao', url, { timeout: 15000, retries: 3 });
    const docs: any[] = data?.response?.docs || data?.result || [];

    if (docs.length > 0) {
      const results = docs
        .filter((d: any) => d.title || d.dc_title)
        .map((d: any) => {
          const title = Array.isArray(d.title) ? d.title[0] : (d.title || d.dc_title || '');
          const abstract = Array.isArray(d.description) ? d.description[0] : (d.description || d.dc_description || null);
          return {
            id: `fao:${d.id || d.arn || Math.random().toString(36).slice(2)}`,
            provider: 'fao',
            type: 'paper',
            title: String(title).replace(/<[^>]+>/g, '').trim(),
            abstract: abstract ? String(abstract).replace(/<[^>]+>/g, '').slice(0, 3000) : null,
            year: d.dc_date ? parseInt(String(d.dc_date).slice(0, 4)) : null,
            doi: d.dc_identifier || null,
            url: d.dc_source || `https://agris.fao.org/agris-search/search.do?recordID=${d.arn || d.id}`,
            pdfUrl: null,
            oaStatus: 'oa',
            authors: [],
            institutions: [],
            topics: Array.isArray(d.dc_subject) ? d.dc_subject.slice(0, 5) : [],
            jelCodes: [],
            citationCount: null,
            issuer: 'FAO / AGRIS',
            issuerType: 'agriculture',
            language: d.dc_language || 'en',
            raw: d,
          };
        })
        .filter((r: any) => r.title.length > 3 && r.abstract);

      if (results.length > 0) {
        console.log(`[FAO] AGRIS found ${results.length} agriculture documents`);
        return results;
      }
    }
  } catch {
    // fall through to OpenAlex
  }

  // Fallback: SemanticScholar filtered to 'Agricultural and Food Sciences' (exact swagger value)
  try {
    const s2Url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&fields=paperId,title,abstract,year,authors,externalIds,url,openAccessPdf,fieldsOfStudy&limit=${Math.min(limit, 50)}&fieldsOfStudy=Agricultural+and+Food+Sciences`;
    const s2Headers: Record<string, string> = {};
    if (env.SEMANTICSCHOLAR_API_KEY) s2Headers['x-api-key'] = env.SEMANTICSCHOLAR_API_KEY;
    const s2Data: any = await fetchFromProvider('fao', s2Url, { timeout: 20000, retries: 2, headers: s2Headers });
    const s2Items: any[] = s2Data?.data || [];
    const mapped = s2Items
      .filter((p: any) => p.abstract && p.abstract.length >= 100 && p.title)
      .map((p: any) => ({
        id: `fao:${p.paperId}`,
        provider: 'fao',
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
        topics: p.fieldsOfStudy || ['Agricultural and Food Sciences'],
        jelCodes: [],
        citationCount: null,
        issuer: 'FAO / AGRIS',
        issuerType: 'agriculture',
        language: 'en',
        raw: p,
      }));
    if (mapped.length > 0) {
      console.log(`[FAO] S2 fallback found ${mapped.length} agriculture publications`);
      return mapped;
    }
  } catch {
    // fall through to OpenAlex
  }

  // Final fallback: OpenAlex filtered to Agricultural and Food Sciences concept (C118518473 = Agronomy)
  try {
    const oa = await searchOpenAlex(query, Math.min(limit, 25), {
      filter: 'concepts.id:C118518473',
    });
    const results = oa
      .filter((r: any) => r.abstract && r.abstract.length >= 100 && r.title)
      .map((r: any) => ({
        ...r,
        id: `fao:${String(r.id).replace('https://openalex.org/', '')}`,
        provider: 'fao',
        issuer: 'FAO (via OpenAlex)',
        issuerType: 'agriculture',
      }));
    console.log(`[FAO] OpenAlex fallback found ${results.length} agriculture publications`);
    return results;
  } catch (error: any) {
    console.error(`[FAO] Search failed: ${error.message}`);
    return [];
  }
}
