/**
 * RISS Provider — Research Information Service System (Corée du Sud)
 * Site : https://www.riss.kr/  |  API : pas d'API REST publique officielle.
 * Couvre : 14M+ documents académiques coréens — thèses, articles, livres,
 * rapports — issus de 600+ universités et institutions coréennes.
 *
 * KEY VALUE : la recherche coréenne (KCI) est largement absente des bases
 * occidentales. On exploite le préfixe Crossref 10.2322 (RISS/KISTI) comme canal
 * de métadonnées structurées. Aucune clé requise.
 */

import { fetchFromProvider } from '../../http-client';

export async function searchRISS(query: string, limit = 20): Promise<any[]> {
  try {
    // Crossref prefix 10.2322 covers many KISTI/RISS-registered works.
    const crossrefUrl =
      `https://api.crossref.org/works?query=${encodeURIComponent(query)}` +
      `&filter=prefix:10.2322` +
      `&rows=${Math.min(limit, 30)}`;

    const data: any = await fetchFromProvider('riss', crossrefUrl, {
      timeout: 20000,
      retries: 3,
      headers: { 'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)' },
    });

    const items = data?.message?.items || [];
    const results = items
      .filter((it: any) => it.title?.[0])
      .map((it: any) => {
        const abstract = (it.abstract || '').replace(/<[^>]+>/g, '').trim();
        return {
          id: `riss:${it.DOI || it.URL || Math.random()}`,
          provider: 'riss',
          type: 'paper',
          title: it.title?.[0] || '',
          abstract: abstract ? abstract.slice(0, 3000) : null,
          year: it.published?.dateParts?.[0]?.[0] || null,
          publishedDate: it.published?.dateParts?.[0]?.join('-') || '',
          authors: (it.author || []).map((a: any) => ({
            name: `${a.given || ''} ${a.family || ''}`.trim(),
          })),
          institutions: ['RISS (KISTI Korea)'],
          doi: it.DOI || null,
          url: it.URL || (it.DOI ? `https://doi.org/${it.DOI}` : ''),
          pdfUrl: null,
          oaStatus: it.license?.[0]?.URL?.includes('creativecommons') ? 'oa' : 'restricted',
          citationCount: it['is-referenced-by-count'] || 0,
          contentLength: abstract.length,
          hasFullText: !!it.fullTextURL,
          contentQuality: abstract.length >= 500 ? 'good' : 'acceptable',
          issuer: 'RISS',
          issuerType: 'national-repository',
          classification: 'global-south',
          language: 'ko',
          documentType: it.type || 'journal-article',
          journalTitle: it['container-title']?.[0] || null,
          topics: ['korea', 'east-asia'],
          raw: it,
        };
      });

    console.log(`[RISS] Found ${results.length} Korean documents`);
    return results;
  } catch (error: any) {
    console.error(`[RISS] Search failed: ${error.message}`);
    return [];
  }
}
