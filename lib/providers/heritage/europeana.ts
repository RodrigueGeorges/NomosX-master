/**
 * Europeana Provider — European cultural heritage aggregator
 * API : https://api.europeana.eu/record/v2/search.json
 * Couvre : 50M+ objets du patrimoine culturel européen agrégés depuis
 * 3000+ institutions (musées, bibliothèques, archives, galeries) de toute l'Europe.
 * Images, textes, sons, vidéos — du Moyen Âge à nos jours.
 *
 * KEY VALUE : couverture patrimoniale paneuropéenne multilingue, complémentaire
 * de Gallica (FR) et DPLA (US). Nécessite une clé API gratuite.
 *
 * Obtenir une clé : https://api.europeana.eu/ (sign-up gratuit)
 */

import { fetchFromProvider } from '../../http-client';
import { env } from '../../env';

const EUROPEANA_API = 'https://api.europeana.eu/record/v2/search.json';

export async function searchEuropeana(query: string, limit = 20): Promise<any[]> {
  const wskey = env.EUROPEANA_API_KEY || process.env.EUROPEANA_API_KEY;
  if (!wskey) {
    console.warn('[Europeana] No EUROPEANA_API_KEY set — skipping');
    return [];
  }

  try {
    const params = new URLSearchParams({
      wskey,
      query,
      rows: String(Math.min(limit, 40)),
      profile: 'rich',
      reusability: 'open',
    });
    const url = `${EUROPEANA_API}?${params.toString()}`;

    const data: any = await fetchFromProvider('europeana', url, {
      timeout: 20000,
      retries: 3,
    });

    const items = data?.items || [];
    const results = items.map((item: any) => {
      const title = Array.isArray(item.title) ? item.title[0] : item.title || 'Europeana object';
      const description = Array.isArray(item.dcDescription) ? item.dcDescription.join(' ') : item.dcDescription || null;
      const creators = Array.isArray(item.dcCreator) ? item.dcCreator : (item.dcCreator ? [item.dcCreator] : []);
      const year = item.year || (item.timestamp_created ? parseInt(String(item.timestamp_created).slice(0, 4)) : null);
      const lang = Array.isArray(item.language) ? item.language[0] : item.language || null;
      const edmPreview = Array.isArray(item.edmPreview) ? item.edmPreview[0] : item.edmPreview || null;
      const rights = Array.isArray(item.rights) ? item.rights[0] : item.rights || null;

      return {
        id: `europeana:${item.id}`,
        provider: 'europeana',
        type: 'heritage',
        title,
        abstract: description ? description.slice(0, 3000) : null,
        year,
        publishedDate: item.timestamp ? new Date(parseInt(String(item.timestamp))) : null,
        authors: creators.map((c: string) => ({ name: c })),
        institutions: item.dataProvider ? (Array.isArray(item.dataProvider) ? item.dataProvider : [item.dataProvider]) : [],
        doi: null,
        url: item.guid || item.link || `https://www.europeana.eu/item/${item.id}`,
        pdfUrl: null,
        imageUrl: edmPreview,
        oaStatus: rights?.includes('open') || rights?.includes('cc') ? 'open' : 'restricted',
        citationCount: null,
        contentLength: description?.length || 0,
        hasFullText: !!item.isShownBy || !!item.isShownAt,
        contentQuality: (description?.length || 0) >= 500 ? 'good' : 'acceptable',
        issuer: 'Europeana',
        issuerType: 'cultural-aggregator',
        classification: 'heritage',
        language: lang || 'en',
        documentType: item.type || 'object',
        topics: Array.isArray(item.dcSubject) ? item.dcSubject.slice(0, 8) : [],
        country: Array.isArray(item.country) ? item.country[0] : item.country || null,
        raw: item,
      };
    }).filter((r: any) => r.title);

    console.log(`[Europeana] Found ${results.length} heritage objects`);
    return results;
  } catch (error: any) {
    console.error(`[Europeana] Search failed: ${error.message}`);
    return [];
  }
}
