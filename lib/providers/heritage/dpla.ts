/**
 * DPLA Provider — Digital Public Library of America
 * API : https://api.dp.la/v2/items
 * Couvre : 40M+ objets numériques (images, textes, vidéos, sons) provenant
 * de bibliothèques, archives et musées américains (Library of Congress,
 * Smithsonian, archives d'État, universités...).
 *
 * KEY VALUE : couverture patrimoniale américaine massive — histoire nationale,
 * culture matérielle, archives locales. Complémentaire d'Europeana (EU) et
 * Gallica (FR). Nécessite une clé API gratuite.
 *
 * Obtenir une clé : https://dp.la/info/developers/codex/projects/ (sign-up gratuit)
 */

import { fetchFromProvider } from '../../http-client';
import { env } from '../../env';

const DPLA_API = 'https://api.dp.la/v2/items';

export async function searchDPLA(query: string, limit = 20): Promise<any[]> {
  const apiKey = env.DPLA_API_KEY || process.env.DPLA_API_KEY;
  if (!apiKey) {
    console.warn('[DPLA] No DPLA_API_KEY set — skipping');
    return [];
  }

  try {
    const params = new URLSearchParams({
      api_key: apiKey,
      q: query,
      page_size: String(Math.min(limit, 50)),
    });
    const url = `${DPLA_API}?${params.toString()}`;

    const data: any = await fetchFromProvider('dpla', url, {
      timeout: 20000,
      retries: 3,
    });

    const docs = data?.docs || [];
    const results = docs.map((d: any) => {
      const title = d.sourceResource?.title
        ? (Array.isArray(d.sourceResource.title) ? d.sourceResource.title[0] : d.sourceResource.title)
        : 'DPLA object';
      const description = d.sourceResource?.description
        ? (Array.isArray(d.sourceResource.description) ? d.sourceResource.description.join(' ') : d.sourceResource.description)
        : null;
      const creators = d.sourceResource?.creator
        ? (Array.isArray(d.sourceResource.creator) ? d.sourceResource.creator : [d.sourceResource.creator])
        : [];
      const date = d.sourceResource?.date?.begin || d.sourceResource?.date?.end || null;
      const year = date ? parseInt(String(date).slice(0, 4)) : null;
      const lang = d.sourceResource?.language
        ? (Array.isArray(d.sourceResource.language) ? d.sourceResource.language[0]?.name : d.sourceResource.language?.name)
        : null;
      const subjects = d.sourceResource?.subject
        ? (Array.isArray(d.sourceResource.subject) ? d.sourceResource.subject.map((s: any) => s.name).filter(Boolean) : [d.sourceResource.subject?.name].filter(Boolean))
        : [];

      return {
        id: `dpla:${d.id}`,
        provider: 'dpla',
        type: 'heritage',
        title,
        abstract: description ? description.slice(0, 3000) : null,
        year,
        publishedDate: date || null,
        authors: creators.map((c: string) => ({ name: c })),
        institutions: d.dataProvider ? (Array.isArray(d.dataProvider) ? d.dataProvider : [d.dataProvider]) : [],
        doi: null,
        url: d.isShownAt || d.sourceResource?.uri || `https://dp.la/item/${d.id}`,
        pdfUrl: null,
        imageUrl: d.object || null,
        oaStatus: 'open',
        citationCount: null,
        contentLength: description?.length || 0,
        hasFullText: !!d.isShownAt,
        contentQuality: (description?.length || 0) >= 500 ? 'good' : 'acceptable',
        issuer: 'DPLA',
        issuerType: 'digital-library',
        classification: 'heritage',
        language: lang || 'en',
        documentType: d.sourceResource?.type?.[0]?.name || 'object',
        topics: subjects.slice(0, 8),
        country: 'US',
        raw: d,
      };
    }).filter((r: any) => r.title);

    console.log(`[DPLA] Found ${results.length} heritage objects`);
    return results;
  } catch (error: any) {
    console.error(`[DPLA] Search failed: ${error.message}`);
    return [];
  }
}
