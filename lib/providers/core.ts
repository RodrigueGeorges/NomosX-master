/**
 * CORE Provider — 300M+ open access research papers
 * The world's largest aggregator of open access research.
 * Covers ALL disciplines: STEM, social sciences, humanities, law, arts.
 * API: https://core.ac.uk/documentation/api
 * 
 * KEY VALUE: Fills humanities/social science gap that PubMed/arXiv don't cover.
 */

import { fetchFromProvider } from '../http-client';
import { env } from '../env';

// Session-level flag: once the configured key is known-dead (expired trial),
// skip the authenticated path entirely — no point burning a request + noisy
// error log on every query variation.
let coreKeyDead = false;

export async function searchCORE(query: string, limit = 30): Promise<any[]> {
  const apiKey = env.CORE_API_KEY;

  // With API key: use authenticated endpoint (higher rate limits)
  if (apiKey && !coreKeyDead) {
    const url = `https://api.core.ac.uk/v3/search/works?q=${encodeURIComponent(query)}&pageSize=${limit}&apiKey=${apiKey}`;

    try {
      const data: any = await fetchFromProvider("core", url, { timeout: 15000 });
      const results = data?.results || [];

      return results.map((item: any) => ({
        id: `core:${item.id}`,
        provider: "core",
        type: "academic",
        title: item.title || 'Untitled',
        abstract: item.description || item.abstract || null,
        authors: Array.isArray(item.authors) ? item.authors.map((author: any) => ({ name: author.name, institution: null })) : [],
        journal: item.journal?.title || null,
        year: item.yearPublished || null,
        doi: item.doi || null,
        url: item.downloadUrl || item.sourceUrl || null,
        pdfUrl: item.downloadUrl || '',
        citationCount: item.citationCount || 0,
        oaStatus: 'open',
        documentType: item.documentType || item.type || 'article',
        publishedDate: item.publishedDate || (item.yearPublished ? `${item.yearPublished}-01-01` : null),
        topics: item.fieldOfStudy ? [item.fieldOfStudy] : (Array.isArray(item.concepts) ? item.concepts : []).map((c: any) => c.name || c).slice(0, 5),
        jelCodes: [],
        institutions: (Array.isArray(item.publishers) ? item.publishers : []).map((p: any) => ({ name: p.name || p })),
        trustScore: 0.7,
        raw: item
      }));
    } catch (error: any) {
      if (error?.status === 401 || error?.status === 403) {
        coreKeyDead = true;
        console.warn('[CORE] API key rejected (401/403) — switching to keyless endpoint for this session');
      } else {
        console.error('CORE search failed:', error?.message || error);
      }
    }
  }

  // Keyless fallback: CORE's search endpoint works without a key (throttled)
  try {
    const url = `https://api.core.ac.uk/v3/search/works?q=${encodeURIComponent(query)}&pageSize=${Math.min(limit, 20)}`;
    const data: any = await fetchFromProvider("core", url, {
      timeout: 15000,
      retries: 1,
      headers: { 'Accept': 'application/json' },
    });
    const results = data?.results || [];
    console.log(`[CORE] Keyless fallback: found ${results.length} results`);

    return results.map((item: any) => ({
      id: `core:${item.id}`,
      provider: "core",
      type: "academic",
      title: item.title || 'Untitled',
      abstract: item.description || item.abstract || null,
      authors: Array.isArray(item.authors) ? item.authors.map((author: any) => ({ name: author.name, institution: null })) : [],
      journal: item.journal?.title || null,
      year: item.yearPublished || null,
      doi: item.doi || null,
      url: item.downloadUrl || item.sourceUrl || null,
      pdfUrl: item.downloadUrl || '',
      citationCount: item.citationCount || 0,
      oaStatus: 'open',
      documentType: item.documentType || item.type || 'article',
      publishedDate: item.publishedDate || (item.yearPublished ? `${item.yearPublished}-01-01` : null),
      topics: item.fieldOfStudy ? [item.fieldOfStudy] : (Array.isArray(item.concepts) ? item.concepts : []).map((c: any) => c.name || c).slice(0, 5),
      jelCodes: [],
      institutions: (Array.isArray(item.publishers) ? item.publishers : []).map((p: any) => ({ name: p.name || p })),
      trustScore: 0.6,
      raw: item
    }));
  } catch (error: any) {
    console.warn('[CORE] Keyless fallback also failed:', error.message);
    return [];
  }
}

// Legacy export for backward compatibility
export async function searchCore(query: string, limit = 30) {
  return searchCORE(query, limit);
}

export default { searchCORE, searchCore };
