/**
 * chemRxiv Provider — Preprint server for chemistry (ACS, RSC, German Bunsen Soc., ...)
 * API : https://chemrxiv.org/engage/chemrxiv/public-api/v1/items/search
 * Couvre : 10 000+ preprints en chimie et domaines connexes (matériaux,
 * chimie verte, catalyse, chimie computationnelle, nanochimie).
 *
 * KEY VALUE : seul préprint server majeur en chimie ; bioRxiv/medRxiv ne couvrent
 * pas la chimie fondamentale. Gratuit, sans clé.
 */

import { fetchFromProvider } from '../../http-client';

const CHEMRXIV_SEARCH = 'https://chemrxiv.org/engage/chemrxiv/public-api/v1/items/search';

export async function searchChemRxiv(query: string, limit = 20): Promise<any[]> {
  try {
    const url = `${CHEMRXIV_SEARCH}?term=${encodeURIComponent(query)}&limit=${Math.min(limit, 50)}&sort=score+desc`;
    const data: any = await fetchFromProvider('chemrxiv', url, {
      timeout: 20000,
      retries: 3,
    });

    const items = data?.itemHits || [];
    const results = items
      .map((h: any) => {
        const it = h.item || {};
        const authors = (it.authors || []).map((a: any) => ({
          name: a.fullName || `${a.firstName || ''} ${a.lastName || ''}`.trim(),
          orcid: a.orcid || null,
          institution: a.institutions?.[0]?.name || null,
        }));
        const abstract = it.abstract || null;
        const year = it.publicationDate ? parseInt(String(it.publicationDate).slice(0, 4)) : null;
        const doi = it.doi || null;
        const pdfUrl = it.asset?.originalFile?.downloadUrl || null;

        return {
          id: `chemrxiv:${it.id || doi || Math.random()}`,
          provider: 'chemrxiv',
          type: 'preprint',
          title: it.title || '',
          abstract: abstract ? abstract.slice(0, 3000) : null,
          year,
          publishedDate: it.publicationDate || null,
          authors,
          institutions: ['chemRxiv'],
          doi,
          url: doi ? `https://doi.org/${doi}` : `https://chemrxiv.org/engage/chemrxiv/article-details/${it.id}`,
          pdfUrl,
          oaStatus: 'open',
          citationCount: null,
          contentLength: abstract?.length || 0,
          hasFullText: !!pdfUrl,
          contentQuality: (abstract?.length || 0) >= 500 ? 'good' : 'acceptable',
          issuer: 'chemRxiv',
          issuerType: 'preprint-server',
          classification: 'preprint',
          language: 'en',
          documentType: 'preprint',
          topics: ['chemistry', 'preprint'],
          raw: it,
        };
      })
      .filter((r: any) => r.title);

    console.log(`[chemRxiv] Found ${results.length} chemistry preprints`);
    return results;
  } catch (error: any) {
    console.error(`[chemRxiv] Search failed: ${error.message}`);
    return [];
  }
}
