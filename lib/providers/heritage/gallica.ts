/**
 * Gallica (BnF) Provider — Bibliothèque nationale de France
 * API SRU : https://gallica.bnf.fr/SRU
 * Couvre : millions de documents numérisés — livres, manuscrits, presse ancienne,
 * cartes, images, périodiques — du Moyen Âge au XXIe siècle.
 *
 * KEY VALUE : source francophone incontournable pour l'histoire, la littérature,
 * les humanités classiques et le patrimoine culturel. Gratuit, sans clé.
 *
 * Référence API : https://api.bnf.fr/fr/api-gallica-de-recherche-sru
 */

import { fetchFromProvider } from '../../http-client';

const GALLICA_SRU = 'https://gallica.bnf.fr/SRU';

export async function searchGallica(query: string, limit = 20): Promise<any[]> {
  try {
    // CQL query on the "gallica" index set; dc:title, dc:creator, dc:subject all
    // map to the same record fields. We search across the general "anywhere" index.
    const cql = `(gallica all "${query.replace(/"/g, '')}")`;
    const url =
      `${GALLICA_SRU}?operation=searchRetrieve` +
      `&version=1.2` +
      `&query=${encodeURIComponent(cql)}` +
      `&maximumRecords=${Math.min(limit, 50)}` +
      `&recordSchema=dc`;

    const xml: string = await fetchFromProvider('gallica', url, {
      timeout: 20000,
      retries: 3,
    });

    if (typeof xml !== 'string') return [];

    // Lightweight XML extraction (avoid pulling a full XML parser dependency).
    // Gallica returns Dublin Core records inside <srw:recordData>.
    const records = xml.split('<srw:recordData>').slice(1);

    const results = records.map((block, i) => {
      const get = (tag: string) => {
        const m = block.match(new RegExp(`<dc:${tag}[^>]*>([\\s\\S]*?)</dc:${tag}>`, 'i'));
        return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim() : null;
      };
      const title = get('title');
      const creator = get('creator');
      const subject = get('subject');
      const description = get('description');
      const date = get('date');
      const identifier = get('identifier');
      const publisher = get('publisher');
      const type = get('type');
      const language = get('language');

      // Extract the ark / Gallica viewer URL
      const arkMatch = block.match(/ark:\/12148\/[A-Za-z0-9]+/);
      const gallicaUrl = arkMatch
        ? `https://gallica.bnf.fr/ark:/12148/${arkMatch[0].split('/').pop()}`
        : identifier || null;

      const abstract = description || subject || null;
      const yearMatch = (date || '').match(/(\d{4})/);
      const year = yearMatch ? parseInt(yearMatch[1]) : null;

      return {
        id: `gallica:${arkMatch?.[0] || `rec${i}`}`,
        provider: 'gallica',
        type: 'book',
        title: title || 'Document Gallica',
        abstract: abstract ? abstract.slice(0, 3000) : null,
        year,
        publishedDate: date || null,
        authors: creator ? creator.split(/;\s*|\s*,\s*/).map((n: string) => ({ name: n.trim() })).filter((n: any) => n.name) : [],
        institutions: ['BnF'],
        doi: null,
        url: gallicaUrl || '',
        pdfUrl: gallicaUrl ? `${gallicaUrl}.pdf` : null,
        oaStatus: 'open',
        citationCount: null,
        contentLength: abstract?.length || 0,
        hasFullText: !!gallicaUrl,
        contentQuality: (abstract?.length || 0) >= 500 ? 'good' : 'acceptable',
        issuer: 'BnF Gallica',
        issuerType: 'national-library',
        classification: 'heritage',
        language: language || 'fr',
        documentType: type || 'book',
        topics: subject ? [subject] : ['history', 'heritage'],
        raw: { source: 'gallica', ark: arkMatch?.[0] },
      };
    }).filter((r: any) => r.title && r.url);

    console.log(`[Gallica] Found ${results.length} documents`);
    return results;
  } catch (error: any) {
    console.error(`[Gallica] Search failed: ${error.message}`);
    return [];
  }
}
