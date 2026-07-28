/**
 * Bruegel — Brussels-based European economic think tank
 * Uses Bruegel website search + RSS feed
 * Provides policy briefs, working papers on European economics, energy, tech
 * Not an OpenAlex wrapper — returns unique sources.
 */

import axios from 'axios';

const BRUEGEL_BASE = 'https://www.bruegel.org';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com)';

export async function searchBruegel(query: string, limit = 15): Promise<any[]> {
  console.log(`[Bruegel] Searching for: "${query}"`);
  const sources: any[] = [];

  try {
    // Bruegel search endpoint
    const { data } = await axios.get(`${BRUEGEL_BASE}/search`, {
      params: { keys: query },
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' },
      timeout: 15000,
    });

    if (typeof data === 'string') {
      // Parse search results
      const articleRegex = /<a[^>]*href="\/(publication|analysis|policy-brief|working-paper)\/([^"?#]+)"[^>]*>[\s\S]*?<h[234][^>]*>([^<]+)<\/h[234]>/gi;
      let match: RegExpExecArray | null;
      const seen = new Set<string>();
      while ((match = articleRegex.exec(data)) !== null && sources.length < limit) {
        const section = match[1];
        const slug = match[2];
        const title = match[3].trim();
        const key = `${section}/${slug}`;
        if (title && title.length > 10 && !seen.has(key)) {
          seen.add(key);
          sources.push({
            id: `bruegel:${key}`,
            provider: 'bruegel',
            type: 'report',
            title,
            abstract: `Bruegel ${section} on ${query}`,
            url: `${BRUEGEL_BASE}/${section}/${slug}`,
            pdfUrl: null,
            year: new Date().getFullYear(),
            issuer: 'Bruegel',
            issuerType: 'think-tank',
            language: 'en',
            oaStatus: 'cc-by',
            hasFullText: false,
            topics: ['economics', 'europe', 'policy'],
            raw: { source: 'bruegel', section, slug, searchQuery: query },
          });
        }
      }
    }

    // Fallback: try Bruegel API (if available)
    if (sources.length === 0) {
      try {
        const { data: apiData } = await axios.get(`${BRUEGEL_BASE}/api/publications`, {
          params: { search: query, limit },
          headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
          timeout: 10000,
        }).catch(() => ({ data: null }));

        if (apiData?.results || apiData?.publications) {
          const items = apiData.results || apiData.publications;
          for (const item of items.slice(0, limit)) {
            sources.push({
              id: `bruegel:${item.id || item.slug}`,
              provider: 'bruegel',
              type: 'report',
              title: item.title || '',
              abstract: item.summary?.slice(0, 500) || `Bruegel publication on ${query}`,
              url: item.url || `${BRUEGEL_BASE}/publication/${item.slug}`,
              pdfUrl: item.pdfUrl || null,
              year: item.date ? new Date(item.date).getFullYear() : null,
              issuer: 'Bruegel',
              issuerType: 'think-tank',
              language: 'en',
              oaStatus: 'cc-by',
              hasFullText: false,
              topics: item.tags || ['economics', 'europe'],
              raw: { source: 'bruegel', searchQuery: query },
            });
          }
        }
      } catch {
        // Both methods failed
      }
    }

    console.log(`[Bruegel] Found ${sources.length} publications`);
    return sources;
  } catch (error: any) {
    console.error(`[Bruegel] Search failed: ${error.message}`);
    return [];
  }
}
