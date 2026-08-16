/**
 * Preprints.org Provider — agrégateur multidisciplinaire de préprints (MDPI)
 * API : https://www.preprints.org/api/v1  (gratuit, sans clé)
 * Couvre : préprints dans toutes les disciplines (STEM, médecine, sciences
 * sociales, économie) déposés sur la plateforme preprints.org gérée par MDPI.
 *
 * KEY VALUE : complément multidisciplinaire à arXiv/bioRxiv/chemRxiv/OSF, avec
 * une couverture particulière en sciences sociales et environnement. Aucune clé.
 */

import { fetchFromProvider } from '../../http-client';

const PREPRINTS_API = 'https://www.preprints.org/api/v1/manuscripts';

export async function searchPreprintsOrg(query: string, limit = 20): Promise<any[]> {
  try {
    const params = new URLSearchParams({
      search: query,
      count: String(Math.min(limit, 50)),
    });
    const url = `${PREPRINTS_API}?${params.toString()}`;

    const data: any = await fetchFromProvider('preprints-org', url, {
      timeout: 20000,
      retries: 3,
    });

    const items = data?.manuscripts || data?.results || [];
    const results = items
      .map((m: any) => {
        const abstract = m.abstract || m.description || null;
        const authors = (m.authors || []).map((a: any) => ({
          name: a.name || `${a.given || ''} ${a.family || ''}`.trim(),
          affiliation: a.affiliation || null,
        }));
        const year = m.date || m.posted ? parseInt(String(m.date || m.posted).slice(0, 4)) : null;
        const doi = m.doi || null;
        const pdfUrl = m.pdf_url || m.fulltext_url || null;

        return {
          id: `preprints-org:${m.id || m.doi || Math.random()}`,
          provider: 'preprints-org',
          type: 'preprint',
          title: m.title || '',
          abstract: abstract ? abstract.slice(0, 3000) : null,
          year,
          publishedDate: m.date || m.posted || null,
          authors,
          institutions: ['preprints.org (MDPI)'],
          doi,
          url: m.url || (doi ? `https://doi.org/${doi}` : `https://www.preprints.org/manuscript/${m.id}`),
          pdfUrl,
          oaStatus: 'open',
          citationCount: null,
          contentLength: abstract?.length || 0,
          hasFullText: !!pdfUrl,
          contentQuality: (abstract?.length || 0) >= 500 ? 'good' : 'acceptable',
          issuer: 'preprints.org',
          issuerType: 'preprint-server',
          classification: 'preprint',
          language: 'en',
          documentType: 'preprint',
          topics: ['preprint', m.subject_area || 'multidisciplinary'].filter(Boolean),
          raw: m,
        };
      })
      .filter((r: any) => r.title);

    console.log(`[preprints.org] Found ${results.length} preprints`);
    return results;
  } catch (error: any) {
    console.error(`[preprints.org] Search failed: ${error.message}`);
    return [];
  }
}
