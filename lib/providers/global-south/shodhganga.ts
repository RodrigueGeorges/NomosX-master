/**
 * Shodhganga Provider — Dépôt de thèses indiennes (INFLIBNET)
 * Site : https://shodhganga.inflibnet.ac.in/  |  API : DSpace REST.
 * Couvre : 500 000+ thèses de doctorat indiennes dans toutes les disciplines,
 * déposées par les universités indiennes membres de l'UGC.
 *
 * KEY VALUE : la production académique indienne en sciences humaines et sociales
 * est massivement sous-représentée hors de Shodhganga. Accès au texte intégral
 * pour la plupart des thèses. Aucune clé requise (DSpace REST public).
 */

import { fetchFromProvider } from '../../http-client';

const SHODHGANGA_REST = 'https://shodhganga.inflibnet.ac.in/rest';

export async function searchShodhganga(query: string, limit = 20): Promise<any[]> {
  try {
    // DSpace REST discover endpoint
    const params = new URLSearchParams({
      query: query,
      rows: String(Math.min(limit, 30)),
      sort: 'score,desc',
    });
    const url = `${SHODHGANGA_REST}/discover?${params.toString()}`;

    const data: any = await fetchFromProvider('shodhganga', url, {
      timeout: 25000,
      retries: 2,
    });

    const items = data?.searchResult?.[0]?.objects || data?.objects || [];
    const results = items
      .map((o: any) => {
        const m = o.metadata || {};
        const get = (field: string) => {
          const v = m[field];
          if (!v) return null;
          if (Array.isArray(v)) return v.map((x: any) => x.value || x).join('; ');
          return v.value || v;
        };
        const title = get('dc.title') || 'Shodhganga thesis';
        const abstract = get('dc.description.abstract') || get('dc.description') || null;
        const author = get('dc.contributor.author') || get('dc.contributor.advisor');
        const date = get('dc.date.issued') || get('dc.date.accessioned');
        const year = date ? parseInt(String(date).slice(0, 4)) : null;
        const subject = get('dc.subject');
        const lang = get('dc.language.iso') || 'en';
        const handle = o.handle || o.uuid;

        return {
          id: `shodhganga:${handle || o.uuid || Math.random()}`,
          provider: 'shodhganga',
          type: 'thesis',
          title,
          abstract: abstract ? abstract.slice(0, 3000) : null,
          year,
          publishedDate: date || null,
          authors: author ? author.split(/;\s*/).map((n: string) => ({ name: n.trim() })).filter((n: any) => n) : [],
          institutions: ['INFLIBNET (UGC India)'],
          doi: null,
          url: handle ? `https://shodhganga.inflibnet.ac.in/handle/${handle}` : '',
          pdfUrl: null,
          oaStatus: 'open',
          citationCount: null,
          contentLength: abstract?.length || 0,
          hasFullText: !!handle,
          contentQuality: (abstract?.length || 0) >= 500 ? 'good' : 'acceptable',
          issuer: 'Shodhganga',
          issuerType: 'thesis-repository',
          classification: 'global-south',
          language: lang,
          documentType: 'thesis',
          topics: subject ? subject.split(/;\s*/).slice(0, 8) : ['india', 'thesis'],
          raw: o,
        };
      })
      .filter((r: any) => r.title);

    console.log(`[Shodhganga] Found ${results.length} Indian theses`);
    return results;
  } catch (error: any) {
    console.error(`[Shodhganga] Search failed: ${error.message}`);
    return [];
  }
}
