/**
 * Persée Provider — SHS francophones historiques
 * Persée.fr has no public REST API. We use HAL (Hyper Articles en Ligne) filtered to
 * French SHS disciplines: shs.hist, shs.socio, shs.geo, shs.archeo, shs.langue, shs.scipo.
 * HAL covers 1M+ French academic publications with open access full text.
 * API: https://api.archives-ouvertes.fr/search/
 * Gratuite, sans clé.
 */

import { fetchFromProvider } from '../http-client';

export async function searchPersee(query: string, limit = 20): Promise<any[]> {
  // HAL filtered to French SHS disciplines (equivalent to Persée coverage)
  const shsDomains = 'shs.hist OR shs.socio OR shs.geo OR shs.archeo OR shs.langue OR shs.scipo OR shs.anthro-se';
  const url = `https://api.archives-ouvertes.fr/search/?q=${encodeURIComponent(query)}&fq=domain_t:(${encodeURIComponent(shsDomains)})&fl=docid,title_s,abstract_s,authFullName_s,publicationDateY_i,doiId_s,language_s,keyword_s,journalTitle_s,uri_s&rows=${Math.min(limit, 30)}&wt=json&sort=score+desc`;

  try {
    const data: any = await fetchFromProvider('persee', url, { timeout: 15000, retries: 3 });
    const docs: any[] = data?.response?.docs || [];

    const results = docs
      .filter((d: any) => (d.title_s || d.title_display) && d.abstract_s)
      .map((d: any) => {
        const title = Array.isArray(d.title_s) ? d.title_s[0] : (d.title_s || '');
        const abstract = Array.isArray(d.abstract_s) ? d.abstract_s[0] : (d.abstract_s || null);
        const authors = Array.isArray(d.authFullName_s) ? d.authFullName_s : (d.authFullName_s ? [d.authFullName_s] : []);
        const docId = d.docid || '';
        const uri = Array.isArray(d.uri_s) ? d.uri_s[0] : d.uri_s;

        return {
          id: `persee:${docId}`,
          provider: 'persee',
          type: 'paper',
          title: String(title).replace(/<[^>]+>/g, '').trim(),
          abstract: abstract ? String(abstract).replace(/<[^>]+>/g, '').slice(0, 3000) : null,
          year: d.publicationDateY_i ? parseInt(d.publicationDateY_i) : null,
          doi: Array.isArray(d.doiId_s) ? d.doiId_s[0] : (d.doiId_s || null),
          url: uri || (docId ? `https://hal.science/${docId}` : null),
          pdfUrl: null,
          oaStatus: 'oa',
          authors: authors.map((name: string) => ({ name: String(name).trim() })).filter((a: any) => a.name),
          institutions: [],
          topics: Array.isArray(d.keyword_s) ? d.keyword_s.slice(0, 5) : [],
          jelCodes: [],
          citationCount: null,
          issuer: 'HAL-SHS (Persée)',
          issuerType: 'shs',
          language: Array.isArray(d.language_s) ? d.language_s[0] : (d.language_s || 'fr'),
          journalTitle: d.journalTitle_s || null,
          raw: d,
        };
      })
      .filter((r: any) => r.title.length > 3 && r.abstract);

    console.log(`[Persée] Found ${results.length} French SHS documents`);
    return results;
  } catch (error: any) {
    console.error(`[Persée] Search failed: ${error.message}`);
    return [];
  }
}
