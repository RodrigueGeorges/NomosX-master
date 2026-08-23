/**
 * IETF Datatracker Provider — RFCs and Internet-Drafts
 *
 * Free, no API key required. The IETF Datatracker is the official repository
 * for Internet Engineering Task Force documents: RFCs (standards), active
 * and expired Internet-Drafts, working group documents, and IESG ballots.
 *
 * KEY VALUE: Technical standards and governance documents for the internet.
 * Covers: networking protocols, security (TLS, IPsec, OAuth), AI/ML standards,
 * IoT, 5G, privacy, cryptography, internet governance. Important for policy
 * research touching digital infrastructure, cybersecurity, and tech regulation.
 *
 * API: https://datatracker.ietf.org/api/v1/doc/document/
 *       ?title__icontains={query}&type__in=rfc,draft&limit={limit}&format=json
 * Docs: https://datatracker.ietf.org/api/
 */

import { fetchFromProvider } from '../http-client';

export async function searchIETF(query: string, limit = 15): Promise<any[]> {
  try {
    // Tokenize query: longest token → title filter, second longest → abstract filter
    const tokens = query.split(/\s+/).filter(t => t.length >= 3).sort((a, b) => b.length - a.length);
    const primaryToken = tokens[0] || query;
    const secondaryToken = tokens[1] || null;

    let url = `https://datatracker.ietf.org/api/v1/doc/document/?title__icontains=${encodeURIComponent(primaryToken)}&type__in=rfc,draft&limit=${Math.min(limit * 3, 50)}&format=json`;
    if (secondaryToken) {
      url += `&abstract__icontains=${encodeURIComponent(secondaryToken)}`;
    }

    const data: any = await fetchFromProvider('ietf', url, {
      timeout: 15000,
      retries: 1,
      headers: { 'Accept': 'application/json' },
    });

    const items = data?.results || [];
    console.log(`[IETF] Found ${items.length} documents`);

    // Filter remaining tokens locally (3rd+ tokens)
    const extraTokens = tokens.slice(2);
    const filtered = extraTokens.length === 0 ? items : items.filter((doc: any) => {
      const titleLc = (doc.title || '').toLowerCase();
      const abstractLc = (doc.abstract || '').toLowerCase();
      return extraTokens.every(t => titleLc.includes(t.toLowerCase()) || abstractLc.includes(t.toLowerCase()));
    });

    return filtered.slice(0, limit).map((doc: any) => {
      const name = doc.name || '';
      const isRFC = name.startsWith('rfc');
      const docType = isRFC ? 'rfc' : 'internet-draft';
      const rfcNumber = isRFC ? name.replace('rfc', '') : null;
      const year = doc.time ? new Date(doc.time).getFullYear() : null;

      return {
        id: `ietf:${name}`,
        provider: 'ietf',
        type: 'standard',
        title: doc.title || 'Untitled',
        abstract: doc.abstract || null,
        doi: null,
        year: year && !isNaN(year) ? year : null,
        publishedDate: doc.time || null,
        authors: (doc.authors || []).map((a: any) => ({
          name: a?.person?.name || a?.name || '',
        })),
        institutions: ['IETF'],
        citationCount: 0,
        qualityScore: isRFC ? 80 : 55, // RFCs are ratified standards
        oaStatus: 'open',
        hasFullText: true,
        documentType: docType,
        issuer: 'IETF',
        issuerType: 'standards-body',
        classification: 'academic',
        language: 'en',
        contentFormat: 'text',
        url: rfcNumber ? `https://www.rfc-editor.org/rfc/rfc${rfcNumber}.html` : `https://datatracker.ietf.org/doc/${name}/`,
        pdfUrl: rfcNumber ? `https://www.rfc-editor.org/rfc/rfc${rfcNumber}.pdf` : null,
        rfcNumber,
        status: doc.states?.map((s: any) => s?.name).filter(Boolean).join(', ') || null,
        raw: doc,
      };
    });
  } catch (err: any) {
    console.warn(`[IETF] Error: ${err.message}`);
    return [];
  }
}
