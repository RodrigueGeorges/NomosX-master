/**
 * ACER — EU Agency for the Cooperation of Energy Regulators
 * Uses EU Open Data Portal + ACER website RSS
 * Provides energy market monitoring reports, grid operation reports
 * Not an OpenAlex wrapper — returns unique sources.
 */

import axios from 'axios';

const ACER_BASE = 'https://www.acer.europa.eu';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com)';

export async function searchACER(query: string, limit = 15): Promise<any[]> {
  console.log(`[ACER] Searching for: "${query}"`);
  const sources: any[] = [];

  try {
    // ACER publications search via their site
    const { data } = await axios.get(`${ACER_BASE}/search`, {
      params: { keyword: query, type: 'publications' },
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' },
      timeout: 15000,
    });

    if (typeof data === 'string') {
      // Parse search results from HTML
      const linkRegex = /<a[^>]*href="\/(publications|documents|reports)\/([^"?#]+)"[^>]*>([^<]+)<\/a>/gi;
      let match: RegExpExecArray | null;
      const seen = new Set<string>();
      while ((match = linkRegex.exec(data)) !== null && sources.length < limit) {
        const section = match[1];
        const slug = match[2];
        const title = match[3].trim();
        const key = `${section}/${slug}`;
        if (title && title.length > 10 && !seen.has(key)) {
          seen.add(key);
          sources.push({
            id: `acer:${key}`,
            provider: 'acer',
            type: 'report',
            title,
            abstract: `ACER ${section} on ${query}`,
            url: `${ACER_BASE}/${section}/${slug}`,
            pdfUrl: null,
            year: new Date().getFullYear(),
            issuer: 'ACER (EU Agency for Energy Regulators)',
            issuerType: 'energy',
            language: 'en',
            oaStatus: 'open',
            hasFullText: false,
            topics: ['energy', 'regulation', 'eu', 'grid'],
            raw: { source: 'acer', section, slug, searchQuery: query },
          });
        }
      }
    }

    // Fallback: try EU Open Data Portal for ACER datasets
    if (sources.length === 0) {
      try {
        const { data: euData } = await axios.get('https://data.europa.eu/api/hub/search/datasets', {
          params: { q: `${query} ACER energy`, limit },
          headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
          timeout: 10000,
        });

        const datasets = euData?.datasets || euData?.results || [];
        for (const ds of datasets.slice(0, limit)) {
          sources.push({
            id: `acer:eu-opendata:${ds.id || ds.name}`,
            provider: 'acer',
            type: 'dataset',
            title: ds.title?.en || ds.title || ds.name || '',
            abstract: ds.description?.en?.slice(0, 500) || `ACER dataset on ${query}`,
            url: ds.landingPage || ds.url || '',
            pdfUrl: null,
            year: ds.modified ? new Date(ds.modified).getFullYear() : null,
            issuer: 'ACER (EU Agency for Energy Regulators)',
            issuerType: 'energy',
            language: 'en',
            oaStatus: 'cc-by',
            hasFullText: true,
            topics: ['energy', 'regulation', 'eu', 'grid'],
            raw: { source: 'acer-eu-opendata', searchQuery: query },
          });
        }
      } catch {
        // Both methods failed
      }
    }

    console.log(`[ACER] Found ${sources.length} publications`);
    return sources;
  } catch (error: any) {
    console.error(`[ACER] Search failed: ${error.message}`);
    return [];
  }
}
