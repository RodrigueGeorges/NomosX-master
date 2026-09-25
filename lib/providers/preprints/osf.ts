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

import { fetchFromProvider, httpPost } from '../../http-client';
import { searchOpenAlex } from '../openalex';

// api.osf.io/v2/search/ was deprecated (404). SHARE indexes all OSF-hosted
// preprints (SocArXiv, PsyArXiv, EarthArXiv…) via an Elasticsearch endpoint.
const SHARE_SEARCH = 'https://share.osf.io/api/v2/search/creativeworks/_search';

export async function searchOSF(query: string, limit = 20): Promise<any[]> {
  try {
    const data: any = await httpPost(SHARE_SEARCH, {
      query: { query_string: { query, default_field: '*' } },
      size: Math.min(limit, 50),
      from: 0,
    }, {
      timeout: 20000,
      retries: 2,
      rateLimiterKey: 'osf',
    });

    const hits = data?.hits?.hits || [];
    const results = hits
      .map((h: any) => {
        const s = h._source || {};
        const title = s.title || null;
        const abstract = s.description || s.abstract || null;
        const dateStr = s.date_published || s.date_created || s.date_updated || null;
        const year = dateStr ? parseInt(String(dateStr).slice(0, 4)) : null;
        const authors = (s.contributors || s.creators || [])
          .map((c: any) => ({ name: c.name || c.cited_name || null }))
          .filter((a: any) => a.name);
        const sources = (s.sources || []).filter(Boolean);
        const providerName = sources.find((p: string) => p !== 'OSF') || 'OSF';
        const identifiers = s.identifiers || [];
        const doi = identifiers.find((i: string) => String(i).includes('doi.org')) || s.doi || null;
        const url = identifiers.find((i: string) => String(i).startsWith('http') && !String(i).includes('doi.org'))
          || identifiers[0] || (s.id ? `https://osf.io/${s.id}` : null);

        return {
          id: `osf:${h._id || s.id}`,
          provider: 'osf',
          type: 'preprint',
          title,
          abstract: abstract ? String(abstract).slice(0, 3000) : null,
          year,
          publishedDate: dateStr,
          authors,
          institutions: [providerName],
          doi,
          url,
          pdfUrl: null,
          oaStatus: 'open',
          citationCount: null,
          contentLength: abstract?.length || 0,
          hasFullText: true,
          contentQuality: (abstract?.length || 0) >= 500 ? 'good' : 'acceptable',
          issuer: providerName,
          issuerType: 'preprint-server',
          classification: 'preprint',
          language: 'en',
          documentType: 'preprint',
          topics: (s.tags || s.subjects || []).slice(0, 8),
          raw: s,
        };
      })
      .filter((r: any) => r.title);

    console.log(`[OSF] Found ${results.length} preprints (SHARE)`);
    if (results.length > 0) return results;
  } catch (error: any) {
    console.error(`[OSF] SHARE search failed: ${error.message}`);
  }

  // Fallback: OSF/SocArXiv/PsyArXiv preprints are partially indexed in OpenAlex
  try {
    const results = await searchOpenAlex(query, Math.min(limit, 25), {
      filter: 'type:preprint',
    });
    console.log(`[OSF] OpenAlex fallback found ${results.length} preprints`);
    return results.map((r: any) => ({
      ...r,
      id: `osf:${String(r.id).replace('https://openalex.org/', '')}`,
      provider: 'osf',
      type: 'preprint',
    }));
  } catch (error: any) {
    console.error(`[OSF] OpenAlex fallback failed: ${error.message}`);
    return [];
  }
}
