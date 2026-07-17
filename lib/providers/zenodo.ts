/**
 * Zenodo Provider — CERN Open Science Repository
 * 3M+ records: publications, preprints, datasets, software, reports across all disciplines.
 * API: https://developers.zenodo.org/
 * Free, no key required for search. Rich descriptions (abstracts), DOIs, open access.
 */

import { fetchFromProvider } from '../http-client';

export async function searchZenodo(query: string, limit = 20): Promise<any[]> {
  // type=publication restricts to scholarly outputs (excludes raw datasets/software noise)
  const url = `https://zenodo.org/api/records?q=${encodeURIComponent(query)}&size=${Math.min(limit, 30)}&type=publication&sort=bestmatch`;

  try {
    const data: any = await fetchFromProvider('zenodo', url, { timeout: 15000, retries: 3 });
    const hits: any[] = data?.hits?.hits || [];

    const results = hits
      .map((hit: any) => {
        const meta = hit.metadata || {};
        const rawDesc = meta.description || '';
        const abstract = rawDesc
          ? String(rawDesc).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 3000)
          : null;

        const year = meta.publication_date ? parseInt(String(meta.publication_date).slice(0, 4)) : null;

        const authors = (meta.creators || [])
          .map((c: any) => ({ name: c.name, orcid: c.orcid || null }))
          .filter((a: any) => a.name);

        const doi = hit.doi || meta.doi || null;

        return {
          id: `zenodo:${hit.id}`,
          provider: 'zenodo',
          type: 'paper',
          title: meta.title || '',
          abstract,
          year,
          doi,
          url: hit.links?.self_html || (doi ? `https://doi.org/${doi}` : null),
          pdfUrl: hit.files?.[0]?.links?.self || null,
          oaStatus: meta.access_right === 'open' ? 'oa' : null,
          authors,
          institutions: [],
          topics: (meta.keywords || []).slice(0, 6),
          jelCodes: [],
          citationCount: null,
          issuer: 'Zenodo (CERN)',
          issuerType: 'open-science',
          language: meta.language || 'en',
          raw: hit,
        };
      })
      .filter((r: any) => r.title && r.title.length > 3 && r.abstract && r.abstract.length >= 100);

    console.log(`[Zenodo] Found ${results.length} open science records`);
    return results;
  } catch (error: any) {
    console.error(`[Zenodo] Search failed: ${error.message}`);
    return [];
  }
}
