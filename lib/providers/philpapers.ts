/**
 * PhilPapers Provider — Philosophy research (via SemanticScholar philosophy field-of-study)
 * PhilPapers.org blocks all programmatic access (403 on JSON + Atom).
 * We use SemanticScholar filtered to Philosophy field-of-study (C138885662) as equivalent.
 * 2M+ philosophy, ethics, epistemology, AI ethics papers.
 */

import { fetchFromProvider } from '../http-client';
import { searchOpenAlex } from './openalex';
import { env } from '../env';

export async function searchPhilPapers(query: string, limit = 20): Promise<any[]> {
  // Primary: SemanticScholar Graph API filtered to Philosophy field of study
  try {
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&fields=paperId,title,abstract,year,authors,externalIds,url,openAccessPdf,publicationTypes,fieldsOfStudy&limit=${Math.min(limit, 50)}&fieldsOfStudy=Philosophy`;
    const s2Headers: Record<string, string> = {};
    if (env.SEMANTICSCHOLAR_API_KEY) s2Headers['x-api-key'] = env.SEMANTICSCHOLAR_API_KEY;
    const data: any = await fetchFromProvider('philpapers', url, { timeout: 20000, retries: 3, headers: s2Headers });
    const items: any[] = data?.data || [];

    const results = items
      .filter((p: any) => p.abstract && p.abstract.length >= 150 && p.title)
      .map((p: any) => ({
        id: `philpapers:${p.paperId}`,
        provider: 'philpapers',
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
        topics: p.fieldsOfStudy || ['Philosophy'],
        jelCodes: [],
        citationCount: null,
        issuer: 'PhilPapers (via S2)',
        issuerType: 'philosophy',
        language: 'en',
        raw: p,
      }));

    if (results.length > 0) {
      console.log(`[PhilPapers] Found ${results.length} philosophy documents`);
      return results;
    }
  } catch {
    // fall through to OpenAlex
  }

  // Fallback: OpenAlex filtered to Philosophy concept (C138885662) — no rate limit, has abstracts
  try {
    const oa = await searchOpenAlex(query, Math.min(limit, 25), {
      filter: 'concepts.id:C138885662',
    });
    const results = oa
      .filter((r: any) => r.abstract && r.abstract.length >= 150 && r.title)
      .map((r: any) => ({
        ...r,
        id: `philpapers:${String(r.id).replace('https://openalex.org/', '')}`,
        provider: 'philpapers',
        issuer: 'PhilPapers (via OpenAlex)',
        issuerType: 'philosophy',
      }));
    console.log(`[PhilPapers] OpenAlex fallback found ${results.length} philosophy documents`);
    return results;
  } catch (error: any) {
    console.error(`[PhilPapers] Search failed: ${error.message}`);
    return [];
  }
}
