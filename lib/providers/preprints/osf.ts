/**
 * OSF Provider — Open Science Framework (preprints & projects)
 * API : https://api.osf.io/v2/search/  (gratuit, sans clé pour la recherche publique)
 * Couvre : 200 000+ preprints et projets de recherche déposés sur OSF, tous
 * domaines, avec une forte présence en psychologie, sciences sociales, méthodes
 * quantitatives, et sciences de la reproduction. Inclut les préprints des
 * fournisseurs partenaires (SocArXiv, PsyArXiv, EarthArXiv, etc.).
 *
 * KEY VALUE : agrégateur de préprints multidisciplinaires qui héberge aussi
 * EarthArXiv, SocArXiv, PsyArXiv — comble la lacune "sciences sociales /
 * environnement" en préprints. Aucune clé requise pour la recherche publique.
 */

import { fetchFromProvider } from '../../http-client';

const OSF_SEARCH = 'https://api.osf.io/v2/search/';

export async function searchOSF(query: string, limit = 20): Promise<any[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      page_size: String(Math.min(limit, 50)),
    });
    const url = `${OSF_SEARCH}?${params.toString()}`;

    const data: any = await fetchFromProvider('osf', url, {
      timeout: 20000,
      retries: 3,
    });

    const items = data?.data || [];
    const results = items
      .map((d: any) => {
        const attrs = d.attributes || {};
        const title = attrs.title || attrs.resource_title || 'OSF preprint';
        const abstract = attrs.description || attrs.abstract || attrs.resource_abstract || null;
        const year = attrs.date_created ? parseInt(String(attrs.date_created).slice(0, 4)) : null;
        const authors = (attrs.authors || []).map((a: any) => ({
          name: a.name || `${a.given_name || ''} ${a.family_name || ''}`.trim(),
        }));
        const subjects = attrs.subjects || attrs.tags || [];
        const providerName = attrs.provider || attrs.affiliated_institutions?.[0]?.name || 'OSF';

        return {
          id: `osf:${d.id}`,
          provider: 'osf',
          type: 'preprint',
          title,
          abstract: abstract ? abstract.slice(0, 3000) : null,
          year,
          publishedDate: attrs.date_created || null,
          authors,
          institutions: [providerName],
          doi: attrs.doi || attrs.identifier || null,
          url: attrs.url || `https://osf.io/${d.id}`,
          pdfUrl: attrs.primary_file?.links?.download || null,
          oaStatus: 'open',
          citationCount: null,
          contentLength: abstract?.length || 0,
          hasFullText: !!attrs.primary_file,
          contentQuality: (abstract?.length || 0) >= 500 ? 'good' : 'acceptable',
          issuer: providerName,
          issuerType: 'preprint-server',
          classification: 'preprint',
          language: 'en',
          documentType: 'preprint',
          topics: Array.isArray(subjects) ? subjects.slice(0, 8) : ['preprint'],
          raw: attrs,
        };
      })
      .filter((r: any) => r.title);

    console.log(`[OSF] Found ${results.length} preprints`);
    return results;
  } catch (error: any) {
    console.error(`[OSF] Search failed: ${error.message}`);
    return [];
  }
}
