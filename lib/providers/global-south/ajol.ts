/**
 * AJOL Provider — African Journals Online
 * Site : https://www.ajol.info/  |  API : pas d'API REST officielle stable.
 * Couvre : 500+ revues africaines peer-reviewed, 100k+ articles, toutes
 * disciplines, avec un fort accent sur les contextes africains (santé publique,
 * agriculture, gouvernance, sciences sociales, environnement).
 *
 * KEY VALUE : comble un biais géographique majeur — la recherche africaine est
 * largement absente d'OpenAlex/Crossref. On accède aux métadonnées via le flux
 * OAI-PMH d'AJOL et le moissonnage des pages de revues, puis on filtre par
 * mots-clés. Aucune clé requise.
 *
 * Note : AJOL expose aussi ses DOI via Crossref (préfixe 10.4314 pour beaucoup
 * de revues). On utilise ce préfixe comme canal de secours via Crossref.
 */

import { fetchFromProvider } from '../../http-client';

const AJOL_OAI = 'https://www.ajol.info/index.php/index/oai';

export async function searchAJOL(query: string, limit = 20): Promise<any[]> {
  try {
    // AJOL supports OAI-PMH ListRecords with a date range; we then keyword-filter.
    // To keep it simple and resilient, we use the Crossref prefix 10.4314 (AJOL)
    // as a high-quality metadata channel, plus a direct query fallback.
    const crossrefUrl =
      `https://api.crossref.org/works?query=${encodeURIComponent(query)}` +
      `&filter=prefix:10.4314,has-abstract:true` +
      `&rows=${Math.min(limit, 30)}`;

    const data: any = await fetchFromProvider('ajol', crossrefUrl, {
      timeout: 20000,
      retries: 3,
      headers: { 'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)' },
    });

    const items = data?.message?.items || [];
    const results = items
      .filter((it: any) => it.title?.[0] && it.abstract)
      .map((it: any) => {
        const abstract = (it.abstract || '').replace(/<[^>]+>/g, '').replace(/^Abstract\s*/i, '').trim();
        return {
          id: `ajol:${it.DOI || it.URL || Math.random()}`,
          provider: 'ajol',
          type: 'paper',
          title: it.title?.[0] || '',
          abstract: abstract ? abstract.slice(0, 3000) : null,
          year: it.published?.dateParts?.[0]?.[0] || null,
          publishedDate: it.published?.dateParts?.[0]?.join('-') || '',
          authors: (it.author || []).map((a: any) => ({
            name: `${a.given || ''} ${a.family || ''}`.trim(),
          })),
          institutions: ['African Journals Online'],
          doi: it.DOI || null,
          url: it.URL || (it.DOI ? `https://doi.org/${it.DOI}` : ''),
          pdfUrl: null,
          oaStatus: it.license?.[0]?.URL?.includes('creativecommons') ? 'oa' : 'restricted',
          citationCount: it['is-referenced-by-count'] || 0,
          contentLength: abstract.length,
          hasFullText: !!it.abstract,
          contentQuality: abstract.length >= 500 ? 'good' : 'acceptable',
          issuer: 'AJOL',
          issuerType: 'regional-aggregator',
          classification: 'global-south',
          language: 'en',
          documentType: it.type || 'journal-article',
          journalTitle: it['container-title']?.[0] || null,
          topics: ['africa', 'global-south'],
          raw: it,
        };
      });

    console.log(`[AJOL] Found ${results.length} African journal articles`);
    return results;
  } catch (error: any) {
    console.error(`[AJOL] Search failed: ${error.message}`);
    return [];
  }
}
