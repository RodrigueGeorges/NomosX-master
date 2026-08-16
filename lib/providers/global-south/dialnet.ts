/**
 * Dialnet Provider — Portail scientifique hispanophone (Université de La Rioja)
 * Site : https://dialnet.unirioja.es/  |  API : Dialnet Métricas + recherche web.
 * Couvre : 8 000+ revues espagnoles et ibéro-américaines, 1,5M+ articles, thèses,
 * livres, congrès — sciences humaines et sociales surtout (droit, histoire,
 * philologie, philosophie, économie).
 *
 * KEY VALUE : couverture ibérique et latino-américaine en sciences humaines que
 * les bases anglophones sous-représentent fortement. Pas d'API REST officielle
 * publique stable ; on passe par le préfixe Crossref 10.33368 (Dialnet) et la
 * recherche web en secours. Aucune clé requise.
 */

import { fetchFromProvider } from '../../http-client';

export async function searchDialnet(query: string, limit = 20): Promise<any[]> {
  try {
    // Crossref prefix 10.33368 covers many Dialnet-registered works.
    const crossrefUrl =
      `https://api.crossref.org/works?query=${encodeURIComponent(query)}` +
      `&filter=prefix:10.33368` +
      `&rows=${Math.min(limit, 30)}`;

    const data: any = await fetchFromProvider('dialnet', crossrefUrl, {
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
          id: `dialnet:${it.DOI || it.URL || Math.random()}`,
          provider: 'dialnet',
          type: 'paper',
          title: it.title?.[0] || '',
          abstract: abstract ? abstract.slice(0, 3000) : null,
          year: it.published?.dateParts?.[0]?.[0] || null,
          publishedDate: it.published?.dateParts?.[0]?.join('-') || '',
          authors: (it.author || []).map((a: any) => ({
            name: `${a.given || ''} ${a.family || ''}`.trim(),
          })),
          institutions: ['Dialnet (Univ. La Rioja)'],
          doi: it.DOI || null,
          url: it.URL || (it.DOI ? `https://doi.org/${it.DOI}` : ''),
          pdfUrl: null,
          oaStatus: it.license?.[0]?.URL?.includes('creativecommons') ? 'oa' : 'restricted',
          citationCount: it['is-referenced-by-count'] || 0,
          contentLength: abstract.length,
          hasFullText: !!it.fullTextURL,
          contentQuality: abstract.length >= 500 ? 'good' : 'acceptable',
          issuer: 'Dialnet',
          issuerType: 'regional-aggregator',
          classification: 'global-south',
          language: 'es',
          documentType: it.type || 'journal-article',
          journalTitle: it['container-title']?.[0] || null,
          topics: ['iberia', 'latin-america', 'humanities'],
          raw: it,
        };
      });

    console.log(`[Dialnet] Found ${results.length} Iberian/LatAm articles`);
    return results;
  } catch (error: any) {
    console.error(`[Dialnet] Search failed: ${error.message}`);
    return [];
  }
}
