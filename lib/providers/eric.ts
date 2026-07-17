/**
 * ERIC Provider — Education Resources Information Center
 * 1.7M+ documents on education research: pédagogie, formation, enseignement supérieur.
 * Primary: api.eric.ed.gov JSON API (may be blocked in some regions)
 * Fallback: SemanticScholar filtered to Education field of study
 */

import { fetchFromProvider } from '../http-client';
import { searchOpenAlex } from './openalex';
import { env } from '../env';

export async function searchERIC(query: string, limit = 20): Promise<any[]> {
  // Primary: ERIC JSON API
  try {
    const url = `https://api.eric.ed.gov/ERIC/?search=${encodeURIComponent(query)}&format=json&rows=${Math.min(limit, 50)}&fields=id,title,description,author,publicationdateyear,url,subject,peerreviewed,publicationtype`;
    const data: any = await fetchFromProvider('eric', url, {
      timeout: 15000,
      retries: 2,
      headers: { 'User-Agent': 'NomosX/1.0 (research tool; contact@nomosx.com)' }
    });
    const docs: any[] = data?.response?.docs || [];

    if (docs.length > 0) {
      const results = docs
        .filter((d: any) => d.title && d.description && d.description.length >= 100)
        .map((d: any) => {
          const authors = Array.isArray(d.author) ? d.author : (d.author ? [d.author] : []);
          return {
            id: `eric:${d.id}`,
            provider: 'eric',
            type: 'paper',
            title: d.title || '',
            abstract: d.description ? String(d.description).slice(0, 3000) : null,
            year: d.publicationdateyear ? parseInt(d.publicationdateyear) : null,
            doi: null,
            url: d.url || `https://eric.ed.gov/?id=${d.id}`,
            pdfUrl: d.id?.startsWith('ED') ? `https://files.eric.ed.gov/fulltext/${d.id}.pdf` : null,
            oaStatus: 'oa',
            authors: authors.map((name: string) => ({ name: String(name).trim() })).filter((a: any) => a.name),
            institutions: [],
            topics: Array.isArray(d.subject) ? d.subject.slice(0, 6) : [],
            jelCodes: [],
            citationCount: null,
            issuer: 'ERIC (Education)',
            issuerType: 'education',
            language: 'en',
            raw: d,
          };
        });
      console.log(`[ERIC] Found ${results.length} education documents`);
      return results;
    }
  } catch {
    // fall through to SemanticScholar
  }

  // Fallback: SemanticScholar filtered to Education field of study
  try {
    const s2Url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&fields=paperId,title,abstract,year,authors,externalIds,url,openAccessPdf,fieldsOfStudy&limit=${Math.min(limit, 50)}&fieldsOfStudy=Education`;
    const s2Headers: Record<string, string> = {};
    if (env.SEMANTICSCHOLAR_API_KEY) s2Headers['x-api-key'] = env.SEMANTICSCHOLAR_API_KEY;
    const s2Data: any = await fetchFromProvider('eric', s2Url, { timeout: 20000, retries: 3, headers: s2Headers });
    const items: any[] = s2Data?.data || [];

    const results = items
      .filter((p: any) => p.abstract && p.abstract.length >= 150 && p.title)
      .map((p: any) => ({
        id: `eric:${p.paperId}`,
        provider: 'eric',
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
        topics: p.fieldsOfStudy || ['Education'],
        jelCodes: [],
        citationCount: null,
        issuer: 'ERIC (Education)',
        issuerType: 'education',
        language: 'en',
        raw: p,
      }));

    if (results.length > 0) {
      console.log(`[ERIC] S2 fallback found ${results.length} education documents`);
      return results;
    }
  } catch {
    // fall through to OpenAlex
  }

  // Final fallback: OpenAlex filtered to Education concept (C19417346) — no rate limit, has abstracts
  try {
    const oa = await searchOpenAlex(query, Math.min(limit, 25), {
      filter: 'concepts.id:C19417346',
    });
    const results = oa
      .filter((r: any) => r.abstract && r.abstract.length >= 150 && r.title)
      .map((r: any) => ({
        ...r,
        id: `eric:${String(r.id).replace('https://openalex.org/', '')}`,
        provider: 'eric',
        issuer: 'ERIC (via OpenAlex)',
        issuerType: 'education',
      }));
    console.log(`[ERIC] OpenAlex fallback found ${results.length} education documents`);
    return results;
  } catch (error: any) {
    console.error(`[ERIC] Search failed: ${error.message}`);
    return [];
  }
}
