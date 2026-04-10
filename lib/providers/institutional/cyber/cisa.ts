/**
 * CISA - Cybersecurity and Infrastructure Security Agency
 * Primary: CISA advisories JSON feed (public-domain, US gov)
 * Fallback: OpenAlex with cyber security concept filter
 */

import axios from 'axios';
import { searchOpenAlex } from '../../openalex';

const BASE_URL = 'https://www.cisa.gov';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com | contact@nomosx.com)';

export async function searchCISA(query: string, limit = 15): Promise<any[]> {
  console.log(`[CISA] Searching advisories for: "${query}"`);
  const q = query.toLowerCase();

  try {
    // CISA JSON advisories feed — best structured source
    const { data } = await axios.get(`${BASE_URL}/sites/default/files/feeds/known_exploited_vulnerabilities.json`, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000,
    });

    const vulns: any[] = data?.vulnerabilities || [];
    const matched = vulns
      .filter((v: any) =>
        v.vulnerabilityName?.toLowerCase().includes(q) ||
        v.shortDescription?.toLowerCase().includes(q) ||
        v.product?.toLowerCase().includes(q) ||
        v.vendorProject?.toLowerCase().includes(q)
      )
      .slice(0, limit);

    if (matched.length > 0) {
      const mapped = matched.map((v: any) => ({
        id: `cisa:${v.cveID}`,
        provider: 'cisa',
        type: 'report',
        title: `${v.cveID}: ${v.vulnerabilityName}`,
        abstract: v.shortDescription || `Known Exploited Vulnerability — ${v.vendorProject} ${v.product}`,
        url: `https://www.cisa.gov/known-exploited-vulnerabilities-catalog`,
        pdfUrl: null,
        year: v.dateAdded ? new Date(v.dateAdded).getFullYear() : new Date().getFullYear(),
        documentType: 'assessment',
        issuer: 'CISA',
        issuerType: 'cyber',
        classification: 'unclassified',
        language: 'en',
        oaStatus: 'public-domain',
        hasFullText: true,
        raw: { source: 'cisa', cveId: v.cveID, searchQuery: query },
      }));
      console.log(`[CISA] KEV feed matched ${mapped.length} vulnerabilities`);
      return mapped;
    }
  } catch {
    // fall through to OpenAlex
  }

  // Fallback: OpenAlex cyber security papers
  try {
    const results = await searchOpenAlex(`${query} cybersecurity`, limit, {
      filter: 'concepts.id:C38652104',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `cisa:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'cisa',
      issuer: 'CISA',
      issuerType: 'cyber',
    }));
    console.log(`[CISA] OpenAlex fallback found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[CISA] Search failed: ${error.message}`);
    return [];
  }
}
