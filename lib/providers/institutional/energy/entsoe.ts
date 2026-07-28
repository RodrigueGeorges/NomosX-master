/**
 * ENTSO-E — European Network of Transmission System Operators for Electricity
 * Transparency Platform API: https://transparency.entsoe.eu/
 * API docs: https://transparency.entsoe.eu/content/static_content/Static%20content/web%20api%20api%20key%20guide.html
 *
 * This provider searches ENTSO-E publications and reports via their public API.
 * No API key required for basic document search.
 */

import axios from 'axios';

const API_BASE = 'https://transparency.entsoe.eu/api';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com)';

export async function searchENTSOE(query: string, limit = 15): Promise<any[]> {
  console.log(`[ENTSO-E] Searching for: "${query}"`);
  try {
    // ENTSO-E doesn't have a direct search API, but we can use their publication endpoint
    // and also search via their transparency platform documents
    const { data } = await axios.get(`${API_BASE}/documents`, {
      params: {
        q: query,
        limit,
      },
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      timeout: 15000,
    }).catch(() => ({ data: null }));

    // Fallback: search ENTSO-E news and publications via web scrape of their public pages
    if (!data) {
      const pubResponse = await axios.get('https://www.entsoe.eu/news/', {
        params: { s: query },
        headers: { 'User-Agent': USER_AGENT },
        timeout: 15000,
      }).catch(() => ({ data: null as string | null }));

      if (pubResponse.data && typeof pubResponse.data === 'string') {
        // Extract article links from ENTSO-E news page
        const articleRegex = /<article[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
        const results: any[] = [];
        let match: RegExpExecArray | null;
        while ((match = articleRegex.exec(pubResponse.data)) !== null && results.length < limit) {
          const url = match[1].startsWith('http') ? match[1] : `https://www.entsoe.eu${match[1]}`;
          const title = match[2].trim();
          if (title && title.length > 10) {
            results.push({
              id: `entsoe:${Buffer.from(url).toString('base64').slice(0, 20)}`,
              provider: 'entsoe',
              type: 'report',
              title,
              abstract: `ENTSO-E publication on European electricity transmission: ${query}`,
              url,
              pdfUrl: null,
              year: new Date().getFullYear(),
              issuer: 'ENTSO-E',
              issuerType: 'government',
              language: 'en',
              oaStatus: 'open',
              hasFullText: false,
              topics: ['electricity', 'grid', 'transmission', 'europe', 'energy'],
              raw: { source: 'entsoe', searchQuery: query },
            });
          }
        }
        console.log(`[ENTSO-E] Found ${results.length} publications`);
        return results;
      }
    }

    console.log(`[ENTSO-E] Found 0 publications`);
    return [];
  } catch (error: any) {
    console.error(`[ENTSO-E] Search failed: ${error.message}`);
    return [];
  }
}
