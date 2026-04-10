/**
 * NIST - National Institute of Standards and Technology
 * Primary: NIST CSRC JSON API for cybersecurity publications
 * Fallback: OpenAlex with NIST ROR filter (05xpvk416)
 */

import axios from 'axios';
import { searchOpenAlex } from '../../openalex';

const CSRC_API = 'https://csrc.nist.gov/api/publications';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com | contact@nomosx.com)';

export async function searchNIST(query: string, limit = 15): Promise<any[]> {
  console.log(`[NIST] Searching CSRC API for: "${query}"`);
  try {
    // NIST CSRC publications search API
    const { data } = await axios.get(CSRC_API, {
      params: { keywords: query, ipp: limit, pg: 1 },
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      timeout: 15000,
    });

    const items: any[] = data?.publications || data?.data || [];
    if (items.length > 0) {
      const mapped = items.slice(0, limit).map((pub: any) => ({
        id: `nist:${pub.doi || pub.id || pub.url}`,
        provider: 'nist',
        type: 'report',
        title: pub.title || '',
        abstract: pub.abstract || `NIST publication on ${query}`,
        url: pub.url || `https://csrc.nist.gov/publications/detail/${pub.series?.toLowerCase() || 'sp'}/${pub.docIdentifier || ''}`,
        pdfUrl: pub.pdfUrl || null,
        year: pub.publicationDate ? new Date(pub.publicationDate).getFullYear() : new Date().getFullYear(),
        doi: pub.doi || null,
        authors: (pub.authors || []).map((a: any) => ({ name: a.authorName || a.name || '' })),
        documentType: 'report',
        issuer: 'NIST',
        issuerType: 'cyber',
        classification: 'unclassified',
        language: 'en',
        oaStatus: 'public-domain',
        hasFullText: true,
        raw: { source: 'nist', searchQuery: query },
      }));
      console.log(`[NIST] CSRC API found ${mapped.length} publications`);
      return mapped;
    }
  } catch {
    // fall through to OpenAlex
  }

  // Fallback: OpenAlex ROR filter
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/05xpvk416',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `nist:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'nist',
      issuer: 'NIST',
      issuerType: 'cyber',
    }));
    console.log(`[NIST] OpenAlex fallback found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[NIST] Search failed: ${error.message}`);
    return [];
  }
}
