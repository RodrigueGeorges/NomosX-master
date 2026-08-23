/**
 * OpenCitations Provider — Citation graph search (1.5B+ citations)
 *
 * OpenCitations indexes citation relationships between DOIs.
 * Free API, no key required. Useful for:
 * - Finding papers that cite a known DOI (forward citations)
 * - Finding papers cited by a known DOI (references)
 * - Enriching sources with citation context
 *
 * API docs: https://opencitations.net/index/api/v2
 * Endpoint: https://opencitations.net/index/api/v2/references/{doi}
 *           https://opencitations.net/index/api/v2/citations/{doi}
 *
 * KEY VALUE: Citation graph traversal — find influential papers
 * that cite or are cited by sources already in the SCOUT pool.
 * Complements OpenAlex/SemanticScholar with fully open citation data.
 */

import { fetchFromProvider } from '../http-client';

/**
 * Get papers that cite a given DOI (forward citations).
 * Returns citing papers with their DOIs and citation counts.
 */
export async function getCitationsOf(doi: string, limit = 25): Promise<any[]> {
  try {
    const cleanDoi = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
    const url = `https://opencitations.net/index/api/v2/citations/doi:${encodeURIComponent(cleanDoi)}?format=json`;

    const data: any = await fetchFromProvider('opencitations', url, {
      timeout: 15000,
      retries: 2,
      headers: { 'Accept': 'application/json' },
    });

    if (!Array.isArray(data)) return [];

    return data.slice(0, limit).map((entry: any) => ({
      id: `opencitations:${entry.citing || Math.random()}`,
      provider: 'opencitations',
      type: 'paper',
      title: entry.citing_title || entry.title || 'Untitled',
      abstract: null,
      doi: entry.citing || null,
      url: entry.citing ? `https://doi.org/${entry.citing}` : null,
      year: entry.citing_pub_date ? parseInt(String(entry.citing_pub_date).slice(0, 4)) : null,
      publishedDate: entry.citing_pub_date || null,
      authors: [],
      institutions: [],
      citationCount: null,
      qualityScore: 55,
      oaStatus: 'unknown',
      hasFullText: false,
      documentType: 'journal-article',
      issuer: entry.citing_source || 'OpenCitations',
      issuerType: 'database',
      classification: 'academic',
      language: 'en',
      contentFormat: 'metadata',
      raw: entry,
    }));
  } catch (err: any) {
    console.warn(`[OpenCitations] getCitationsOf failed: ${err.message}`);
    return [];
  }
}

/**
 * Get papers referenced by a given DOI (backward references).
 */
export async function getReferencesOf(doi: string, limit = 25): Promise<any[]> {
  try {
    const cleanDoi = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
    const url = `https://opencitations.net/index/api/v2/references/doi:${encodeURIComponent(cleanDoi)}?format=json`;

    const data: any = await fetchFromProvider('opencitations', url, {
      timeout: 15000,
      retries: 2,
      headers: { 'Accept': 'application/json' },
    });

    if (!Array.isArray(data)) return [];

    return data.slice(0, limit).map((entry: any) => ({
      id: `opencitations-ref:${entry.cited || Math.random()}`,
      provider: 'opencitations',
      type: 'paper',
      title: entry.cited_title || entry.title || 'Untitled',
      abstract: null,
      doi: entry.cited || null,
      url: entry.cited ? `https://doi.org/${entry.cited}` : null,
      year: entry.cited_pub_date ? parseInt(String(entry.cited_pub_date).slice(0, 4)) : null,
      publishedDate: entry.cited_pub_date || null,
      authors: [],
      institutions: [],
      citationCount: null,
      qualityScore: 60,
      oaStatus: 'unknown',
      hasFullText: false,
      documentType: 'journal-article',
      issuer: entry.cited_source || 'OpenCitations',
      issuerType: 'database',
      classification: 'academic',
      language: 'en',
      contentFormat: 'metadata',
      raw: entry,
    }));
  } catch (err: any) {
    console.warn(`[OpenCitations] getReferencesOf failed: ${err.message}`);
    return [];
  }
}

/**
 * Search OpenCitations by query string (uses the meta endpoint).
 * This is a metadata-level search — returns DOIs matching the query.
 */
export async function searchOpenCitations(query: string, limit = 20): Promise<any[]> {
  try {
    // OpenCitations doesn't have a full-text search endpoint.
    // We use the Crossref API to find DOIs, then enrich with citation data.
    const { fetchFromProvider: fp } = await import('../http-client');
    const crUrl = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${Math.min(limit, 25)}&select=DOI,title,author,published,container-title,is-referenced-by-count,URL,abstract`;

    const crData: any = await fp('opencitations', crUrl, {
      timeout: 15000,
      retries: 2,
      headers: { 'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)' },
    });

    const items = crData?.message?.items || [];
    return items.slice(0, limit).map((item: any) => ({
      id: `opencitations:${item.DOI || Math.random()}`,
      provider: 'opencitations',
      type: 'paper',
      title: item.title?.[0] || 'Untitled',
      abstract: item.abstract || null,
      doi: item.DOI || null,
      url: item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : ''),
      year: item.published?.dateParts?.[0]?.[0] || null,
      publishedDate: item.published?.dateParts?.[0]?.join('-') || '',
      authors: (item.author || []).map((a: any) => ({ name: `${a.given || ''} ${a.family || ''}`.trim() })),
      institutions: [],
      citationCount: item['is-referenced-by-count'] || 0,
      qualityScore: 55,
      oaStatus: 'unknown',
      hasFullText: false,
      documentType: item.type || 'journal-article',
      issuer: item['container-title']?.[0] || 'OpenCitations',
      issuerType: 'database',
      classification: 'academic',
      language: 'en',
      contentFormat: 'metadata',
      raw: item,
    }));
  } catch (err: any) {
    console.warn(`[OpenCitations] Search failed: ${err.message}`);
    return [];
  }
}
