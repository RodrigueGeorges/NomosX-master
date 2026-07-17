/**
 * ISIDORE Provider — Sciences Humaines et Sociales (SHS)
 * 9M+ documents: articles, thèses, rapports en SHS francophones et internationaux.
 * API: https://api.isidore.science/
 * Gratuite, sans clé. Couvre: histoire, sociologie, philosophie, géographie, anthropologie.
 */

import { fetchFromProvider } from '../http-client';

export async function searchISIDORE(query: string, limit = 20): Promise<any[]> {
  const url = `https://api.isidore.science/resource/search?q=${encodeURIComponent(query)}&rows=${Math.min(limit, 30)}&output=json`;

  try {
    const data: any = await fetchFromProvider('isidore', url, { timeout: 15000, retries: 3 });
    // Real structure: data.response.replies.content.reply[]
    const content = data?.response?.replies?.content;
    const rawItems: any[] = Array.isArray(content?.reply) ? content.reply : (content?.reply ? [content.reply] : []);

    const results = rawItems
      .map((item: any) => {
        const isidore = item.isidore || {};
        // Title: array with strings and objects, last plain string is usually the main one
        const titleArr: any[] = Array.isArray(isidore.title) ? isidore.title : (isidore.title ? [isidore.title] : []);
        const title = titleArr.find((t: any) => typeof t === 'string') || titleArr.find((t: any) => t?.['$'])?.['$'] || '';

        const abstract = isidore.abstract ? String(isidore.abstract).replace(/<[^>]+>/g, '').slice(0, 3000) : null;

        const docUrl = isidore.url || isidore.ore?.aggregates?.[0]?.['$'] || null;

        const dateRaw = isidore.date?.year || isidore.date?.normalizedDate;
        const year = dateRaw ? parseInt(String(dateRaw).slice(0, 4)) : null;

        const creators = isidore.enrichedCreators?.creator;
        const creatorsArr: any[] = Array.isArray(creators) ? creators : (creators ? [creators] : []);
        const authors = creatorsArr
          .map((c: any) => ({ name: c['@normalizedAuthor'] || c['@origin'] || `${c.firstname || ''} ${c.lastname || ''}`.trim() }))
          .filter((a: any) => a.name && a.name.length > 1);

        const subjects = isidore.subjects?.subject;
        const topics: string[] = Array.isArray(subjects) ? subjects.slice(0, 6) : (subjects ? [String(subjects)] : []);

        const itemUri = item['@uri'] || '';

        return {
          id: `isidore:${itemUri || Math.random().toString(36).slice(2)}`,
          provider: 'isidore',
          type: 'paper',
          title: String(title).replace(/<[^>]+>/g, '').trim(),
          abstract,
          year,
          doi: null,
          url: docUrl ? String(docUrl) : null,
          pdfUrl: null,
          oaStatus: 'oa',
          authors,
          institutions: [],
          topics,
          jelCodes: [],
          citationCount: null,
          issuer: 'ISIDORE (SHS)',
          issuerType: 'shs',
          language: isidore.source?.type === 'Article' ? 'fr' : 'fr',
          raw: item,
        };
      })
      .filter((r: any) => r.title && r.title.length > 3 && r.abstract);

    console.log(`[ISIDORE] Found ${results.length} SHS documents`);
    return results;
  } catch (error: any) {
    console.error(`[ISIDORE] Search failed: ${error.message}`);
    return [];
  }
}
