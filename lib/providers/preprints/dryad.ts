/**
 * Dryad Provider — dépôt de données de recherche (toutes disciplines)
 * API : https://datadryad.org/api/v2/search  (gratuit, sans clé)
 * Couvre : 50 000+ jeux de données de recherche avec métadonnées riches et
 * articles associés, principalement en écologie, évolution, sciences
 * environnementales, mais aussi médecine et sciences sociales.
 *
 * KEY VALUE : source clé pour les données de recherche reproductibles ; les
 * jeux de données Dryad sont souvent cités dans la littérature peer-reviewed.
 * Aucune clé requise.
 */

import { fetchFromProvider } from '../../http-client';

const DRYAD_SEARCH = 'https://datadryad.org/api/v2/search';

export async function searchDryad(query: string, limit = 20): Promise<any[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      per_page: String(Math.min(limit, 50)),
    });
    const url = `${DRYAD_SEARCH}?${params.toString()}`;

    const data: any = await fetchFromProvider('dryad', url, {
      timeout: 20000,
      retries: 3,
    });

    const items = data?._embedded?.['stash:dryad']?.items || data?.results || data?.items || [];
    const results = items
      .map((d: any) => {
        const abstract = d.abstract || d.description || null;
        const authors = (d.authors || []).map((a: any) => ({
          name: a.name || `${a.given_name || ''} ${a.family_name || ''}`.trim(),
          orcid: a.orcid || null,
        }));
        const year = d.publicationDate || d.datePublished
          ? parseInt(String(d.publicationDate || d.datePublished).slice(0, 4))
          : null;
        const doi = d.doi || d.identifier || null;
        const subjects = d.keywords || d.subjects || [];

        return {
          id: `dryad:${d.id || doi || Math.random()}`,
          provider: 'dryad',
          type: 'dataset',
          title: d.title || '',
          abstract: abstract ? abstract.slice(0, 3000) : null,
          year,
          publishedDate: d.publicationDate || d.datePublished || null,
          authors,
          institutions: ['Dryad'],
          doi,
          url: d.url || (doi ? `https://doi.org/${doi}` : `https://datadryad.org/stash/dataset/doi:${doi}`),
          pdfUrl: null,
          dataUrl: d.downloadUrl || null,
          oaStatus: 'open',
          citationCount: d.citationCount || null,
          contentLength: abstract?.length || 0,
          hasFullText: !!doi,
          contentQuality: (abstract?.length || 0) >= 500 ? 'good' : 'acceptable',
          issuer: 'Dryad',
          issuerType: 'data-repository',
          classification: 'dataset',
          language: 'en',
          documentType: 'dataset',
          topics: Array.isArray(subjects) ? subjects.slice(0, 8) : ['dataset', 'research-data'],
          raw: d,
        };
      })
      .filter((r: any) => r.title);

    console.log(`[Dryad] Found ${results.length} datasets`);
    return results;
  } catch (error: any) {
    console.error(`[Dryad] Search failed: ${error.message}`);
    return [];
  }
}
